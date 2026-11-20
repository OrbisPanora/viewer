/**
 * Drives the viewer in a browser along a fixed camera path and records where time goes.
 *
 * Start the API on the world to measure and the dev server (`npm run dev`), then:
 *
 *   node benchmarks/run.ts --scenario pan --label small --world /path/to/world --server-pid 12345
 *
 * `--world` is only used to record the number and size of the region files; its content is never read.
 * `--server-pid` is the API's process id, to record the memory of the API and its workers (Linux).
 * The browser is Playwright's Chromium (`npx playwright install chromium` once). *
 * Scenarios (see --help for the options):
 *   pan      Pan 50 chunks at zoom 1. Run it on a small and a large world and compare the two files.
 *   travel   Pan for several minutes along long straight lines and back. Shows memory growth.
 *   zoomout  Zoom out to the minimum, wait for the screen to fill, then pan 50 chunks.
 *
 * The script only reads from the viewer. It writes `benchmarks/results/web-<scenario>-<label>-<time>.json`
 * (ignored by git) with the numbers and labels (machine, commit, region count, viewport), and
 * prints a table. `benchmarks/compare.ts` lists two result files side by side.
 *
 * It needs the viewer's development server, because the hook it drives (`window.__orbisBench`)
 * is not part of the production build.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, type CDPSession, type Page } from 'playwright';
import type { BenchApi } from '../src/viewer/benchHook';

declare global {
  interface Window {
    __orbisBench?: BenchApi;
    __longTasks?: number[];
  }
}

type Json = Record<string, unknown>;
type Scenario = 'pan' | 'travel' | 'zoomout';

const BLOCKS_PER_CHUNK = 16;
const SETTLE_TIMEOUT_MS = 180_000;

/**
 * Nearest-rank percentile.
 *
 * @param values - Measurements.
 * @param fraction - 0.5 for the median.
 * @returns The percentile, or 0 for no values.
 */
function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.floor(fraction * ordered.length))] ?? 0;
}

/**
 * Count, p50, p95, p99, max and mean of a list.
 *
 * @param values - Measurements.
 * @returns The summary, rounded to 3 decimals.
 */
function summary(values: number[]): Json {
  const round = (value: number): number => Math.round(value * 1000) / 1000;
  return {
    count: values.length,
    p50: round(percentile(values, 0.5)),
    p95: round(percentile(values, 0.95)),
    p99: round(percentile(values, 0.99)),
    max: round(values.length ? Math.max(...values) : 0),
    mean: round(values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0),
  };
}

/**
 * Output of a command, or an empty string if it fails.
 *
 * @param command - Program.
 * @param args - Arguments.
 * @returns Trimmed standard output.
 */
function commandOutput(command: string, args: string[]): string {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

/**
 * Resident memory in MB of a process and each of its descendants (Linux only).
 *
 * @param rootPid - Process id of the API.
 * @returns Memory by process; empty when /proc is not available.
 */
function processTreeRss(rootPid: number): Record<string, number> {
  const parents = new Map<number, number>();
  const rss = new Map<number, number>();
  try {
    for (const entry of readdirSync('/proc')) {
      if (!/^\d+$/.test(entry)) continue;
      try {
        const status = readFileSync(`/proc/${entry}/status`, 'utf8');
        parents.set(Number(entry), Number(/PPid:\s+(\d+)/.exec(status)?.[1] ?? 0));
        rss.set(Number(entry), Number(/VmRSS:\s+(\d+)/.exec(status)?.[1] ?? 0) / 1024);
      } catch {
        // The process ended while it was being read.
      }
    }
  } catch {
    return {};
  }
  const family = new Set([rootPid]);
  for (let grew = true; grew;) {
    grew = false;
    for (const [pid, parent] of parents) {
      if (family.has(parent) && !family.has(pid)) {
        family.add(pid);
        grew = true;
      }
    }
  }
  const result: Record<string, number> = {};
  for (const pid of [...family].sort((a, b) => a - b)) {
    result[pid === rootPid ? 'main' : String(pid)] = Math.round((rss.get(pid) ?? 0) * 10) / 10;
  }
  return result;
}

/**
 * Size and number of the region files of a world folder. Only the directory listing and file
 * sizes are read, never the content.
 *
 * @param world - World folder (the one that holds `region/`).
 * @returns Labels for the result file; empty if the folder cannot be read.
 */
function worldLabels(world: string | undefined): Json {
  if (!world) return {};
  try {
    const files = readdirSync(path.join(world, 'region')).filter((name) =>
      /^r\.-?\d+\.-?\d+\.mca$/.test(name),
    );
    const bytes = files.reduce(
      (sum, name) => sum + statSync(path.join(world, 'region', name)).size,
      0,
    );
    return { region_files: files.length, size_mb: Math.round(bytes / 1e5) / 10 };
  } catch {
    return {};
  }
}

/**
 * Metrics of the page's JavaScript engine and layout, from the browser's DevTools protocol.
 *
 * @param cdp - Session on the page.
 * @returns Heap, DOM nodes and cumulative durations in seconds.
 */
async function pageMetrics(cdp: CDPSession): Promise<Json> {
  const { metrics } = (await cdp.send('Performance.getMetrics')) as {
    metrics: { name: string; value: number }[];
  };
  const wanted = [
    'JSHeapUsedSize',
    'JSHeapTotalSize',
    'Nodes',
    'ScriptDuration',
    'TaskDuration',
    'LayoutDuration',
  ];
  const result: Json = {};
  for (const { name, value } of metrics) {
    if (wanted.includes(name))
      result[name] = name.endsWith('Size') ? Math.round((value / 1024 / 1024) * 10) / 10 : value;
  }
  return result;
}

/**
 * CPU time in seconds of each browser process type (renderer, GPU, browser), if the browser reports it.
 *
 * @param browser - Browser-level session.
 * @returns Cumulative CPU seconds by process type; empty if unavailable.
 */
async function processCpu(browser: CDPSession | null): Promise<Record<string, number>> {
  if (!browser) return {};
  try {
    const { processInfo } = (await browser.send('SystemInfo.getProcessInfo')) as {
      processInfo: { type: string; cpuTime: number }[];
    };
    const totals: Record<string, number> = {};
    for (const info of processInfo) totals[info.type] = (totals[info.type] ?? 0) + info.cpuTime;
    return totals;
  } catch {
    return {};
  }
}

/**
 * Waits until nothing more will appear on screen without the camera moving.
 *
 * @param page - The viewer page.
 * @returns Milliseconds waited, or `-1` if it did not settle in time.
 */
async function settle(page: Page): Promise<number> {
  const started = Date.now();
  try {
    await page.waitForFunction(() => window.__orbisBench?.settled() === true, undefined, {
      polling: 100,
      timeout: SETTLE_TIMEOUT_MS,
    });
  } catch {
    return -1;
  }
  return Date.now() - started;
}

/**
 * Moves the camera in a straight line at a constant speed, one step per animation frame.
 * Runs inside the page, so the pace does not depend on the round trip to this script.
 *
 * @param page - The viewer page.
 * @param dxChunks - Chunks to move along X.
 * @param dzChunks - Chunks to move along Z.
 * @param chunksPerSecond - Speed.
 */
async function glide(
  page: Page,
  dxChunks: number,
  dzChunks: number,
  chunksPerSecond: number,
): Promise<void> {
  await page.evaluate(
    ({ dx, dz, speed, blocks }) =>
      new Promise<void>((resolve) => {
        const bench = window.__orbisBench;
        if (!bench) throw new Error('The bench hook is missing.');
        const start = bench.stats();
        const length = Math.hypot(dx, dz);
        const duration = (length / speed) * 1000;
        const begin = performance.now();
        const step = (): void => {
          const t = Math.min(1, (performance.now() - begin) / duration);
          bench.moveTo(start.cameraX + dx * blocks * t, start.cameraZ + dz * blocks * t);
          if (t < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      }),
    { dx: dxChunks, dz: dzChunks, speed: chunksPerSecond, blocks: BLOCKS_PER_CHUNK },
  );
}

/**
 * Per-request timings of the chunk requests the page made, from the browser's resource timing.
 *
 * @param page - The viewer page.
 * @returns Summaries of latency, time to first byte, download, sizes and the server's phases.
 */
async function requestTimings(page: Page): Promise<Json> {
  const entries = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter((e) => e.name.includes('/api/chunks/'))
      .map((e) => {
        const r = e as PerformanceResourceTiming;
        return {
          startDelay: r.requestStart - r.startTime,
          ttfb: r.responseStart - r.requestStart,
          download: r.responseEnd - r.responseStart,
          total: r.duration,
          encoded: r.encodedBodySize,
          decoded: r.decodedBodySize,
          server: r.serverTiming.map((t) => ({
            name: t.name,
            duration: t.duration,
            description: t.description,
          })),
        };
      }),
  );
  const phases = new Map<string, number[]>();
  for (const entry of entries) {
    for (const timing of entry.server) {
      if (timing.duration > 0 || timing.description === '') {
        const list = phases.get(timing.name) ?? [];
        list.push(timing.duration);
        phases.set(timing.name, list);
      }
    }
  }
  return {
    requests: entries.length,
    total_ms: summary(entries.map((e) => e.total)),
    browser_wait_before_send_ms: summary(entries.map((e) => e.startDelay)),
    ttfb_ms: summary(entries.map((e) => e.ttfb)),
    download_ms: summary(entries.map((e) => e.download)),
    encoded_kb: summary(entries.map((e) => e.encoded / 1024)),
    decoded_kb: summary(entries.map((e) => e.decoded / 1024)),
    server_phase_ms: Object.fromEntries(
      [...phases].map(([name, values]) => [name, summary(values)]),
    ),
  };
}

interface Options {
  url: string;
  headless: boolean;
  speed: number;
  minutes: number;
  serverPid: number | undefined;
}

/**
 * Runs one scenario and collects everything measured during it.
 *
 * @param scenario - Which camera path to follow.
 * @param page - The viewer page.
 * @param cdp - DevTools session on the page.
 * @param browserCdp - Browser-level DevTools session, if available.
 * @param options - Command line options.
 * @returns The measurements.
 */
async function runScenario(
  scenario: Scenario,
  page: Page,
  cdp: CDPSession,
  browserCdp: CDPSession | null,
  options: Options,
): Promise<Json> {
  await page.evaluate(() => {
    performance.clearResourceTimings();
    window.__longTasks = [];
  });
  const result: Json = {};
  if (scenario === 'zoomout') {
    await page.evaluate(() => window.__orbisBench?.setZoom(0.5));
    result.settle_after_zoom_out_ms = await settle(page);
  } else {
    await page.evaluate(() => window.__orbisBench?.setZoom(1));
    result.settle_before_ms = await settle(page);
  }

  const cpuBefore = await processCpu(browserCdp);
  const metricsBefore = await pageMetrics(cdp);
  const rssBefore = options.serverPid ? processTreeRss(options.serverPid) : {};
  const samples: Json[] = [];
  await page.evaluate(() => window.__orbisBench?.startRecording());
  const began = Date.now();

  if (scenario === 'travel') {
    const end = began + options.minutes * 60_000;
    let lastSample = began;
    const legs: [number, number][] = [
      [200, 0],
      [-200, 0],
      [0, 200],
      [0, -200],
    ];
    for (let leg = 0; Date.now() < end; leg++) {
      const [dx, dz] = legs[leg % legs.length] ?? [0, 0];
      // Sample every 10 s while the leg runs.
      const moving = glide(page, dx, dz, options.speed);
      let running = true;
      void moving.finally(() => (running = false));
      while (running && Date.now() < end) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        if (Date.now() - lastSample >= 10_000) {
          lastSample = Date.now();
          samples.push({
            at_s: Math.round((lastSample - began) / 1000),
            page: await pageMetrics(cdp),
            viewer: (await page.evaluate(() => window.__orbisBench?.stats())) ?? {},
            server_rss_mb: options.serverPid ? processTreeRss(options.serverPid) : {},
          });
        }
      }
      await moving;
    }
  } else {
    await glide(page, 50, 0, options.speed);
  }

  const moveMs = Date.now() - began;
  const log = await page.evaluate(() => window.__orbisBench?.stopRecording());
  const settleAfter = await settle(page);

  const longTasks = await page.evaluate(() => window.__longTasks ?? []);
  const stats = await page.evaluate(() => window.__orbisBench?.stats());
  const cpuAfter = await processCpu(browserCdp);
  const frames = log?.frames ?? [];
  Object.assign(result, {
    move_ms: moveMs,
    settle_after_move_ms: settleAfter,
    frame_ms: summary(frames),
    frames_over_33ms: frames.filter((f) => f > 33.4).length,
    frames_over_50ms: frames.filter((f) => f > 50).length,
    own_code_ms: summary(log?.work ?? []),
    wanted_update_ms: summary(log?.wanted ?? []),
    chunk_build_ms: summary(log?.builds ?? []),
    long_tasks_ms: summary(longTasks),
    requests: await requestTimings(page),
    viewer_end: stats ?? {},
    page_before: metricsBefore,
    page_after: await pageMetrics(cdp),
    browser_cpu_s: Object.fromEntries(
      Object.entries(cpuAfter).map(([type, value]) => [
        type,
        Math.round((value - (cpuBefore[type] ?? 0)) * 100) / 100,
      ]),
    ),
    server_rss_mb_before: rssBefore,
    server_rss_mb_after: options.serverPid ? processTreeRss(options.serverPid) : {},
    samples,
  });
  return result;
}

/**
 * Prints the main numbers of a scenario.
 *
 * @param name - Scenario name.
 * @param result - Its measurements.
 */
function printSummary(name: string, result: Json): void {
  const frame = result.frame_ms as Json;
  const requests = result.requests as Json;
  const total = requests.total_ms as Json;
  console.log(`\n${name}`);
  console.log(
    `  frames: ${frame.count}  p50 ${frame.p50} ms  p95 ${frame.p95} ms  p99 ${frame.p99} ms  max ${frame.max} ms`,
  );
  console.log(
    `  frames over 33 ms: ${result.frames_over_33ms}, over 50 ms: ${result.frames_over_50ms}`,
  );
  console.log(`  chunk requests: ${requests.requests}  p50 ${total.p50} ms  p95 ${total.p95} ms`);
  console.log(`  time to fill the screen after the move: ${result.settle_after_move_ms} ms`);
}

/**
 * Runs the requested scenarios and writes the result file.
 *
 * @returns Process exit code.
 */
async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      url: { type: 'string', default: 'http://127.0.0.1:5173' },
      scenario: { type: 'string', default: 'pan' },
      label: { type: 'string', default: 'world' },
      headless: { type: 'boolean', default: false },
      speed: { type: 'string', default: '8' },
      minutes: { type: 'string', default: '5' },
      'server-pid': { type: 'string' },
      world: { type: 'string' },
      out: { type: 'string', default: path.join(import.meta.dirname, 'results') },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help) {
    console.log(
      'Options: --url --scenario pan|travel|zoomout|all --label NAME --headless --speed CHUNKS_PER_S --minutes N --server-pid PID --world DIR --out DIR',
    );
    return 0;
  }
  const scenarios: Scenario[] =
    values.scenario === 'all' ? ['pan', 'zoomout', 'travel'] : [values.scenario as Scenario];
  const options: Options = {
    url: values.url as string,
    headless: values.headless as boolean,
    speed: Number(values.speed),
    minutes: Number(values.minutes),
    serverPid: values['server-pid'] ? Number(values['server-pid']) : undefined,
  };

  const browser = await chromium.launch({
    headless: options.headless,
    args: options.headless
      ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
      : [],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.__longTasks = [];
      performance.setResourceTimingBufferSize(100_000);
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.__longTasks?.push(entry.duration);
      }).observe({ entryTypes: ['longtask'] });
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    let browserCdp: CDPSession | null = null;
    try {
      browserCdp = await browser.newBrowserCDPSession();
    } catch {
      browserCdp = null;
    }

    await page.goto(`${options.url}/viewer`);
    try {
      await page.waitForFunction(() => window.__orbisBench !== undefined, undefined, {
        timeout: 60_000,
      });
    } catch {
      console.error(
        'The viewer did not start. Is a world loaded in the API, and is this `npm run dev`?',
      );
      return 1;
    }
    const initial = await settle(page);

    const results: Json = {};
    for (const scenario of scenarios) {
      results[scenario] = await runScenario(scenario, page, cdp, browserCdp, options);
      printSummary(scenario, results[scenario] as Json);
    }

    const output: Json = {
      script: 'web/run',
      timestamp: new Date().toISOString(),
      machine: {
        cpu: os.cpus()[0]?.model ?? '',
        cores: os.cpus().length,
        memory_mb: Math.round(os.totalmem() / 1024 / 1024),
        node: process.version,
        browser: browser.version(),
        commit: commandOutput('git', ['rev-parse', '--short', 'HEAD']),
        dirty: commandOutput('git', ['status', '--porcelain']) !== '',
      },
      world: {
        label: values.label,
        ...worldLabels(values.world),
        viewport: '1920x1080',
        headless: options.headless,
        speed_chunks_per_s: options.speed,
        initial_settle_ms: initial,
      },
      ...results,
    };
    const dir = values.out as string;
    mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const file = path.join(dir, `web-${values.scenario}-${values.label}-${stamp}.json`);
    writeFileSync(file, JSON.stringify(output, null, 2));
    console.log(`\nWrote ${file}`);
    return 0;
  } finally {
    await browser.close();
  }
}

process.exitCode = await main();

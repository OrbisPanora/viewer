/**
 * Runs the viewer: owns the pixi application and connects camera, input, chunk loading and
 * drawing. The Vue component only creates it, listens to its statistics and destroys it.
 */
import 'pixi.js/unsafe-eval';
import { Application } from 'pixi.js';
import { fetchChunk, type ChunkPayload } from '@/api/chunks';
import { loadAtlas, type Atlas } from './atlas';
import type { RenderedAtlas } from './pack/render';
import { Camera } from './camera';
import { ChunkCache } from './chunkCache';
import { ChunkLoader } from './chunkLoader';
import { RollingWindow } from './metrics';
import { attachInput } from './inputController';
import {
  chunkCenter,
  chunkKey,
  parseChunkKey,
  projectBlocks,
  sortByDistance,
  visibleChunks,
  worldToChunk,
  type ChunkCoords,
  type WorldPoint,
} from './projection';
import { SceneRenderer } from './sceneRenderer';

/** Sky colour behind the world. */
const BACKGROUND_COLOR = 0x77b5fe;
/** Chunks kept in memory. Visible chunks are never evicted, whatever this is. */
export const MAX_CACHED_CHUNKS = 2000;
/** Chunks loaded beyond the screen edge, so scrolling rarely shows an unloaded chunk. */
export const PRELOAD_MARGIN_CHUNKS = 2;
/** How often statistics are reported, in milliseconds. */
const STATS_INTERVAL_MS = 250;

/** Frames kept for the frame time percentiles: about two seconds at 60 frames per second. */
const FRAME_WINDOW = 120;
/** Other timings (camera updates, chunk builds) keep this many values. */
const EVENT_WINDOW = 100;

/**
 * Numbers shown in the debug overlay. Times are in milliseconds. "Frame" is the time between
 * two frames; "work" is the time spent in the viewer's own per-frame code (camera, culling,
 * placeholders), which runs before pixi draws. A frame that is much longer than its work was
 * spent drawing or idle.
 */
export interface ViewerStats {
  readonly cameraX: number;
  readonly cameraZ: number;
  readonly zoom: number;
  readonly visibleChunks: number;
  readonly cachedChunks: number;
  readonly loadingChunks: number;
  readonly missingChunks: number;
  readonly frameMsP50: number;
  readonly frameMsP95: number;
  readonly workMsP50: number;
  readonly workMsP95: number;
  /** Time of {@link ViewerController} recomputing the wanted chunks after a camera change. */
  readonly wantedMsP95: number;
  /** Time to build the drawing of a chunk that arrived. */
  readonly buildMsP50: number;
  readonly buildMsP95: number;
  readonly tilemaps: number;
  readonly visibleTilemaps: number;
  readonly visibleTiles: number;
  /** Wanted chunks with no request running. */
  readonly queuedChunks: number;
  readonly startedRequests: number;
  readonly abortedRequests: number;
  readonly failedRequests: number;
  /** Wait of a wanted chunk before its request started. */
  readonly waitMsP50: number;
  readonly waitMsP95: number;
  /** Duration of a finished request, from sending to the decoded chunk. */
  readonly requestMsP50: number;
  readonly requestMsP95: number;
  /** Different block names drawn as the placeholder because the atlas has no sprite. */
  readonly unknownBlocks: number;
}

/** Per-frame measurements recorded between {@link ViewerController.recordFrames} calls. */
export interface FrameLog {
  /** Time between consecutive frames, in ms. */
  readonly frames: number[];
  /** Time in the viewer's own per-frame code, in ms. */
  readonly work: number[];
  /** Time of each recomputation of the wanted chunks, in ms. */
  readonly wanted: number[];
  /** Time to build each arriving chunk, in ms. */
  readonly builds: number[];
}

/** Options for {@link ViewerController.create}. */
export interface ViewerOptions {
  /** Element that receives the canvas. The canvas fills it and follows its size. */
  container: HTMLElement;
  /** The block sprites, built by `prepareAtlas` before the viewer starts. */
  atlas: RenderedAtlas;
  /** Block position to start over. Without it the camera centres on the first chunk that loads. */
  startAt?: WorldPoint;
  /** Receives statistics a few times per second. */
  onStats?: (stats: ViewerStats) => void;
}

/** What is remembered about each loaded chunk. */
interface CachedChunk {
  /** Surface height reported by the API. */
  readonly surfaceY: number;
}

/** The running viewer. */
export class ViewerController {
  private readonly camera = new Camera();
  private readonly cache: ChunkCache<CachedChunk>;
  private readonly loader: ChunkLoader;
  private readonly renderer: SceneRenderer;
  private readonly listeners = new AbortController();

  private lastCameraVersion = -1;
  private visibleKeys = new Set<string>();
  private visibleList: ChunkCoords[] = [];
  private needsCentering: boolean;
  private lastStatsAt = 0;
  private lastFrameAt = 0;
  private atlas: Atlas | undefined;
  private readonly frameTimes = new RollingWindow(FRAME_WINDOW);
  private readonly workTimes = new RollingWindow(FRAME_WINDOW);
  private readonly wantedTimes = new RollingWindow(EVENT_WINDOW);
  private readonly buildTimes = new RollingWindow(EVENT_WINDOW);
  private log: FrameLog | null = null;

  private constructor(
    private readonly app: Application,
    private readonly options: ViewerOptions,
    renderer: SceneRenderer,
  ) {
    this.renderer = renderer;
    this.needsCentering = options.startAt === undefined;

    this.cache = new ChunkCache<CachedChunk>(MAX_CACHED_CHUNKS, (key) => {
      this.renderer.removeChunk(key);
      this.loader.forget(key);
    });

    this.loader = new ChunkLoader({
      fetchChunk,
      onLoaded: (coords, payload) => this.handleLoaded(coords, payload),
    });
  }

  /**
   * Starts the viewer inside a container.
   *
   * @param options - Container, sprites, start position and statistics callback.
   * @returns The running viewer. Call {@link destroy} to stop it.
   * @throws {Error} If WebGL is unavailable or the atlas cannot be loaded.
   */
  static async create(options: ViewerOptions): Promise<ViewerController> {
    const app = new Application();
    await app.init({
      resizeTo: options.container,
      background: BACKGROUND_COLOR,
      antialias: false,
      resolution: 1,
      preference: 'webgl',
    });
    options.container.appendChild(app.canvas);

    try {
      const atlas = await loadAtlas(options.atlas);
      const viewer = new ViewerController(app, options, new SceneRenderer(app, atlas));
      viewer.atlas = atlas;
      viewer.start();
      return viewer;
    } catch (error) {
      app.destroy(true, { children: true });
      throw error;
    }
  }

  /**
   * Stops the viewer: cancels requests, removes listeners and frees the GPU resources.
   */
  destroy(): void {
    this.listeners.abort();
    this.loader.dispose();
    this.cache.clear();
    this.renderer.destroy();
    this.app.destroy(true, { children: true });
  }

  /** Wires input and the frame loop. */
  private start(): void {
    const { canvas } = this.app;
    canvas.tabIndex = 0;
    canvas.setAttribute(
      'aria-label',
      'Interactive world map. Use arrow keys to pan, plus and minus to zoom.',
    );

    this.camera.resize(this.app.screen.width, this.app.screen.height);
    if (this.options.startAt) this.camera.moveTo(this.options.startAt.x, this.options.startAt.z);

    this.app.renderer.on('resize', (width: number, height: number) =>
      this.camera.resize(width, height),
    );

    attachInput(
      canvas,
      {
        drag: (dx, dy) => {
          this.needsCentering = false;
          this.camera.dragBy(dx, dy);
        },
        zoom: (factor) => this.camera.zoomBy(factor),
      },
      this.listeners.signal,
    );

    this.app.ticker.add(() => this.frame());
  }

  /** Runs once per frame: updates what is wanted when the camera moved, then draws. */
  private frame(): void {
    const frameStart = performance.now();
    if (this.lastFrameAt > 0) {
      const interval = frameStart - this.lastFrameAt;
      this.frameTimes.push(interval);
      this.log?.frames.push(interval);
    }
    this.lastFrameAt = frameStart;

    if (this.camera.version !== this.lastCameraVersion) {
      this.lastCameraVersion = this.camera.version;
      this.updateWanted();
    }

    this.renderer.setVisible(this.visibleKeys);
    this.renderer.applyCamera(this.camera, this.surfaceYUnderCamera());
    this.renderer.syncPlaceholders(
      this.visibleList.filter((c) => this.loader.isLoading(chunkKey(c))),
      this.visibleList.filter((c) => this.loader.isMissing(chunkKey(c))),
      performance.now(),
    );

    const now = performance.now();
    const work = now - frameStart;
    this.workTimes.push(work);
    this.log?.work.push(work);
    if (this.options.onStats && now - this.lastStatsAt >= STATS_INTERVAL_MS) {
      this.lastStatsAt = now;
      this.options.onStats(this.stats());
    }
  }

  /** Recomputes the visible chunks, asks the loader for them and trims the cache. */
  private updateWanted(): void {
    const started = performance.now();
    const { camera } = this;
    this.visibleList = visibleChunks(camera.position, camera.zoom, camera.viewport);
    this.visibleKeys = new Set(this.visibleList.map(chunkKey));

    const withMargin = visibleChunks(
      camera.position,
      camera.zoom,
      camera.viewport,
      PRELOAD_MARGIN_CHUNKS,
    );
    this.loader.setWanted(sortByDistance(withMargin, camera.position));

    // Keep what is on screen or about to be; drop the least recently used beyond the limit.
    const keep = new Set(withMargin.map(chunkKey));
    for (const key of this.visibleKeys) this.cache.get(key);
    this.cache.evict(keep);

    const elapsed = performance.now() - started;
    this.wantedTimes.push(elapsed);
    this.log?.wanted.push(elapsed);
  }

  /**
   * Stores a chunk that arrived and draws it.
   *
   * @param coords - The chunk.
   * @param payload - Its content.
   */
  private handleLoaded(coords: ChunkCoords, payload: ChunkPayload): void {
    const started = performance.now();
    this.renderer.setChunk(coords, projectBlocks(coords, payload.blocks));
    this.cache.set(chunkKey(coords), { surfaceY: payload.surfaceY });
    const elapsed = performance.now() - started;
    this.buildTimes.push(elapsed);
    this.log?.builds.push(elapsed);

    if (this.needsCentering) {
      // The world may not contain the origin; start over the first terrain that exists.
      this.needsCentering = false;
      const center = chunkCenter(coords);
      this.camera.moveTo(center.x, center.z);
    }
  }

  /**
   * Finds the surface height to align the camera with: the chunk under it, or the nearest
   * loaded chunk on screen.
   *
   * @returns Height in block levels, 0 if nothing is loaded.
   */
  private surfaceYUnderCamera(): number {
    const under = worldToChunk(this.camera.x, this.camera.z);
    const direct = this.cache.peek(chunkKey(under));
    if (direct) return direct.surfaceY;

    let best: CachedChunk | undefined;
    let bestDistance = Infinity;
    for (const key of this.visibleKeys) {
      const entry = this.cache.peek(key);
      if (!entry) continue;
      const { x, z } = parseChunkKey(key);
      const distance = (x - under.x) ** 2 + (z - under.z) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = entry;
      }
    }
    return best?.surfaceY ?? 0;
  }

  /**
   * Collects the numbers for the debug overlay.
   *
   * @returns The current statistics.
   */
  stats(): ViewerStats {
    const loader = this.loader.stats();
    return {
      cameraX: this.camera.x,
      cameraZ: this.camera.z,
      zoom: this.camera.zoom,
      visibleChunks: this.visibleList.length,
      cachedChunks: this.cache.size,
      loadingChunks: this.loader.pending,
      missingChunks: this.loader.missingCount,
      frameMsP50: this.frameTimes.percentile(0.5),
      frameMsP95: this.frameTimes.percentile(0.95),
      workMsP50: this.workTimes.percentile(0.5),
      workMsP95: this.workTimes.percentile(0.95),
      wantedMsP95: this.wantedTimes.percentile(0.95),
      buildMsP50: this.buildTimes.percentile(0.5),
      buildMsP95: this.buildTimes.percentile(0.95),
      tilemaps: this.renderer.tilemapCount,
      visibleTilemaps: this.renderer.visibleTilemapCount,
      visibleTiles: this.renderer.visibleTileCount,
      queuedChunks: loader.queued,
      startedRequests: loader.started,
      abortedRequests: loader.aborted,
      failedRequests: loader.failed,
      waitMsP50: loader.waitMsP50,
      waitMsP95: loader.waitMsP95,
      requestMsP50: loader.requestMsP50,
      requestMsP95: loader.requestMsP95,
      unknownBlocks: this.atlas?.unknownCount() ?? 0,
    };
  }

  /**
   * Moves the camera, as the benchmark does. The viewer then loads what is around the new position.
   *
   * @param x - Block X.
   * @param z - Block Z.
   */
  moveCameraTo(x: number, z: number): void {
    this.needsCentering = false;
    this.camera.moveTo(x, z);
  }

  /**
   * Sets the zoom, as the benchmark does.
   *
   * @param zoom - Zoom factor, limited to the camera's range.
   */
  setCameraZoom(zoom: number): void {
    this.camera.setZoom(zoom);
  }

  /**
   * Tells whether every chunk on screen is drawn or known to be absent and no request runs.
   *
   * @returns `true` when nothing more will appear without the camera moving.
   */
  isSettled(): boolean {
    // The camera moved since the last frame: the list of visible chunks is not up to date yet.
    if (this.camera.version !== this.lastCameraVersion) return false;
    if (this.loader.pending > 0) return false;
    return this.visibleList.every((c) => {
      const key = chunkKey(c);
      return this.cache.peek(key) !== undefined || this.loader.isMissing(key);
    });
  }

  /**
   * Starts or stops recording every frame, camera update and chunk build.
   *
   * @param enabled - `true` starts with an empty log; `false` stops and discards it.
   */
  recordFrames(enabled: boolean): void {
    this.log = enabled ? { frames: [], work: [], wanted: [], builds: [] } : null;
  }

  /**
   * Returns what was recorded since {@link recordFrames} and empties the log.
   *
   * @returns The measurements, empty if recording is off.
   */
  takeFrameLog(): FrameLog {
    const taken = this.log ?? { frames: [], work: [], wanted: [], builds: [] };
    if (this.log) this.log = { frames: [], work: [], wanted: [], builds: [] };
    return taken;
  }
}

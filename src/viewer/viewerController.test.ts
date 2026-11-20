// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The frame callback and resize handler the controller registers on the fake application. */
const fake = vi.hoisted(() => ({
  frame: null as null | (() => void),
  resize: null as null | ((width: number, height: number) => void),
  initFails: false,
  atlasFails: false,
  apps: [] as { destroy: ReturnType<typeof vi.fn>; canvas: HTMLCanvasElement }[],
  renderers: [] as Record<string, ReturnType<typeof vi.fn>>[],
}));

vi.mock('pixi.js/unsafe-eval', () => ({}));

vi.mock('pixi.js', () => ({
  Application: class {
    canvas = document.createElement('canvas');
    screen = { width: 800, height: 600 };
    renderer = {
      on: (_name: string, handler: (width: number, height: number) => void) => {
        fake.resize = handler;
      },
    };
    ticker = {
      add: (callback: () => void) => {
        fake.frame = callback;
      },
    };
    destroy = vi.fn();
    constructor() {
      fake.apps.push(this);
    }
    async init(): Promise<void> {
      if (fake.initFails) throw new Error('no WebGL');
    }
  },
}));

vi.mock('./atlas', () => ({
  loadAtlas: async () => {
    if (fake.atlasFails) throw new Error('atlas missing');
    return {};
  },
}));

vi.mock('./sceneRenderer', () => ({
  SceneRenderer: class {
    setChunk = vi.fn();
    removeChunk = vi.fn();
    setVisible = vi.fn();
    applyCamera = vi.fn();
    syncPlaceholders = vi.fn();
    destroy = vi.fn();
    constructor() {
      fake.renderers.push(this as unknown as Record<string, ReturnType<typeof vi.fn>>);
    }
  },
}));

const fetchChunk = vi.hoisted(() => vi.fn());
vi.mock('@/api/chunks', () => ({ fetchChunk }));

import { ViewerController, type ViewerStats } from './viewerController';

/**
 * Lets the loader's promises settle.
 */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Runs the frame callback the controller gave the ticker.
 */
function frame(): void {
  expect(fake.frame).not.toBeNull();
  fake.frame?.();
}

beforeEach(() => {
  fake.frame = null;
  fake.resize = null;
  fake.initFails = false;
  fake.atlasFails = false;
  fake.apps.length = 0;
  fake.renderers.length = 0;
  fetchChunk.mockReset();
  fetchChunk.mockResolvedValue({ tiles: [['stone.webp', 0, 0]], surfaceY: 64 });
});

afterEach(() => vi.restoreAllMocks());

describe('ViewerController', () => {
  it('puts a focusable, labelled canvas in the container', async () => {
    const container = document.createElement('div');
    const viewer = await ViewerController.create({ container });
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(canvas?.tabIndex).toBe(0);
    expect(canvas?.getAttribute('aria-label')).toMatch(/arrow keys/);
    viewer.destroy();
  });

  it('requests the visible chunks and draws the ones that arrive', async () => {
    const viewer = await ViewerController.create({ container: document.createElement('div') });
    frame();
    await settle();
    expect(fetchChunk).toHaveBeenCalled();
    const renderer = fake.renderers[0];
    expect(renderer?.setChunk).toHaveBeenCalled();
    frame();
    expect(renderer?.setVisible).toHaveBeenCalled();
    expect(renderer?.applyCamera).toHaveBeenCalled();
    expect(renderer?.syncPlaceholders).toHaveBeenCalled();
    viewer.destroy();
  });

  it('centres on the first chunk that loads when no start is given', async () => {
    const stats: ViewerStats[] = [];
    const viewer = await ViewerController.create({
      container: document.createElement('div'),
      onStats: (value) => stats.push(value),
    });
    frame();
    await settle();
    vi.spyOn(performance, 'now').mockReturnValue(10_000);
    frame();
    expect(stats.length).toBeGreaterThan(0);
    const last = stats.at(-1);
    expect(last?.cachedChunks).toBeGreaterThan(0);
    expect(last?.visibleChunks).toBeGreaterThan(0);
    expect(last?.zoom).toBeGreaterThan(0);
    viewer.destroy();
  });

  it('starts over the given position', async () => {
    const stats: ViewerStats[] = [];
    const viewer = await ViewerController.create({
      container: document.createElement('div'),
      startAt: { x: 256, z: 256 },
      onStats: (value) => stats.push(value),
    });
    vi.spyOn(performance, 'now').mockReturnValue(10_000);
    frame();
    expect(stats[0]?.cameraX).toBeCloseTo(256);
    expect(stats[0]?.cameraZ).toBeCloseTo(256);
    viewer.destroy();
  });

  it('reports statistics at most every 250 ms', async () => {
    const onStats = vi.fn();
    const viewer = await ViewerController.create({
      container: document.createElement('div'),
      startAt: { x: 0, z: 0 },
      onStats,
    });
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValue(1_000);
    frame();
    now.mockReturnValue(1_100);
    frame();
    now.mockReturnValue(1_300);
    frame();
    expect(onStats).toHaveBeenCalledTimes(2);
    viewer.destroy();
  });

  it('follows the size of the renderer', async () => {
    const stats: ViewerStats[] = [];
    const viewer = await ViewerController.create({
      container: document.createElement('div'),
      startAt: { x: 0, z: 0 },
      onStats: (value) => stats.push(value),
    });
    frame();
    const before = stats.length ? stats[0]?.visibleChunks : undefined;
    fake.resize?.(3000, 2000);
    frame();
    vi.spyOn(performance, 'now').mockReturnValue(50_000);
    frame();
    expect(stats.at(-1)?.visibleChunks).toBeGreaterThan(before ?? 0);
    viewer.destroy();
  });

  it('pans and zooms with the keyboard', async () => {
    const stats: ViewerStats[] = [];
    const container = document.createElement('div');
    const viewer = await ViewerController.create({
      container,
      startAt: { x: 0, z: 0 },
      onStats: (value) => stats.push(value),
    });
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValue(1_000);
    frame();
    const zoomBefore = stats.at(-1)?.zoom ?? 0;
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: '+' }));
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    now.mockReturnValue(2_000);
    frame();
    const last = stats.at(-1);
    expect(last?.zoom).toBeGreaterThan(zoomBefore);
    expect(last?.cameraX).not.toBe(0);
    viewer.destroy();
  });

  it('stops the loader, the renderer and the application when destroyed', async () => {
    const container = document.createElement('div');
    const viewer = await ViewerController.create({ container });
    viewer.destroy();
    expect(fake.renderers[0]?.destroy).toHaveBeenCalled();
    expect(fake.apps[0]?.destroy).toHaveBeenCalledWith(true, { children: true });
  });

  it('frees the application and rethrows when the atlas cannot be loaded', async () => {
    fake.atlasFails = true;
    await expect(
      ViewerController.create({ container: document.createElement('div') }),
    ).rejects.toThrow('atlas missing');
    expect(fake.apps[0]?.destroy).toHaveBeenCalled();
  });

  it('rethrows when the application cannot start', async () => {
    fake.initFails = true;
    await expect(
      ViewerController.create({ container: document.createElement('div') }),
    ).rejects.toThrow('no WebGL');
  });
});

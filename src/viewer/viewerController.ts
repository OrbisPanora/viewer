/**
 * Runs the viewer: owns the pixi application and connects camera, input, chunk loading and
 * drawing. The Vue component only creates it, listens to its statistics and destroys it.
 */
import 'pixi.js/unsafe-eval';
import { Application } from 'pixi.js';
import { fetchChunk, type ChunkPayload } from '@/api/chunks';
import { loadAtlas } from './atlas';
import { Camera } from './camera';
import { ChunkCache } from './chunkCache';
import { ChunkLoader } from './chunkLoader';
import { attachInput } from './inputController';
import {
  chunkCenter,
  chunkKey,
  parseChunkKey,
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

/** Numbers shown in the debug overlay. */
export interface ViewerStats {
  readonly cameraX: number;
  readonly cameraZ: number;
  readonly zoom: number;
  readonly visibleChunks: number;
  readonly cachedChunks: number;
  readonly loadingChunks: number;
  readonly missingChunks: number;
}

/** Options for {@link ViewerController.create}. */
export interface ViewerOptions {
  /** Element that receives the canvas. The canvas fills it and follows its size. */
  container: HTMLElement;
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
   * @param options - Container, start position and statistics callback.
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
      const atlas = await loadAtlas();
      const viewer = new ViewerController(app, options, new SceneRenderer(app, atlas));
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
    if (this.options.onStats && now - this.lastStatsAt >= STATS_INTERVAL_MS) {
      this.lastStatsAt = now;
      this.options.onStats(this.stats());
    }
  }

  /** Recomputes the visible chunks, asks the loader for them and trims the cache. */
  private updateWanted(): void {
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
  }

  /**
   * Stores a chunk that arrived and draws it.
   *
   * @param coords - The chunk.
   * @param payload - Its content.
   */
  private handleLoaded(coords: ChunkCoords, payload: ChunkPayload): void {
    this.renderer.setChunk(coords, payload.tiles);
    this.cache.set(chunkKey(coords), { surfaceY: payload.surfaceY });

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
  private stats(): ViewerStats {
    return {
      cameraX: this.camera.x,
      cameraZ: this.camera.z,
      zoom: this.camera.zoom,
      visibleChunks: this.visibleList.length,
      cachedChunks: this.cache.size,
      loadingChunks: this.loader.pending,
      missingChunks: this.loader.missingCount,
    };
  }
}

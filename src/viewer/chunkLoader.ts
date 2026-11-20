/**
 * Fetches chunks from the API with a limit on parallel requests.
 *
 * The caller states which chunks it wants, nearest first; the loader fetches them in that
 * order, never more than `maxConcurrent` at once. When the wanted set changes (the user
 * scrolled), requests for chunks no longer wanted are cancelled so they stop using the
 * connection. A chunk the world does not have is remembered as missing and never asked
 * again. A request that failed for another reason is retried after a cool-down, so a server
 * that is down is not hammered.
 */
import { ApiError } from '@/api/errors';
import type { ChunkPayload } from '@/api/chunks';
import { RollingWindow } from './metrics';
import { chunkKey, type ChunkCoords } from './projection';

/** Parallel requests when the caller gives no value. The API runs chunk extraction in worker processes, so a few at a time keeps it busy without queueing. */
export const DEFAULT_MAX_CONCURRENT = 6;
/** Time before a failed chunk is requested again, in milliseconds. */
export const DEFAULT_FAILURE_COOLDOWN_MS = 5_000;

/** What the loader needs from its surroundings. */
export interface ChunkLoaderOptions {
  /** Fetches one chunk; resolves to `null` when the world has no such chunk. */
  fetchChunk: (x: number, z: number, signal: AbortSignal) => Promise<ChunkPayload | null>;
  /** Called when a chunk arrived. */
  onLoaded: (coords: ChunkCoords, payload: ChunkPayload) => void;
  /** Called when the world has no such chunk. */
  onMissing?: (coords: ChunkCoords) => void;
  /** Called when a request failed for a reason other than cancellation. */
  onError?: (coords: ChunkCoords, error: unknown) => void;
  /** Parallel request limit. */
  maxConcurrent?: number;
  /** Wait before retrying a failed chunk. */
  failureCooldownMs?: number;
  /** Clock, replaceable in tests. */
  now?: () => number;
}

/** Values kept for the timing percentiles. */
const TIMING_WINDOW = 200;

/** Counters and timings of the loader, for the debug overlay and the benchmark. */
export interface LoaderStats {
  /** Wanted chunks that are not loaded, loading, missing or cooling down after a failure. */
  readonly queued: number;
  /** Requests started since the loader was created. */
  readonly started: number;
  /** Requests cancelled because the chunk stopped being wanted. */
  readonly aborted: number;
  /** Requests that failed for a reason other than cancellation. */
  readonly failed: number;
  /** Chunks waiting for their retry after a failure. */
  readonly cooling: number;
  /** Median and 95th percentile of the time a wanted chunk waited before its request started, in ms. */
  readonly waitMsP50: number;
  readonly waitMsP95: number;
  /** Median and 95th percentile of the duration of a finished request, in ms. */
  readonly requestMsP50: number;
  readonly requestMsP95: number;
}

/** Loads chunks on demand and tracks what was loaded, is loading, is missing or failed. */
export class ChunkLoader {
  private readonly inFlight = new Map<string, AbortController>();
  private readonly loaded = new Set<string>();
  private readonly missing = new Set<string>();
  private readonly failedAt = new Map<string, number>();
  private readonly wantedSince = new Map<string, number>();
  private readonly waitTimes = new RollingWindow(TIMING_WINDOW);
  private readonly requestTimes = new RollingWindow(TIMING_WINDOW);
  private startedCount = 0;
  private abortedCount = 0;
  private failedCount = 0;
  private wanted: ChunkCoords[] = [];
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  private readonly maxConcurrent: number;
  private readonly failureCooldownMs: number;
  private readonly now: () => number;

  /**
   * Creates the loader.
   *
   * @param options - Callbacks and limits.
   */
  constructor(private readonly options: ChunkLoaderOptions) {
    this.maxConcurrent = options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
    this.failureCooldownMs = options.failureCooldownMs ?? DEFAULT_FAILURE_COOLDOWN_MS;
    this.now = options.now ?? Date.now;
  }

  /**
   * Number of requests in progress.
   *
   * @returns The count.
   */
  get pending(): number {
    return this.inFlight.size;
  }

  /**
   * Number of chunks known to be absent from the world.
   *
   * @returns The count.
   */
  get missingCount(): number {
    return this.missing.size;
  }

  /**
   * Counters and timings since the loader was created.
   *
   * @returns A snapshot.
   */
  stats(): LoaderStats {
    let queued = 0;
    for (const coords of this.wanted) {
      const key = chunkKey(coords);
      if (!this.loaded.has(key) && !this.missing.has(key) && !this.inFlight.has(key)) queued++;
    }
    return {
      queued,
      started: this.startedCount,
      aborted: this.abortedCount,
      failed: this.failedCount,
      cooling: this.failedAt.size,
      waitMsP50: this.waitTimes.percentile(0.5),
      waitMsP95: this.waitTimes.percentile(0.95),
      requestMsP50: this.requestTimes.percentile(0.5),
      requestMsP95: this.requestTimes.percentile(0.95),
    };
  }

  /**
   * Tells whether a chunk is known to be absent from the world.
   *
   * @param key - Chunk key.
   * @returns `true` if the API said it does not exist.
   */
  isMissing(key: string): boolean {
    return this.missing.has(key);
  }

  /**
   * Tells whether a chunk is being fetched.
   *
   * @param key - Chunk key.
   * @returns `true` while the request runs.
   */
  isLoading(key: string): boolean {
    return this.inFlight.has(key);
  }

  /**
   * Sets which chunks are wanted and starts fetching them.
   *
   * @param chunks - Wanted chunks, most important first.
   */
  setWanted(chunks: readonly ChunkCoords[]): void {
    if (this.disposed) return;
    this.wanted = [...chunks];
    const wantedKeys = new Set(this.wanted.map(chunkKey));
    for (const [key, controller] of this.inFlight) {
      if (!wantedKeys.has(key)) controller.abort();
    }
    // Start the wait clock of chunks that just became wanted and stop it for those that left.
    const now = this.now();
    for (const key of this.wantedSince.keys()) {
      if (!wantedKeys.has(key)) this.wantedSince.delete(key);
    }
    for (const key of wantedKeys) {
      if (this.loaded.has(key) || this.missing.has(key) || this.inFlight.has(key)) continue;
      if (!this.wantedSince.has(key)) this.wantedSince.set(key, now);
    }
    this.pump();
  }

  /**
   * Forgets that a chunk was loaded, so it is fetched again if wanted. Call it when the
   * chunk's data was discarded.
   *
   * @param key - Chunk key.
   */
  forget(key: string): void {
    this.loaded.delete(key);
  }

  /**
   * Cancels every request and stops all timers. The loader cannot be used afterwards.
   */
  dispose(): void {
    this.disposed = true;
    clearTimeout(this.retryTimer);
    for (const controller of this.inFlight.values()) controller.abort();
    this.inFlight.clear();
  }

  /** Starts requests for wanted chunks until the parallel limit is reached. */
  private pump(): void {
    if (this.disposed) return;
    const now = this.now();
    let nextRetryIn = Infinity;

    for (const coords of this.wanted) {
      if (this.inFlight.size >= this.maxConcurrent) break;
      const key = chunkKey(coords);
      if (this.loaded.has(key) || this.missing.has(key) || this.inFlight.has(key)) continue;

      const failedAt = this.failedAt.get(key);
      if (failedAt !== undefined) {
        const waitLeft = failedAt + this.failureCooldownMs - now;
        if (waitLeft > 0) {
          nextRetryIn = Math.min(nextRetryIn, waitLeft);
          continue;
        }
      }
      void this.fetch(coords, key);
    }

    clearTimeout(this.retryTimer);
    if (Number.isFinite(nextRetryIn)) {
      this.retryTimer = setTimeout(() => this.pump(), nextRetryIn);
    }
  }

  /**
   * Fetches one chunk and records the outcome.
   *
   * @param coords - The chunk.
   * @param key - Its key.
   */
  private async fetch(coords: ChunkCoords, key: string): Promise<void> {
    const controller = new AbortController();
    this.inFlight.set(key, controller);
    const startedAt = this.now();
    this.startedCount++;
    this.waitTimes.push(startedAt - (this.wantedSince.get(key) ?? startedAt));
    this.wantedSince.delete(key);
    try {
      const payload = await this.options.fetchChunk(coords.x, coords.z, controller.signal);
      if (this.disposed) return;
      this.requestTimes.push(this.now() - startedAt);
      this.failedAt.delete(key);
      if (payload === null) {
        this.missing.add(key);
        this.options.onMissing?.(coords);
      } else {
        this.loaded.add(key);
        this.options.onLoaded(coords, payload);
      }
    } catch (error) {
      if (this.disposed) return;
      // A cancelled request is not a failure: the chunk simply stopped being wanted.
      if (!(error instanceof ApiError && error.kind === 'aborted') && !controller.signal.aborted) {
        this.failedCount++;
        this.failedAt.set(key, this.now());
        this.options.onError?.(coords, error);
      } else {
        this.abortedCount++;
      }
    } finally {
      this.inFlight.delete(key);
      this.pump();
    }
  }
}

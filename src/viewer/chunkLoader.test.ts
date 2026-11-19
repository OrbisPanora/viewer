import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/errors';
import type { ChunkPayload } from '@/api/chunks';
import { ChunkLoader, type ChunkLoaderOptions } from './chunkLoader';

const PAYLOAD: ChunkPayload = { tiles: [['a.webp', 0, 0]], surfaceY: 1 };

/** A fetch whose calls the test settles by hand. */
function controlledFetch() {
  const calls: {
    x: number;
    z: number;
    signal: AbortSignal;
    resolve: (value: ChunkPayload | null) => void;
    reject: (reason: unknown) => void;
  }[] = [];
  const fetchChunk: ChunkLoaderOptions['fetchChunk'] = (x, z, signal) =>
    new Promise((resolve, reject) => {
      calls.push({ x, z, signal, resolve, reject });
      signal.addEventListener('abort', () => reject(new ApiError('aborted', 'cancelled')));
    });
  return { calls, fetchChunk };
}

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => vi.useRealTimers());

describe('ChunkLoader', () => {
  it('never runs more requests than the limit and starts waiting ones as others finish', async () => {
    const { calls, fetchChunk } = controlledFetch();
    const loader = new ChunkLoader({ fetchChunk, onLoaded: vi.fn(), maxConcurrent: 2 });
    loader.setWanted([
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 2, z: 0 },
    ]);
    expect(calls).toHaveLength(2);
    calls[0]?.resolve(PAYLOAD);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(3);
    expect(calls[2]).toMatchObject({ x: 2, z: 0 });
    loader.dispose();
  });

  it('requests in the given priority order', () => {
    const { calls, fetchChunk } = controlledFetch();
    const loader = new ChunkLoader({ fetchChunk, onLoaded: vi.fn(), maxConcurrent: 1 });
    loader.setWanted([
      { x: 7, z: 7 },
      { x: 0, z: 0 },
    ]);
    expect(calls[0]).toMatchObject({ x: 7, z: 7 });
    loader.dispose();
  });

  it('reports loaded and missing chunks once and never asks for them again', async () => {
    const { calls, fetchChunk } = controlledFetch();
    const onLoaded = vi.fn();
    const onMissing = vi.fn();
    const loader = new ChunkLoader({ fetchChunk, onLoaded, onMissing });
    const wanted = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
    ];
    loader.setWanted(wanted);
    calls[0]?.resolve(PAYLOAD);
    calls[1]?.resolve(null);
    await vi.advanceTimersByTimeAsync(0);
    expect(onLoaded).toHaveBeenCalledWith({ x: 0, z: 0 }, PAYLOAD);
    expect(onMissing).toHaveBeenCalledWith({ x: 1, z: 0 });
    expect(loader.isMissing('1,0')).toBe(true);

    loader.setWanted(wanted);
    expect(calls).toHaveLength(2);
    loader.dispose();
  });

  it('asks again for a chunk after it was forgotten', async () => {
    const { calls, fetchChunk } = controlledFetch();
    const loader = new ChunkLoader({ fetchChunk, onLoaded: vi.fn() });
    loader.setWanted([{ x: 0, z: 0 }]);
    calls[0]?.resolve(PAYLOAD);
    await vi.advanceTimersByTimeAsync(0);
    loader.forget('0,0');
    loader.setWanted([{ x: 0, z: 0 }]);
    expect(calls).toHaveLength(2);
    loader.dispose();
  });

  it('cancels requests for chunks that are no longer wanted', () => {
    const { calls, fetchChunk } = controlledFetch();
    const loader = new ChunkLoader({ fetchChunk, onLoaded: vi.fn() });
    loader.setWanted([{ x: 0, z: 0 }]);
    loader.setWanted([{ x: 9, z: 9 }]);
    expect(calls[0]?.signal.aborted).toBe(true);
    expect(calls[1]).toMatchObject({ x: 9, z: 9 });
    loader.dispose();
  });

  it('does not report a cancellation as an error', async () => {
    const { fetchChunk } = controlledFetch();
    const onError = vi.fn();
    const loader = new ChunkLoader({ fetchChunk, onLoaded: vi.fn(), onError });
    loader.setWanted([{ x: 0, z: 0 }]);
    loader.setWanted([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).not.toHaveBeenCalled();
    loader.dispose();
  });

  it('retries a failed chunk only after the cool-down', async () => {
    const { calls, fetchChunk } = controlledFetch();
    const onError = vi.fn();
    let now = 0;
    const loader = new ChunkLoader({
      fetchChunk,
      onLoaded: vi.fn(),
      onError,
      failureCooldownMs: 1000,
      now: () => now,
    });
    loader.setWanted([{ x: 0, z: 0 }]);
    calls[0]?.reject(new ApiError('network', 'down'));
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(1);

    now = 1000;
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toHaveLength(2);
    loader.dispose();
  });

  it('stops everything when disposed', async () => {
    const { calls, fetchChunk } = controlledFetch();
    const onLoaded = vi.fn();
    const loader = new ChunkLoader({ fetchChunk, onLoaded });
    loader.setWanted([{ x: 0, z: 0 }]);
    loader.dispose();
    expect(calls[0]?.signal.aborted).toBe(true);
    loader.setWanted([{ x: 1, z: 1 }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
    expect(onLoaded).not.toHaveBeenCalled();
  });
});

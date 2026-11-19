import { describe, expect, it } from 'vitest';
import {
  CHUNK_SIZE,
  chunkCenter,
  chunkKey,
  parseChunkKey,
  screenDeltaToWorld,
  sortByDistance,
  visibleChunks,
  worldToChunk,
  worldToIso,
} from './projection';

describe('chunk helpers', () => {
  it('maps negative blocks to negative chunks', () => {
    expect(worldToChunk(-1, -16)).toEqual({ x: -1, z: -1 });
    expect(worldToChunk(0, 15.9)).toEqual({ x: 0, z: 0 });
    expect(worldToChunk(16, -17)).toEqual({ x: 1, z: -2 });
  });

  it('round-trips a key', () => {
    expect(parseChunkKey(chunkKey({ x: -3, z: 12 }))).toEqual({ x: -3, z: 12 });
  });

  it('finds the middle of a chunk', () => {
    expect(chunkCenter({ x: 2, z: -1 })).toEqual({ x: 2 * CHUNK_SIZE + 8, z: -CHUNK_SIZE + 8 });
  });
});

describe('isometric projection', () => {
  it('places the origin at the origin and moves along the diagonals', () => {
    expect(worldToIso({ x: 0, z: 0 })).toEqual({ x: 0, y: 0 });
    expect(worldToIso({ x: 1, z: 0 })).toEqual({ x: 16, y: 8 });
    expect(worldToIso({ x: 0, z: 1 })).toEqual({ x: -16, y: 8 });
  });

  it('inverts a screen drag into world movement', () => {
    const world = { x: 3, z: -7 };
    const iso = worldToIso(world);
    const back = screenDeltaToWorld(iso.x, iso.y, 1);
    expect(back.x).toBeCloseTo(world.x);
    expect(back.z).toBeCloseTo(world.z);
  });

  it('scales a drag by the zoom', () => {
    const near = screenDeltaToWorld(32, 0, 2);
    const far = screenDeltaToWorld(32, 0, 1);
    expect(near.x).toBeCloseTo(far.x / 2);
  });
});

describe('visibleChunks', () => {
  const viewport = { width: 1920, height: 1080 };

  it('contains the chunk under the camera', () => {
    const chunks = visibleChunks({ x: 40, z: -40 }, 1, viewport);
    expect(chunks).toContainEqual({ x: 2, z: -3 });
  });

  it('has no duplicates', () => {
    const chunks = visibleChunks({ x: 0, z: 0 }, 1, viewport);
    expect(new Set(chunks.map(chunkKey)).size).toBe(chunks.length);
  });

  it('covers more chunks when zoomed out', () => {
    const close = visibleChunks({ x: 0, z: 0 }, 2, viewport).length;
    const far = visibleChunks({ x: 0, z: 0 }, 0.5, viewport).length;
    expect(far).toBeGreaterThan(close);
  });

  it('grows with the margin', () => {
    const base = visibleChunks({ x: 0, z: 0 }, 1, viewport).length;
    expect(visibleChunks({ x: 0, z: 0 }, 1, viewport, 2).length).toBeGreaterThan(base);
  });

  it('is a diamond, so the corner of the bounding square is left out', () => {
    const chunks = visibleChunks({ x: 0, z: 0 }, 1, viewport);
    const radius = Math.max(...chunks.map((c) => Math.abs(c.x)));
    expect(chunks).not.toContainEqual({ x: radius, z: radius });
  });
});

describe('sortByDistance', () => {
  it('puts the nearest chunk first and leaves the input alone', () => {
    const input = [
      { x: 5, z: 5 },
      { x: 0, z: 0 },
      { x: 1, z: 0 },
    ];
    const sorted = sortByDistance(input, { x: 0, z: 0 });
    expect(sorted[0]).toEqual({ x: 0, z: 0 });
    expect(sorted[2]).toEqual({ x: 5, z: 5 });
    expect(input[0]).toEqual({ x: 5, z: 5 });
  });
});

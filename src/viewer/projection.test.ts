import { describe, expect, it } from 'vitest';
import {
  CHUNK_SIZE,
  chunkCenter,
  chunkKey,
  parseChunkKey,
  projectBlocks,
  screenDeltaToWorld,
  sortByDistance,
  spriteName,
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

describe('spriteName', () => {
  it('keeps the namespace, so blocks of different mods stay different', () => {
    expect(spriteName('minecraft:grass_block')).toBe('minecraft:grass_block');
    expect(spriteName('create:andesite_casing')).toBe('create:andesite_casing');
    expect(spriteName('minecraft:andesite')).not.toBe(spriteName('othermod:andesite'));
  });

  it('adds minecraft: to a name that has no namespace', () => {
    expect(spriteName('stone')).toBe('minecraft:stone');
  });
});

describe('projectBlocks', () => {
  /** Blocks of a chunk, built from lists of [x, y, z, palette index]. */
  function blocks(palette: string[], rows: number[][]) {
    return {
      palette,
      x: Uint8Array.from(rows.map((r) => r[0] ?? 0)),
      y: Int16Array.from(rows.map((r) => r[1] ?? 0)),
      z: Uint8Array.from(rows.map((r) => r[2] ?? 0)),
      block: Uint16Array.from(rows.map((r) => r[3] ?? 0)),
    };
  }

  it('places a block with the formulas the API used before 0.2.0', () => {
    // Chunk (1, -2), block (3, 70, 4): gx = 19, gz = -28.
    const tiles = projectBlocks({ x: 1, z: -2 }, blocks(['minecraft:stone'], [[3, 70, 4, 0]]));
    expect(tiles).toEqual([['minecraft:stone', 16 * (19 - -28), 8 * (19 + -28) - 16 * 70]]);
  });

  it('gives the numbers recorded in the API reference for its fixture chunk (1, 0)', () => {
    // The first three blocks of that chunk, as the API sent them before 0.2.0: [minecraft:water, 256, -864] and so on (the frame name had .webp then).
    const tiles = projectBlocks(
      { x: 1, z: 0 },
      blocks(
        ['minecraft:water'],
        [
          [0, 62, 0, 0],
          [1, 62, 0, 0],
          [2, 62, 0, 0],
        ],
      ),
    );
    expect(tiles).toEqual([
      ['minecraft:water', 256, -864],
      ['minecraft:water', 272, -856],
      ['minecraft:water', 288, -848],
    ]);
  });

  it('keeps the order of the blocks and uses the palette for the frame', () => {
    const tiles = projectBlocks(
      { x: 0, z: 0 },
      blocks(
        ['minecraft:dirt', 'minecraft:grass_block'],
        [
          [0, 63, 0, 1],
          [1, 63, 0, 0],
          [0, 64, 1, 1],
        ],
      ),
    );
    expect(tiles.map((tile) => tile[0])).toEqual([
      'minecraft:grass_block',
      'minecraft:dirt',
      'minecraft:grass_block',
    ]);
  });

  it('puts a block one level up 16 pixels higher on screen', () => {
    const [low, high] = projectBlocks(
      { x: 0, z: 0 },
      blocks(
        ['minecraft:stone'],
        [
          [2, 10, 3, 0],
          [2, 11, 3, 0],
        ],
      ),
    );
    expect(low?.[1]).toBe(high?.[1]);
    expect((low?.[2] ?? 0) - (high?.[2] ?? 0)).toBe(16);
  });

  it('gives no tiles for no blocks', () => {
    expect(projectBlocks({ x: 0, z: 0 }, blocks([], []))).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { brightness, CELL, faceTransform, nearness, project, type Matrix } from './geometry';
import type { Face } from './models';

const top: Face = {
  corners: [
    [0, 16, 0],
    [16, 16, 0],
    [16, 16, 16],
    [0, 16, 16],
  ],
  uv: [0, 0, 16, 16],
  turns: 0,
  texture: 'minecraft:block/stone',
  tint: null,
  shaded: true,
};
const east: Face = {
  corners: [
    [16, 16, 16],
    [16, 16, 0],
    [16, 0, 0],
    [16, 0, 16],
  ],
  uv: [0, 0, 16, 16],
  turns: 0,
  texture: 'minecraft:block/stone',
  tint: null,
  shaded: true,
};
const south: Face = {
  corners: [
    [0, 16, 16],
    [16, 16, 16],
    [16, 0, 16],
    [0, 0, 16],
  ],
  uv: [0, 0, 16, 16],
  turns: 0,
  texture: 'minecraft:block/stone',
  tint: null,
  shaded: true,
};

/** Applies a transform to a texture pixel. */
function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
}

describe('project', () => {
  it('puts the corners of a cube where the sprite of a cube has them', () => {
    expect(CELL).toBe(32);
    expect(project([0, 16, 0])).toEqual([16, 0]);
    expect(project([16, 16, 0])).toEqual([32, 8]);
    expect(project([0, 16, 16])).toEqual([0, 8]);
    expect(project([16, 16, 16])).toEqual([16, 16]);
    expect(project([16, 0, 16])).toEqual([16, 32]);
    expect(project([0, 0, 0])).toEqual([16, 16]);
  });
});

describe('faceTransform', () => {
  it('maps the corners of the top texture onto the top diamond', () => {
    const m = faceTransform(top, 16)!;
    expect(apply(m, 0, 0)).toEqual([16, 0]);
    expect(apply(m, 16, 0)).toEqual([32, 8]);
    expect(apply(m, 16, 16)).toEqual([16, 16]);
    expect(apply(m, 0, 16)).toEqual([0, 8]);
  });

  it('maps the corners of the south texture onto the lower left side', () => {
    const m = faceTransform(south, 16)!;
    expect(apply(m, 0, 0)).toEqual([0, 8]);
    expect(apply(m, 16, 16)).toEqual([16, 32]);
  });

  it('maps the corners of the east texture onto the lower right side', () => {
    const m = faceTransform(east, 16)!;
    expect(apply(m, 0, 0)).toEqual([16, 16]);
    expect(apply(m, 16, 0)).toEqual([32, 8]);
    expect(apply(m, 0, 16)).toEqual([16, 32]);
  });

  it('scales to the size of the texture', () => {
    const m = faceTransform(top, 32)!;
    expect(apply(m, 32, 32)).toEqual([16, 16]);
  });

  it('shows only the part of the texture named by the uv', () => {
    const m = faceTransform({ ...top, uv: [8, 0, 16, 16] }, 16)!;
    expect(apply(m, 8, 0)).toEqual([16, 0]);
    expect(apply(m, 16, 0)).toEqual([32, 8]);
  });

  it('turns the texture by a quarter turn', () => {
    const m = faceTransform({ ...top, turns: 1 }, 16)!;
    // The texture's top left corner is now at the face's top right corner.
    expect(apply(m, 0, 0)).toEqual([32, 8]);
  });

  it('flips the texture when the uv runs backwards', () => {
    const m = faceTransform({ ...top, uv: [16, 0, 0, 16] }, 16)!;
    expect(apply(m, 16, 0)).toEqual([16, 0]);
  });

  it('gives nothing for an empty part', () => {
    expect(faceTransform({ ...top, uv: [4, 0, 4, 16] }, 16)).toBeUndefined();
    expect(faceTransform({ ...top, uv: [0, 4, 16, 4] }, 16)).toBeUndefined();
  });

  it('pushes the corners outward when asked to grow', () => {
    const plain = faceTransform(top, 16)!;
    const grown = faceTransform(top, 16, 0.5)!;
    expect(apply(grown, 0, 0)[1]).toBeLessThan(apply(plain, 0, 0)[1]);
    expect(apply(grown, 16, 16)[1]).toBeGreaterThan(apply(plain, 16, 16)[1]);
  });
});

describe('brightness', () => {
  it('uses the light of Minecraft for each side', () => {
    expect(brightness(top)).toBeCloseTo(1);
    expect(brightness(south)).toBeCloseTo(0.8);
    expect(brightness(east)).toBeCloseTo(0.6);
  });

  it('is 1 when the face is not shaded', () => {
    expect(brightness({ ...east, shaded: false })).toBe(1);
  });

  it('is 1 for a face with no area', () => {
    const flat = {
      ...top,
      corners: [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ],
    } as unknown as Face;
    expect(brightness(flat)).toBe(1);
  });
});

describe('nearness', () => {
  it('is larger for a face nearer the camera', () => {
    expect(nearness(top)).toBeGreaterThan(
      nearness({
        ...top,
        corners: [
          [0, 0, 0],
          [16, 0, 0],
          [16, 0, 16],
          [0, 0, 16],
        ],
      }),
    );
  });
});

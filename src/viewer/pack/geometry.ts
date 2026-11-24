/**
 * The drawing rules of a block sprite: where a point of a block lands in the 32 x 32 cell, how a texture
 * is mapped onto a face, and how dark a face is. These are plain calculations; the canvas work is in
 * `render.ts`.
 *
 * The cell has the same projection as the map: a block corner (x, y, z), in sixteenths of a block, is at
 * `(x - z + 16, (x + z) / 2 - y + 16)` pixels. The top of the block is a diamond 32 pixels wide and 16
 * high, and the sides below it are 16 pixels high.
 */
import { faceNormal, type Face, type Vec3 } from './models';

/** Width and height of one sprite, in pixels. */
export const CELL = 32;

/** An affine transform in the form the canvas takes: `x' = a x + c y + e`, `y' = b x + d y + f`. */
export interface Matrix {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

/**
 * Projects a point of a block into the cell.
 *
 * @param point - Position in sixteenths of a block.
 * @returns Pixel position in the cell.
 */
export function project(point: Vec3): [number, number] {
  return [point[0] - point[2] + 16, (point[0] + point[2]) / 2 - point[1] + 16];
}

/**
 * How bright a face is. This is Minecraft's lighting: 1 for a face turned up, 0.8 for north and south,
 * 0.6 for east and west, 0.5 for a face turned down. Other directions are a mix of these.
 *
 * @param face - The face.
 * @returns A factor between 0.5 and 1.
 */
export function brightness(face: Face): number {
  if (!face.shaded) return 1;
  const n = faceNormal(face.corners);
  const length = Math.hypot(n[0], n[1], n[2]);
  if (length === 0) return 1;
  const [x, y, z] = [n[0] / length, n[1] / length, n[2] / length];
  return x * x * 0.6 + z * z * 0.8 + (y > 0 ? y * y : y * y * 0.5);
}

/**
 * The distance of a face from the camera, for drawing the far faces first. A larger value is nearer.
 *
 * @param face - The face.
 * @returns The sum of the centre's coordinates.
 */
export function nearness(face: Face): number {
  const sum = face.corners.reduce((s, c) => s + c[0] + c[1] + c[2], 0);
  return sum / 4;
}

/**
 * The transform that draws the pixels of a texture onto a face.
 *
 * The texture is square (an animated texture is cut to its first frame). The transform takes a pixel
 * position in the texture and gives a position in the cell. Because the projection is affine, the three
 * points that fix the transform also place the fourth corner.
 *
 * @param face - The face.
 * @param textureSize - Width of the texture frame in pixels.
 * @param grow - How many pixels to push every corner away from the centre, so neighbouring faces overlap
 *   a little and leave no seam.
 * @returns The transform, or `undefined` if the part of the texture shown has no width or no height.
 */
export function faceTransform(face: Face, textureSize: number, grow = 0): Matrix | undefined {
  const [u1, v1, u2, v2] = face.uv;
  if (u1 === u2 || v1 === v2) return undefined;

  let corners = face.corners.map(project);
  if (grow > 0) {
    const cx = corners.reduce((s, c) => s + c[0], 0) / 4;
    const cy = corners.reduce((s, c) => s + c[1], 0) / 4;
    corners = corners.map(([x, y]) => {
      const length = Math.hypot(x - cx, y - cy);
      return length === 0
        ? [x, y]
        : [x + ((x - cx) / length) * grow, y + ((y - cy) / length) * grow];
    });
  }
  // A quarter turn of the texture moves its top left corner to the next corner of the face.
  const at = (offset: number): [number, number] =>
    corners[(face.turns + offset) % 4] as [number, number];
  const [x0, y0] = at(0);
  const [x1, y1] = at(1);
  const [x2, y2] = at(3);

  const ux = (x1 - x0) / (u2 - u1);
  const uy = (y1 - y0) / (u2 - u1);
  const vx = (x2 - x0) / (v2 - v1);
  const vy = (y2 - y0) / (v2 - v1);
  const scale = 16 / textureSize;
  return {
    a: ux * scale,
    b: uy * scale,
    c: vx * scale,
    d: vy * scale,
    e: x0 - u1 * ux - v1 * vx,
    f: y0 - u1 * uy - v1 * vy,
  };
}

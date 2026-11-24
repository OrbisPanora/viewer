/**
 * Draws the block sprites into one atlas image.
 *
 * Each block is drawn into a 32 x 32 cell: its faces are sorted from far to near, and the texture of each
 * is mapped onto the face with the transform from `geometry.ts`. The atlas has 32 cells in a row. It uses
 * canvas APIs that the browser has and the test environment does not, so it is not unit tested; the
 * calculations it relies on are.
 */
import { brightness, CELL, faceTransform, nearness } from './geometry';
import type { BlockModel, Face } from './models';
import type { Progress } from './pack';

/** Cells in a row of the atlas. */
const COLUMNS = 32;
/** Pixels the corners of each face are pushed outward, so that neighbouring faces leave no seam. */
const GROW = 0.4;

/** Position of a sprite in the atlas, in pixels. */
export interface Frame {
  readonly x: number;
  readonly y: number;
}

/** A finished atlas. */
export interface RenderedAtlas {
  /** The PNG image. */
  readonly image: Blob;
  /** Position of the sprite of each block, by block name with namespace. */
  readonly frames: Record<string, Frame>;
}

/** One texture, cut to its first frame. */
interface Texture {
  readonly canvas: OffscreenCanvas;
  readonly size: number;
}

/**
 * Decodes PNG files and cuts animated ones to their first frame.
 *
 * A texture that is taller than wide is a strip of frames, each as tall as the texture is wide.
 *
 * @param files - PNG bytes by texture id.
 * @returns The first frame of each texture.
 */
async function decodeTextures(files: Map<string, Uint8Array>): Promise<Map<string, Texture>> {
  const textures = new Map<string, Texture>();
  for (const [id, bytes] of files) {
    const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: 'image/png' }));
    const size = bitmap.width;
    const canvas = new OffscreenCanvas(size, size);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, size, size, 0, 0, size, size);
    bitmap.close();
    textures.set(id, { canvas, size });
  }
  return textures;
}

/**
 * Multiplies the colour of a texture by a tint and a brightness.
 *
 * @param texture - The texture.
 * @param tint - Colour as 0xRRGGBB, or `null`.
 * @param factor - Brightness between 0 and 1.
 * @returns A canvas with the result; the texture's own canvas if nothing changes.
 */
function shaded(texture: Texture, tint: number | null, factor: number): OffscreenCanvas {
  if (tint === null && factor === 1) return texture.canvas;
  const canvas = new OffscreenCanvas(texture.size, texture.size);
  const context = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
  context.drawImage(texture.canvas, 0, 0);
  const image = context.getImageData(0, 0, texture.size, texture.size);
  const [r, g, b] =
    tint === null ? [1, 1, 1] : [(tint >> 16) / 255, ((tint >> 8) & 255) / 255, (tint & 255) / 255];
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i] = (image.data[i] as number) * r * factor;
    image.data[i + 1] = (image.data[i + 1] as number) * g * factor;
    image.data[i + 2] = (image.data[i + 2] as number) * b * factor;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

/**
 * Draws one block into its cell.
 *
 * @param context - The atlas context.
 * @param block - The faces of the block.
 * @param textures - The decoded textures.
 * @param variants - Cache of tinted and shaded textures.
 * @param x - Left edge of the cell.
 * @param y - Top edge of the cell.
 * @returns Whether anything was drawn.
 */
function drawBlock(
  context: OffscreenCanvasRenderingContext2D,
  block: BlockModel,
  textures: Map<string, Texture>,
  variants: Map<string, OffscreenCanvas>,
  x: number,
  y: number,
): boolean {
  const faces: Face[] = block.faces.filter((face) => textures.has(face.texture));
  if (faces.length === 0) return false;
  faces.sort((a, b) => nearness(a) - nearness(b));

  context.save();
  context.beginPath();
  context.rect(x, y, CELL, CELL);
  context.clip();
  context.imageSmoothingEnabled = false;
  context.globalAlpha = block.alpha;
  for (const face of faces) {
    const texture = textures.get(face.texture) as Texture;
    const matrix = faceTransform(face, texture.size, GROW);
    if (!matrix) continue;
    const factor = Math.round(brightness(face) * 1000) / 1000;
    const key = `${face.texture}|${face.tint}|${factor}`;
    let source = variants.get(key);
    if (!source) {
      source = shaded(texture, face.tint, factor);
      variants.set(key, source);
    }
    const [u1, v1, u2, v2] = face.uv;
    const scale = texture.size / 16;
    const sx = Math.min(u1, u2) * scale;
    const sy = Math.min(v1, v2) * scale;
    const sw = Math.abs(u2 - u1) * scale;
    const sh = Math.abs(v2 - v1) * scale;
    context.setTransform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e + x, matrix.f + y);
    context.drawImage(source, sx, sy, sw, sh, sx, sy, sw, sh);
  }
  context.restore();
  return true;
}

/**
 * Draws the sprite of every block into an atlas.
 *
 * @param blocks - The faces of each block.
 * @param files - PNG bytes of the textures the faces use, by texture id.
 * @param progress - Called as blocks are drawn.
 * @returns The atlas image and the position of each block's sprite. Blocks with no usable texture have none.
 */
export async function renderAtlas(
  blocks: Map<string, BlockModel>,
  files: Map<string, Uint8Array>,
  progress?: Progress,
): Promise<RenderedAtlas> {
  const textures = await decodeTextures(files);
  const names = [...blocks.keys()].sort();
  const canvas = new OffscreenCanvas(COLUMNS * CELL, Math.ceil(names.length / COLUMNS) * CELL);
  const context = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
  const variants = new Map<string, OffscreenCanvas>();
  const frames: Record<string, Frame> = {};

  let cell = 0;
  for (const [i, name] of names.entries()) {
    const x = (cell % COLUMNS) * CELL;
    const y = Math.floor(cell / COLUMNS) * CELL;
    if (drawBlock(context, blocks.get(name) as BlockModel, textures, variants, x, y)) {
      frames[name] = { x, y };
      cell++;
    }
    if (i % 50 === 0) progress?.('Drawing block sprites', i, names.length);
  }
  progress?.('Drawing block sprites', names.length, names.length);
  return { image: await canvas.convertToBlob({ type: 'image/png' }), frames };
}

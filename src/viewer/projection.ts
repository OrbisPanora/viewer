/**
 * Isometric projection and chunk geometry.
 *
 * World coordinates are Minecraft block coordinates (`x` east, `z` south). A block at world
 * position `(x, y, z)` is drawn at `screen.x = (x - z) * TILE_WIDTH / 2` and
 * `screen.y = (x + z) * TILE_HEIGHT / 2 - y * LEVEL_HEIGHT`. The API sends block positions,
 * and {@link projectBlocks} applies this to a chunk. This module has no dependency on Vue or
 * pixi.js so that it can be unit tested.
 */
import type { ChunkBlocks, Tile } from '@/api/chunks';

/** Width of one block's sprite, in pixels. */
export const TILE_WIDTH = 32;
/** Height of the top face of one block, in pixels. */
export const TILE_HEIGHT = 16;
/** Blocks along one side of a chunk. */
export const CHUNK_SIZE = 16;
/** Pixels that one block level moves a sprite up or down. */
export const LEVEL_HEIGHT = 16;

/** Position of a chunk, in chunk units (one unit is 16 blocks). */
export interface ChunkCoords {
  readonly x: number;
  readonly z: number;
}

/** A point in world (block) coordinates. */
export interface WorldPoint {
  readonly x: number;
  readonly z: number;
}

/** A point on screen or in the isometric layer, in pixels. */
export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/** Size of the drawing area, in pixels. */
export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/**
 * Builds the string that identifies a chunk in maps and sets.
 *
 * @param coords - The chunk.
 * @returns A key such as `"3,-2"`.
 */
export function chunkKey(coords: ChunkCoords): string {
  return `${coords.x},${coords.z}`;
}

/**
 * Reads back the coordinates from a key made by {@link chunkKey}.
 *
 * @param key - A key such as `"3,-2"`.
 * @returns The chunk coordinates.
 */
export function parseChunkKey(key: string): ChunkCoords {
  const [x, z] = key.split(',').map(Number);
  return { x: x ?? 0, z: z ?? 0 };
}

/**
 * Finds the chunk that contains a block column.
 *
 * @param worldX - Block X.
 * @param worldZ - Block Z.
 * @returns The chunk coordinates. Negative blocks map to negative chunks.
 */
export function worldToChunk(worldX: number, worldZ: number): ChunkCoords {
  return { x: Math.floor(worldX / CHUNK_SIZE), z: Math.floor(worldZ / CHUNK_SIZE) };
}

/**
 * Gives the block coordinates of the middle of a chunk.
 *
 * @param coords - The chunk.
 * @returns The centre in blocks.
 */
export function chunkCenter(coords: ChunkCoords): WorldPoint {
  return { x: coords.x * CHUNK_SIZE + CHUNK_SIZE / 2, z: coords.z * CHUNK_SIZE + CHUNK_SIZE / 2 };
}

/**
 * Projects a world point to the isometric layer.
 *
 * @param point - A point in blocks.
 * @returns Its position in pixels, before camera and zoom.
 */
export function worldToIso(point: WorldPoint): ScreenPoint {
  return {
    x: ((point.x - point.z) * TILE_WIDTH) / 2,
    y: ((point.x + point.z) * TILE_HEIGHT) / 2,
  };
}

/**
 * Converts a drag on screen into the matching movement in the world.
 *
 * This inverts {@link worldToIso}. Dragging right and down by the same amount moves along
 * world Z only, because the screen's diagonal axes are the world's axes.
 *
 * @param dx - Horizontal movement in screen pixels.
 * @param dy - Vertical movement in screen pixels.
 * @param zoom - Current zoom factor.
 * @returns The same movement in blocks.
 */
export function screenDeltaToWorld(dx: number, dy: number, zoom: number): WorldPoint {
  const relativeX = dx / ((TILE_WIDTH / 2) * zoom);
  const relativeY = dy / ((TILE_HEIGHT / 2) * zoom);
  return { x: (relativeX + relativeY) / 2, z: (relativeY - relativeX) / 2 };
}

/**
 * Lists the chunks around the camera that can appear on screen.
 *
 * The visible part of an isometric world is a rotated rectangle. A diamond (Manhattan
 * distance) of chunks around the camera covers it with some waste at the corners, which
 * is cheaper than computing the exact shape and doubles as a loading margin.
 *
 * @param camera - Camera position in blocks.
 * @param zoom - Current zoom factor.
 * @param viewport - Size of the drawing area.
 * @param marginChunks - Extra chunks beyond the screen edge, to load before they scroll in.
 * @returns Chunk coordinates, unsorted.
 */
export function visibleChunks(
  camera: WorldPoint,
  zoom: number,
  viewport: Viewport,
  marginChunks = 0,
): ChunkCoords[] {
  const halfDiagonal = Math.hypot(viewport.width, viewport.height) / 2;
  const radiusBlocks = halfDiagonal / ((TILE_WIDTH / 2) * zoom);
  const radius = Math.ceil(radiusBlocks / CHUNK_SIZE) + 1 + marginChunks;
  const center = worldToChunk(camera.x, camera.z);

  const result: ChunkCoords[] = [];
  for (let x = center.x - radius; x <= center.x + radius; x++) {
    for (let z = center.z - radius; z <= center.z + radius; z++) {
      if (Math.abs(x - center.x) + Math.abs(z - center.z) <= radius) result.push({ x, z });
    }
  }
  return result;
}

/**
 * Sorts chunks by distance from a point, nearest first.
 *
 * @param chunks - Chunks to order.
 * @param around - Point to measure from, in blocks.
 * @returns A new sorted array.
 */
export function sortByDistance(chunks: readonly ChunkCoords[], around: WorldPoint): ChunkCoords[] {
  const origin = worldToChunk(around.x, around.z);
  const distance = (c: ChunkCoords): number => (c.x - origin.x) ** 2 + (c.z - origin.z) ** 2;
  return [...chunks].sort((a, b) => distance(a) - distance(b));
}

/**
 * The atlas frame of a block.
 *
 * @param blockName - Block name with its namespace, for example `minecraft:grass_block`.
 * @returns The frame name, for example `grass_block.webp`. The namespace is not part of it yet.
 */
export function spriteName(blockName: string): string {
  return `${blockName.slice(blockName.indexOf(':') + 1)}.webp`;
}

/**
 * Turns the blocks of a chunk into tiles: the frame of each block and its position in the layer
 * that holds every chunk. The tiles keep the order of the blocks, which is the draw order.
 *
 * @param chunk - The chunk the blocks belong to.
 * @param blocks - Block positions inside the chunk and their palette indices.
 * @returns One tile per block.
 */
export function projectBlocks(chunk: ChunkCoords, blocks: ChunkBlocks): Tile[] {
  const sprites = blocks.palette.map(spriteName);
  const originX = chunk.x * CHUNK_SIZE;
  const originZ = chunk.z * CHUNK_SIZE;
  const tiles: Tile[] = new Array<Tile>(blocks.x.length);
  for (let i = 0; i < tiles.length; i++) {
    const iso = worldToIso({ x: originX + (blocks.x[i] ?? 0), z: originZ + (blocks.z[i] ?? 0) });
    tiles[i] = [
      sprites[blocks.block[i] ?? 0] ?? '',
      iso.x,
      iso.y - (blocks.y[i] ?? 0) * LEVEL_HEIGHT,
    ];
  }
  return tiles;
}

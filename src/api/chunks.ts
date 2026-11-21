/**
 * API call that fetches the blocks of one chunk that can be seen.
 */
import { apiJson } from './client';
import { ApiError } from './errors';
import { asArray, asNumber, asRecord, asString, unwrapEnvelope } from './guards';

/**
 * One block to draw: the atlas frame name and its pixel position inside the chunk layer.
 * It is computed from a block's position by `projectBlocks` in `viewer/projection.ts`.
 */
export type Tile = readonly [texture: string, x: number, y: number];

/**
 * The blocks of a chunk that the API sends: for each block its position inside the chunk and its
 * index in `palette`. The arrays have the same length and are in the order z, x, y (the draw order
 * for the current view).
 */
export interface ChunkBlocks {
  /** Block names with their namespace, for example `minecraft:stone`. */
  readonly palette: readonly string[];
  /** X inside the chunk, 0 to 15. */
  readonly x: Uint8Array;
  /** Height of each block. */
  readonly y: Int16Array;
  /** Z inside the chunk, 0 to 15. */
  readonly z: Uint8Array;
  /** Index in `palette`. */
  readonly block: Uint16Array;
}

/** The drawable content of one chunk. */
export interface ChunkPayload {
  /** The blocks to draw. Never empty: an empty chunk is reported as missing. */
  readonly blocks: ChunkBlocks;
  /** Height of the lowest surface, used to shift the camera so terrain stays centred vertically. */
  readonly surfaceY: number;
}

/**
 * Lowest Y the API is asked to start from. The API names this parameter `chunk_h`; -60 is
 * just under the overworld's lowest block (-64) and is what the original viewer sent.
 */
export const CHUNK_BASE_HEIGHT = -60;

/**
 * Fetches the blocks of a chunk that can be seen, as positions and a palette.
 *
 * @param x - Chunk X coordinate.
 * @param z - Chunk Z coordinate.
 * @param signal - Cancels the request, for example when the chunk scrolls out of view.
 * @returns The chunk's content, or `null` when the world has no such chunk.
 * @throws {ApiError} On network failure, a server error or a malformed answer.
 */
export async function fetchChunk(
  x: number,
  z: number,
  signal?: AbortSignal,
): Promise<ChunkPayload | null> {
  const path = `/api/chunks/${x}/${z}/${CHUNK_BASE_HEIGHT}?mode=isometric`;
  let body: unknown;
  try {
    body = await apiJson(path, signal ? { signal } : {});
  } catch (error) {
    if (error instanceof ApiError && error.kind === 'http' && error.status === 404) return null;
    throw error;
  }

  const data = unwrapEnvelope(body);
  if (data === null) return null;
  const record = asRecord(data, 'response.data');
  const xs = integers(record.x, 'data.x', 0, 15);
  if (xs.length === 0) return null;

  const palette = asArray(record.palette, 'data.palette').map((name, index) =>
    asString(name, `data.palette[${index}]`),
  );
  const ys = integers(record.y, 'data.y', -2048, 2047);
  const zs = integers(record.z, 'data.z', 0, 15);
  const ids = integers(record.block, 'data.block', 0, Math.max(0, palette.length - 1));
  if (ys.length !== xs.length || zs.length !== xs.length || ids.length !== xs.length) {
    throw new ApiError(
      'parse',
      'Unexpected response from the API: data.x, y, z and block differ in length.',
    );
  }
  if (palette.length === 0) {
    throw new ApiError(
      'parse',
      'Unexpected response from the API: data.palette is empty but blocks were sent.',
    );
  }
  return {
    blocks: {
      palette,
      x: Uint8Array.from(xs),
      y: Int16Array.from(ys),
      z: Uint8Array.from(zs),
      block: Uint16Array.from(ids),
    },
    surfaceY: asNumber(record.surface_y, 'data.surface_y'),
  };
}

/**
 * Checks a list of whole numbers within a range.
 *
 * @param value - The value to check.
 * @param path - Location of the value, for the error message.
 * @param min - Smallest allowed value.
 * @param max - Largest allowed value.
 * @returns The numbers.
 * @throws {ApiError} If it is not a list of integers in the range.
 */
function integers(value: unknown, path: string, min: number, max: number): number[] {
  return asArray(value, path).map((entry, index) => {
    const number = asNumber(entry, `${path}[${index}]`);
    if (!Number.isInteger(number) || number < min || number > max) {
      throw new ApiError(
        'parse',
        `Unexpected response from the API: ${path}[${index}] should be a whole number from ${min} to ${max}.`,
      );
    }
    return number;
  });
}

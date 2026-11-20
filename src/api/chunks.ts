/**
 * API call that fetches the drawable surface of one chunk.
 */
import { apiJson } from './client';
import { ApiError } from './errors';
import { asArray, asNumber, asRecord, asString, unwrapEnvelope } from './guards';

/**
 * One block to draw: the atlas frame name and its pixel position inside the chunk layer.
 * The API computes the positions, so the client only places the sprites.
 */
export type Tile = readonly [texture: string, x: number, y: number];

/** The drawable content of one chunk. */
export interface ChunkPayload {
  /** Blocks to draw, back to front. Never empty: an empty chunk is reported as missing. */
  readonly tiles: readonly Tile[];
  /** Height of the surface, used to shift the camera so terrain stays centred vertically. */
  readonly surfaceY: number;
}

/**
 * Lowest Y the API is asked to start from. The API names this parameter `chunk_h`; -60 is
 * just under the overworld's lowest block (-64) and is what the original viewer sent.
 */
export const CHUNK_BASE_HEIGHT = -60;

/**
 * Fetches the surface blocks of a chunk.
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
  if (record.surface_blocks === null || record.surface_blocks === undefined) return null;

  const rows = asArray(record.surface_blocks, 'data.surface_blocks');
  if (rows.length === 0) return null;

  const tiles = rows.map((row, index): Tile => {
    const cells = asArray(row, `data.surface_blocks[${index}]`);
    return [
      asString(cells[0], `data.surface_blocks[${index}][0]`),
      asNumber(cells[1], `data.surface_blocks[${index}][1]`),
      asNumber(cells[2], `data.surface_blocks[${index}][2]`),
    ];
  });
  const surfaceY = typeof record.palette === 'number' ? record.palette : 0;
  return { tiles, surfaceY };
}

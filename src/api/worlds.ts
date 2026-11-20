/**
 * API calls about the loaded world.
 */
import { apiJson } from './client';
import { ApiError } from './errors';
import { asArray, asBoolean, asNumber, asRecord, unwrapEnvelope } from './guards';

/**
 * Asks the API whether a world is loaded and ready to serve chunks.
 *
 * @param signal - Cancels the request.
 * @returns `true` when a world is loaded.
 * @throws {ApiError} If the API cannot be reached or answers in an unexpected shape.
 */
export async function fetchWorldLoaded(signal?: AbortSignal): Promise<boolean> {
  const body = asRecord(await apiJson('/api/worlds/health', signal ? { signal } : {}), 'response');
  return asBoolean(body.world_loaded, 'response.world_loaded');
}

/**
 * Lists the regions (32 by 32 chunk areas) of the loaded world.
 *
 * The viewer uses it to start the camera over terrain that exists instead of at the origin,
 * which may be empty. An unloaded world, or an old API without the endpoint, gives `[]`.
 *
 * @param signal - Cancels the request.
 * @returns Region coordinates as `[x, z]` pairs.
 * @throws {ApiError} On network failure or a malformed answer.
 */
export async function fetchWorldRegions(signal?: AbortSignal): Promise<[number, number][]> {
  try {
    const data = asRecord(
      unwrapEnvelope(await apiJson('/api/worlds/current', signal ? { signal } : {})),
      'response.data',
    );
    return asArray(data.region_list, 'data.region_list').map((entry, index) => {
      const pair = asArray(entry, `data.region_list[${index}]`);
      return [
        asNumber(pair[0], `data.region_list[${index}][0]`),
        asNumber(pair[1], `data.region_list[${index}][1]`),
      ];
    });
  } catch (error) {
    if (error instanceof ApiError && error.kind === 'http' && error.status !== undefined) {
      if (error.status === 404 || error.status === 503) return [];
    }
    throw error;
  }
}

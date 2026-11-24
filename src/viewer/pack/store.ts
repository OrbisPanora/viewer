/**
 * Keeps the built atlas in the browser, so the download and the drawing happen once.
 *
 * The Cache API holds two entries per atlas: the PNG image and the JSON positions of the sprites. The Cache
 * API exists only on pages served over https or from localhost; elsewhere nothing is kept and the atlas is
 * built at every start. Not unit tested: it needs a browser.
 */
import type { RenderedAtlas } from './render';

const CACHE_NAME = 'orbispanora-atlas';
/** The entries of one atlas are at `<ORIGIN>/__orbispanora/atlas/<key>.png` and `.json`. */
const PREFIX = '/__orbispanora/atlas/';

/**
 * The address a cache entry is kept under.
 *
 * @param key - Name of the atlas.
 * @param extension - `png` or `json`.
 * @returns A full address; the Cache API only accepts http and https requests.
 */
function entry(key: string, extension: 'png' | 'json'): string {
  return `${location.origin}${PREFIX}${encodeURIComponent(key)}.${extension}`;
}

/**
 * Reads a stored atlas.
 *
 * @param key - Name of the atlas.
 * @returns The atlas, or `undefined` if none is stored or the browser has no Cache API.
 */
export async function loadStored(key: string): Promise<RenderedAtlas | undefined> {
  if (typeof caches === 'undefined') return undefined;
  try {
    const cache = await caches.open(CACHE_NAME);
    const [image, frames] = await Promise.all([
      cache.match(entry(key, 'png')),
      cache.match(entry(key, 'json')),
    ]);
    if (!image || !frames) return undefined;
    return { image: await image.blob(), frames: (await frames.json()) as RenderedAtlas['frames'] };
  } catch (error) {
    console.warn('The stored block atlas could not be read.', error);
    return undefined;
  }
}

/**
 * Stores an atlas and removes the other atlases.
 *
 * It also asks the browser not to delete the data when it needs disk space. A failure is logged and
 * ignored, because the atlas can always be built again.
 *
 * @param key - Name of the atlas.
 * @param atlas - The atlas.
 */
export async function save(key: string, atlas: RenderedAtlas): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(
      entry(key, 'png'),
      new Response(atlas.image, { headers: { 'content-type': 'image/png' } }),
    );
    await cache.put(entry(key, 'json'), Response.json(atlas.frames));
    const keep = new Set([entry(key, 'png'), entry(key, 'json')]);
    for (const request of await cache.keys()) {
      if (!keep.has(request.url)) await cache.delete(request);
    }
    await navigator.storage?.persist?.();
  } catch (error) {
    console.warn('The block atlas could not be stored.', error);
  }
}

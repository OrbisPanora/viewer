/**
 * Gets the block atlas: from the browser's storage if it is there, otherwise by downloading the vanilla
 * `client.jar` data, drawing the sprites and storing the result.
 *
 * The atlas is named after the Minecraft version and `ATLAS_FORMAT`, which is raised whenever the drawing
 * changes, so a new viewer does not use an atlas drawn by an old one.
 */
import { findClientJar } from './mojang';
import { readPack, readTextures, type Progress } from './pack';
import { buildBlocks } from './models';
import { renderAtlas, type RenderedAtlas } from './render';
import { loadStored, save } from './store';
import { openRemoteZip, type RangeReader } from './zip';

/** Raised whenever the drawing of the sprites changes. */
export const ATLAS_FORMAT = 1;

/**
 * Makes a function that reads byte ranges of a file on a server.
 *
 * @param url - Address of the file.
 * @returns The reader.
 * @throws {Error} From the reader, if the server does not answer a range request with 206.
 */
function rangeReader(url: string): RangeReader {
  return async (start, end) => {
    // `no-store` keeps the request out of the browser's HTTP cache. Without it, Chrome answers a second
    // range request on the same file with the whole 41 MB file (status 200).
    const response = await fetch(url, {
      headers: { Range: `bytes=${start}-${end}` },
      cache: 'no-store',
    });
    // A 200 would be the whole 41 MB file, which this reader must not download.
    if (response.status !== 206)
      throw new Error(`${url} did not answer a range request (${response.status})`);
    return new Uint8Array(await response.arrayBuffer());
  };
}

/**
 * Gets the atlas of a Minecraft version.
 *
 * @param version - Version id, for example `26.3`.
 * @param progress - Called with what is being done and how far.
 * @returns The atlas.
 * @throws {Error} If the version cannot be downloaded or drawn.
 */
export async function prepareAtlas(version: string, progress?: Progress): Promise<RenderedAtlas> {
  const key = `${version}-${ATLAS_FORMAT}`;
  const stored = await loadStored(key);
  if (stored) return stored;

  progress?.('Looking up the Minecraft client', 0, 1);
  const jar = await findClientJar(version);
  const zip = await openRemoteZip(jar.size, rangeReader(jar.url));
  const pack = await readPack(zip, progress);
  const blocks = buildBlocks(pack.blockstates, pack.models);
  const textureIds = new Set(
    [...blocks.values()].flatMap((block) => block.faces.map((face) => face.texture)),
  );
  const files = await readTextures(zip, textureIds, progress);
  const atlas = await renderAtlas(blocks, files, progress);
  await save(key, atlas);
  return atlas;
}

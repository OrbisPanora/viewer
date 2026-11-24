/**
 * Reads the parts of a resource pack that the sprites are drawn from.
 *
 * The pack is a zip with `assets/<namespace>/blockstates`, `models/block` and `textures/block`. Only the
 * `minecraft` namespace is read for now. The JSON files are read first. The textures are read after the
 * faces are known, so only the textures a block uses are unpacked.
 */
import type { ModelSource } from './models';
import type { ZipArchive } from './zip';

/** Reports progress: what is being done, and how far. */
export type Progress = (label: string, done: number, total: number) => void;

/** The JSON files of a pack. */
export interface PackData {
  /** Parsed blockstate files, by block name with namespace. */
  readonly blockstates: Map<string, unknown>;
  /** Reads a parsed model by id such as `minecraft:block/cube_all`. */
  readonly models: ModelSource;
}

const BLOCKSTATES = 'assets/minecraft/blockstates/';
const MODELS = 'assets/minecraft/models/block/';
const TEXTURES = 'assets/minecraft/textures/';

/**
 * Reads and parses the blockstate and block model files.
 *
 * @param zip - The opened pack.
 * @param progress - Called as files are read.
 * @returns The blockstates and a model reader.
 * @throws {Error} If a file cannot be read or is not JSON.
 */
export async function readPack(zip: ZipArchive, progress?: Progress): Promise<PackData> {
  const names = [...zip.list(BLOCKSTATES), ...zip.list(MODELS)].filter((name) =>
    name.endsWith('.json'),
  );
  const files = await zip.read(names, (done, total) =>
    progress?.('Downloading block models', done, total),
  );

  const decoder = new TextDecoder();
  const blockstates = new Map<string, unknown>();
  const models = new Map<string, unknown>();
  for (const [name, bytes] of files) {
    const value = JSON.parse(decoder.decode(bytes)) as unknown;
    if (name.startsWith(BLOCKSTATES)) {
      blockstates.set(`minecraft:${name.slice(BLOCKSTATES.length, -'.json'.length)}`, value);
    } else {
      models.set(`minecraft:block/${name.slice(MODELS.length, -'.json'.length)}`, value);
    }
  }
  return { blockstates, models: (id) => models.get(id) };
}

/**
 * Reads the textures named by the faces.
 *
 * @param zip - The opened pack.
 * @param ids - Texture ids such as `minecraft:block/stone`. Ids that are not in the `minecraft` namespace
 *   or not in the pack are left out of the result.
 * @param progress - Called as files are read.
 * @returns The PNG bytes of each texture, by id.
 */
export async function readTextures(
  zip: ZipArchive,
  ids: Iterable<string>,
  progress?: Progress,
): Promise<Map<string, Uint8Array>> {
  const available = new Set(zip.list(TEXTURES));
  const wanted = new Map<string, string>();
  for (const id of ids) {
    if (!id.startsWith('minecraft:')) continue;
    const path = `${TEXTURES}${id.slice('minecraft:'.length)}.png`;
    if (available.has(path)) wanted.set(path, id);
  }
  const files = await zip.read([...wanted.keys()], (done, total) =>
    progress?.('Downloading block textures', done, total),
  );
  const result = new Map<string, Uint8Array>();
  for (const [path, bytes] of files) result.set(wanted.get(path) as string, bytes);
  return result;
}

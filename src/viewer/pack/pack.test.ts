import { describe, expect, it, vi } from 'vitest';
import { readPack, readTextures } from './pack';
import type { ZipArchive } from './zip';

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

/** An archive over a table of name → bytes. */
function archive(files: Record<string, Uint8Array>): ZipArchive {
  return {
    list: (prefix) => Object.keys(files).filter((name) => name.startsWith(prefix)),
    read: async (names, onProgress) => {
      const result = new Map<string, Uint8Array>();
      names.forEach((name, i) => {
        result.set(name, files[name] as Uint8Array);
        onProgress?.(i + 1, names.length);
      });
      return result;
    },
  };
}

describe('readPack', () => {
  const zip = archive({
    'assets/minecraft/blockstates/stone.json': encode({
      variants: { '': { model: 'minecraft:block/stone' } },
    }),
    'assets/minecraft/models/block/stone.json': encode({ parent: 'minecraft:block/cube_all' }),
    'assets/minecraft/models/item/stone.json': encode({ parent: 'x' }),
    'assets/minecraft/textures/block/stone.png': new Uint8Array([1]),
    'assets/other/blockstates/shaft.json': encode({}),
  });

  it('reads blockstates and block models of the minecraft namespace by id', async () => {
    const progress = vi.fn();
    const pack = await readPack(zip, progress);
    expect([...pack.blockstates.keys()]).toEqual(['minecraft:stone']);
    expect(pack.models('minecraft:block/stone')).toEqual({ parent: 'minecraft:block/cube_all' });
    expect(pack.models('minecraft:item/stone')).toBeUndefined();
    expect(progress).toHaveBeenLastCalledWith('Downloading block models', 2, 2);
  });

  it('throws when a file is not JSON', async () => {
    const bad = archive({ 'assets/minecraft/blockstates/x.json': new TextEncoder().encode('{') });
    await expect(readPack(bad)).rejects.toThrow();
  });
});

describe('readTextures', () => {
  const zip = archive({
    'assets/minecraft/textures/block/stone.png': new Uint8Array([1]),
    'assets/minecraft/textures/block/dirt.png': new Uint8Array([2]),
  });

  it('reads the named textures by id and leaves out unknown ones', async () => {
    const progress = vi.fn();
    const result = await readTextures(
      zip,
      ['minecraft:block/stone', 'minecraft:block/missing', 'create:block/shaft'],
      progress,
    );
    expect([...result.keys()]).toEqual(['minecraft:block/stone']);
    expect(result.get('minecraft:block/stone')).toEqual(new Uint8Array([1]));
    expect(progress).toHaveBeenCalledWith('Downloading block textures', 1, 1);
  });
});

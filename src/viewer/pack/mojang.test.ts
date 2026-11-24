import { describe, expect, it } from 'vitest';
import { findClientJar, VERSION_MANIFEST_URL } from './mojang';

const SHA1 = 'e877b6a07acd633fb3bb475002175cec036e7b87';
const VERSION_URL = 'https://piston-meta.mojang.com/v1/packages/abc/1.2.json';
const JAR_URL = `https://piston-data.mojang.com/v1/objects/${SHA1}/client.jar`;

/** A fetch that answers from a table of address → JSON. */
function fakeFetch(table: Record<string, unknown>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (!(url in table)) return new Response('', { status: 404 });
    return new Response(JSON.stringify(table[url]), { status: 200 });
  }) as typeof fetch;
}

const manifest = {
  versions: [
    { id: '0.9', url: 'x' },
    { id: '1.2', url: VERSION_URL },
  ],
};
const description = { downloads: { client: { sha1: SHA1, size: 41_483_720, url: JAR_URL } } };

describe('findClientJar', () => {
  it('returns the address, size and SHA-1 of the client', async () => {
    const fetchFn = fakeFetch({ [VERSION_MANIFEST_URL]: manifest, [VERSION_URL]: description });
    await expect(findClientJar('1.2', fetchFn)).resolves.toEqual({
      url: JAR_URL,
      size: 41_483_720,
      sha1: SHA1,
    });
  });

  it('throws when the version is not listed', async () => {
    const fetchFn = fakeFetch({ [VERSION_MANIFEST_URL]: manifest });
    await expect(findClientJar('9.9', fetchFn)).rejects.toThrow('does not list the version 9.9');
  });

  it('throws when the manifest cannot be read', async () => {
    await expect(findClientJar('1.2', fakeFetch({}))).rejects.toThrow('404');
  });

  it('refuses an address on another host', async () => {
    const other = {
      downloads: { client: { sha1: SHA1, size: 1, url: 'https://example.test/client.jar' } },
    };
    const fetchFn = fakeFetch({ [VERSION_MANIFEST_URL]: manifest, [VERSION_URL]: other });
    await expect(findClientJar('1.2', fetchFn)).rejects.toThrow('not a Mojang download host');
  });

  it('refuses a version file on another host', async () => {
    const moved = {
      versions: [{ id: '1.2', url: 'http://piston-meta.mojang.com/v1/packages/abc/1.2.json' }],
    };
    const fetchFn = fakeFetch({ [VERSION_MANIFEST_URL]: moved });
    await expect(findClientJar('1.2', fetchFn)).rejects.toThrow('not a Mojang download host');
  });

  it.each([
    ['a missing size', { downloads: { client: { sha1: SHA1, url: JAR_URL } } }],
    ['a bad SHA-1', { downloads: { client: { sha1: 'zz', size: 5, url: JAR_URL } } }],
    ['no client', { downloads: {} }],
  ])('throws on %s', async (_label, bad) => {
    const fetchFn = fakeFetch({ [VERSION_MANIFEST_URL]: manifest, [VERSION_URL]: bad });
    await expect(findClientJar('1.2', fetchFn)).rejects.toThrow('missing from Mojang');
  });
});

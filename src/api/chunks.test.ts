import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHUNK_BASE_HEIGHT, fetchChunk } from './chunks';
import { envelope, jsonResponse, stubFetch } from '@/test-utils';

afterEach(() => vi.unstubAllGlobals());

/** A response body with the given blocks. */
function chunk(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    chunk_x: 0,
    chunk_z: 0,
    surface_y: 62,
    palette: ['minecraft:stone', 'minecraft:grass_block'],
    x: [0, 0, 5],
    y: [62, 63, 63],
    z: [0, 0, 9],
    block: [0, 1, 1],
    ...overrides,
  };
}

describe('fetchChunk', () => {
  it('asks for the isometric mode with the base height', async () => {
    const requests = stubFetch(() => jsonResponse(envelope(chunk())));
    await fetchChunk(-2, 5);
    expect(requests[0]?.url).toBe(`/api/chunks/-2/5/${CHUNK_BASE_HEIGHT}?mode=isometric`);
  });

  it('returns the blocks as typed arrays with the palette and the surface height', async () => {
    stubFetch(() => jsonResponse(envelope(chunk())));
    const payload = await fetchChunk(0, 0);
    expect(payload?.surfaceY).toBe(62);
    expect(payload?.blocks.palette).toEqual(['minecraft:stone', 'minecraft:grass_block']);
    expect(payload?.blocks.x).toEqual(Uint8Array.of(0, 0, 5));
    expect(payload?.blocks.y).toEqual(Int16Array.of(62, 63, 63));
    expect(payload?.blocks.z).toEqual(Uint8Array.of(0, 0, 9));
    expect(payload?.blocks.block).toEqual(Uint16Array.of(0, 1, 1));
  });

  it('keeps negative heights', async () => {
    stubFetch(() => jsonResponse(envelope(chunk({ y: [-64, -30, 319], surface_y: -64 }))));
    expect((await fetchChunk(0, 0))?.blocks.y).toEqual(Int16Array.of(-64, -30, 319));
  });

  it('treats 404 as a missing chunk', async () => {
    stubFetch(() => jsonResponse({ detail: 'Chunk (1, 1) not found' }, 404));
    expect(await fetchChunk(1, 1)).toBeNull();
  });

  it('treats a chunk without blocks as a missing chunk', async () => {
    stubFetch(() =>
      jsonResponse(
        envelope(chunk({ palette: [], x: [], y: [], z: [], block: [], surface_y: 320 })),
      ),
    );
    expect(await fetchChunk(0, 0)).toBeNull();
  });

  it('treats a null body as a missing chunk', async () => {
    stubFetch(() => jsonResponse(envelope(null)));
    expect(await fetchChunk(0, 0)).toBeNull();
  });

  it.each([
    ['a palette that is not a list', { palette: 'x' }],
    ['a palette name that is not a string', { palette: [5, 6] }],
    ['a position that is not a number', { x: ['0', 0, 5] }],
    ['an x position outside the chunk', { x: [0, 16, 5] }],
    ['a z position outside the chunk', { z: [0, 0, -1] }],
    ['a height that is not a whole number', { y: [62, 63.5, 63] }],
    ['a block index outside the palette', { block: [0, 1, 2] }],
    ['a surface height that is not a number', { surface_y: 'low' }],
    ['lists of different lengths', { y: [62, 63] }],
    ['blocks but an empty palette', { palette: [], block: [0, 0, 0] }],
  ])('rejects %s', async (_name, change) => {
    stubFetch(() => jsonResponse(envelope(chunk(change))));
    await expect(fetchChunk(0, 0)).rejects.toMatchObject({ kind: 'parse' });
  });

  it('rejects the former response with screen positions', async () => {
    stubFetch(() =>
      jsonResponse(envelope({ surface_blocks: [['a.webp', 1, 2]], palette: 3, heightmap: 1 })),
    );
    await expect(fetchChunk(0, 0)).rejects.toMatchObject({ kind: 'parse' });
  });

  it('propagates a server error', async () => {
    stubFetch(() => jsonResponse({ detail: 'boom' }, 500));
    await expect(fetchChunk(0, 0)).rejects.toMatchObject({ kind: 'http', status: 500 });
  });

  it('rejects an error envelope', async () => {
    stubFetch(() => jsonResponse({ status: 'error', error: 'bad', data: null }));
    await expect(fetchChunk(0, 0)).rejects.toThrow('bad');
  });
});

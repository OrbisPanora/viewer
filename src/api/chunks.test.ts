import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHUNK_BASE_HEIGHT, fetchChunk } from './chunks';
import { envelope, jsonResponse, stubFetch } from '@/test-utils';

afterEach(() => vi.unstubAllGlobals());

describe('fetchChunk', () => {
  it('asks for the isometric mode with the base height', async () => {
    const requests = stubFetch(() =>
      jsonResponse(envelope({ surface_blocks: [['a.webp', 1, 2]], palette: 3 })),
    );
    await fetchChunk(-2, 5);
    expect(requests[0]?.url).toBe(`/api/chunks/-2/5/${CHUNK_BASE_HEIGHT}?mode=isometric`);
  });

  it('returns tiles and surface height', async () => {
    stubFetch(() =>
      jsonResponse(
        envelope({
          surface_blocks: [
            ['grass_block.webp', 0, 16],
            ['stone.webp', 16, 8],
          ],
          palette: 4,
        }),
      ),
    );
    expect(await fetchChunk(0, 0)).toEqual({
      tiles: [
        ['grass_block.webp', 0, 16],
        ['stone.webp', 16, 8],
      ],
      surfaceY: 4,
    });
  });

  it('treats 404 as a missing chunk', async () => {
    stubFetch(() => jsonResponse({ detail: 'Chunk (1, 1) not found' }, 404));
    expect(await fetchChunk(1, 1)).toBeNull();
  });

  it.each([[null], [[]]])('treats surface_blocks %j as a missing chunk', async (blocks) => {
    stubFetch(() => jsonResponse(envelope({ surface_blocks: blocks })));
    expect(await fetchChunk(0, 0)).toBeNull();
  });

  it('defaults the surface height to 0 when the API sends no number', async () => {
    stubFetch(() => jsonResponse(envelope({ surface_blocks: [['a.webp', 0, 0]], palette: ['x'] })));
    expect((await fetchChunk(0, 0))?.surfaceY).toBe(0);
  });

  it.each([
    ['a row that is not a list', [{ x: 1 }]],
    ['a texture that is not a string', [[5, 0, 0]]],
    ['a position that is not a number', [['a.webp', '0', 0]]],
  ])('rejects %s', async (_name, blocks) => {
    stubFetch(() => jsonResponse(envelope({ surface_blocks: blocks })));
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

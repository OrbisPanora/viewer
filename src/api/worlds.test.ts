import { afterEach, describe, expect, it, vi } from 'vitest';
import { envelope, jsonResponse, stubFetch } from '@/test-utils';
import { ApiError } from './errors';
import { fetchWorldLoaded, fetchWorldRegions } from './worlds';

afterEach(() => vi.unstubAllGlobals());

describe('fetchWorldLoaded', () => {
  it('reads world_loaded from the health answer', async () => {
    const requests = stubFetch(() => jsonResponse({ status: 'healthy', world_loaded: true }));
    expect(await fetchWorldLoaded()).toBe(true);
    expect(requests[0]?.url).toBe('/api/worlds/health');
  });

  it('is false when no world is loaded', async () => {
    stubFetch(() => jsonResponse({ status: 'unhealthy', world_loaded: false }));
    expect(await fetchWorldLoaded()).toBe(false);
  });

  it('rejects an answer without the field', async () => {
    stubFetch(() => jsonResponse({ status: 'healthy' }));
    await expect(fetchWorldLoaded()).rejects.toBeInstanceOf(ApiError);
  });

  it('passes the abort signal on', async () => {
    stubFetch(() => jsonResponse({ world_loaded: true }));
    const controller = new AbortController();
    await fetchWorldLoaded(controller.signal);
    const sent = vi.mocked(fetch).mock.calls[0]?.[1]?.signal;
    expect(sent?.aborted).toBe(false);
    controller.abort();
    expect(sent?.aborted).toBe(true);
  });
});

describe('fetchWorldRegions', () => {
  it('returns the region coordinates', async () => {
    stubFetch(() =>
      jsonResponse(
        envelope({
          region_list: [
            [0, 0],
            [-1, 2],
          ],
        }),
      ),
    );
    expect(await fetchWorldRegions()).toEqual([
      [0, 0],
      [-1, 2],
    ]);
  });

  it.each([404, 503])('gives an empty list for status %i', async (status) => {
    stubFetch(() => jsonResponse({ detail: 'no' }, status));
    expect(await fetchWorldRegions()).toEqual([]);
  });

  it('throws for other server errors', async () => {
    stubFetch(() => jsonResponse({ detail: 'broken' }, 500));
    await expect(fetchWorldRegions()).rejects.toBeInstanceOf(ApiError);
  });

  it('throws for a malformed region list', async () => {
    stubFetch(() => jsonResponse(envelope({ region_list: [['a', 0]] })));
    await expect(fetchWorldRegions()).rejects.toBeInstanceOf(ApiError);
  });

  it('passes the abort signal on', async () => {
    stubFetch(() => jsonResponse(envelope({ region_list: [] })));
    const controller = new AbortController();
    await fetchWorldRegions(controller.signal);
    const sent = vi.mocked(fetch).mock.calls[0]?.[1]?.signal;
    expect(sent?.aborted).toBe(false);
    controller.abort();
    expect(sent?.aborted).toBe(true);
  });
});

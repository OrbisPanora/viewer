import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, stubFetch } from '@/test-utils';
import { useWorldStore } from './world';

beforeEach(() => setActivePinia(createPinia()));
afterEach(() => vi.unstubAllGlobals());

describe('world store', () => {
  it('is ready when the API has a world', async () => {
    stubFetch(() => jsonResponse({ status: 'healthy', world_loaded: true }));
    expect(await useWorldStore().check(0)).toBe('ready');
  });

  it('is empty, without retrying, when the API has no world', async () => {
    const requests = stubFetch(() => jsonResponse({ status: 'unhealthy', world_loaded: false }));
    expect(await useWorldStore().check(0)).toBe('empty');
    expect(requests).toHaveLength(1);
  });

  it('retries an unreachable API, then reports it unreachable', async () => {
    const requests = stubFetch(() => {
      throw new TypeError('fetch failed');
    });
    const store = useWorldStore();
    expect(await store.check(0)).toBe('unreachable');
    expect(requests).toHaveLength(3);
    expect(store.message).toMatch(/Cannot reach the API/);
  });

  it('recovers when the API comes up during the retries', async () => {
    let calls = 0;
    stubFetch(() => {
      if (++calls < 2) throw new TypeError('fetch failed');
      return jsonResponse({ world_loaded: true });
    });
    expect(await useWorldStore().check(0)).toBe('ready');
  });

  it('rejects a health answer without the expected field', async () => {
    stubFetch(() => jsonResponse({ ok: true }));
    expect(await useWorldStore().check(0)).toBe('unreachable');
  });
});

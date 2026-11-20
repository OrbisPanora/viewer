import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { envelope, jsonResponse, stubFetch } from '@/test-utils';
import { useUploadStore } from './upload';
import { useWorldStore } from './world';

beforeEach(() => setActivePinia(createPinia()));
afterEach(() => vi.unstubAllGlobals());

function zipFile(name = 'world.zip'): File {
  return new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])], name);
}

describe('upload store', () => {
  it('goes idle, validating, sending, done and marks the world ready', async () => {
    const requests = stubFetch(() => jsonResponse(envelope({})));
    const store = useUploadStore();
    expect(store.state).toBe('idle');
    const result = store.start(zipFile());
    expect(store.state).toBe('validating');
    expect(await result).toBe(true);
    expect(store.state).toBe('done');
    expect(useWorldStore().status).toBe('ready');
    expect(requests).toHaveLength(1);
  });

  it('fails on an invalid file without contacting the API', async () => {
    const requests = stubFetch(() => jsonResponse(envelope({})));
    const store = useUploadStore();
    expect(await store.start(zipFile('world.txt'))).toBe(false);
    expect(store.state).toBe('failed');
    expect(store.errorMessage).toMatch(/\.zip/);
    expect(requests).toHaveLength(0);
  });

  it('shows the API error message when the server refuses the archive', async () => {
    stubFetch(() => jsonResponse({ detail: 'Invalid world: level.dat missing' }, 400));
    const store = useUploadStore();
    expect(await store.start(zipFile())).toBe(false);
    expect(store.state).toBe('failed');
    expect(store.errorMessage).toBe('Invalid world: level.dat missing');
    expect(useWorldStore().status).not.toBe('ready');
  });

  it('returns to idle, with no error, when cancelled', async () => {
    const store = useUploadStore();
    stubFetch((request) => {
      void request;
      store.cancel();
      throw new DOMException('aborted', 'AbortError');
    });
    expect(await store.start(zipFile())).toBe(false);
    expect(store.state).toBe('idle');
    expect(store.errorMessage).toBe('');
  });

  it('ignores a second start while busy', async () => {
    const requests = stubFetch(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return jsonResponse(envelope({}));
    });
    const store = useUploadStore();
    const first = store.start(zipFile());
    expect(await store.start(zipFile())).toBe(false);
    expect(await first).toBe(true);
    expect(requests).toHaveLength(1);
  });

  it('reset clears a failure', async () => {
    const store = useUploadStore();
    await store.start(zipFile('x.txt'));
    store.reset();
    expect(store.state).toBe('idle');
    expect(store.errorMessage).toBe('');
  });
});

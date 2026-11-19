import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiJson, apiRequest } from './client';
import { ApiError } from './errors';
import { jsonResponse, stubFetch } from '@/test-utils';

afterEach(() => vi.unstubAllGlobals());

describe('apiRequest', () => {
  it('returns the response for a 2xx status', async () => {
    stubFetch(() => jsonResponse({ ok: true }));
    const response = await apiRequest('/api/x');
    expect(response.status).toBe(200);
  });

  it('turns a FastAPI string detail into the error message', async () => {
    stubFetch(() => jsonResponse({ detail: 'Only .zip files are allowed' }, 400));
    await expect(apiRequest('/api/x')).rejects.toMatchObject({
      kind: 'http',
      status: 400,
      message: 'Only .zip files are allowed',
    });
  });

  it('joins FastAPI validation messages', async () => {
    stubFetch(() =>
      jsonResponse({ detail: [{ msg: 'field required' }, { msg: 'bad value' }] }, 422),
    );
    await expect(apiRequest('/api/x')).rejects.toThrow('field required; bad value');
  });

  it('does not show an HTML error page to the user', async () => {
    stubFetch(
      () => new Response('<html>Bad gateway</html>', { status: 502, statusText: 'Bad Gateway' }),
    );
    const error = await apiRequest('/api/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe('The API answered 502 Bad Gateway');
    expect((error as ApiError).isTransient).toBe(true);
  });

  it('truncates a very long detail', async () => {
    stubFetch(() => jsonResponse({ detail: 'x'.repeat(5000) }, 400));
    const error = (await apiRequest('/api/x').catch((e: unknown) => e)) as ApiError;
    expect(error.message.length).toBe(300);
  });

  it('reports an unreachable API as a network error', async () => {
    stubFetch(() => {
      throw new TypeError('fetch failed');
    });
    await expect(apiRequest('/api/x')).rejects.toMatchObject({ kind: 'network' });
  });

  it('reports a cancelled request as aborted', async () => {
    const controller = new AbortController();
    stubFetch(() => {
      controller.abort();
      throw new DOMException('aborted', 'AbortError');
    });
    await expect(apiRequest('/api/x', { signal: controller.signal })).rejects.toMatchObject({
      kind: 'aborted',
    });
  });

  it('does not treat a 4xx as transient', async () => {
    stubFetch(() => jsonResponse({ detail: 'nope' }, 404));
    const error = (await apiRequest('/api/x').catch((e: unknown) => e)) as ApiError;
    expect(error.isTransient).toBe(false);
  });
});

describe('apiJson', () => {
  it('parses the body', async () => {
    stubFetch(() => jsonResponse({ a: 1 }));
    expect(await apiJson('/api/x')).toEqual({ a: 1 });
  });

  it('reports a body that is not JSON as a parse error', async () => {
    stubFetch(() => new Response('plain text', { status: 200 }));
    await expect(apiJson('/api/x')).rejects.toMatchObject({ kind: 'parse' });
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SINGLE_REQUEST_LIMIT_BYTES,
  UPLOAD_PIECE_BYTES,
  UploadValidationError,
  formatBytes,
  uploadWorld,
  validateWorldFile,
  type UploadProgress,
} from './upload';
import { ApiError } from './errors';
import { envelope, jsonResponse, stubFetch } from '@/test-utils';

afterEach(() => vi.unstubAllGlobals());

/** A file that starts like a zip archive. */
function zipFile(size: number, name = 'world.zip'): File {
  const bytes = new Uint8Array(size);
  bytes.set([0x50, 0x4b, 0x03, 0x04]);
  return new File([bytes], name);
}

describe('validateWorldFile', () => {
  it('accepts a zip within the limit', async () => {
    await expect(validateWorldFile(zipFile(100), 1000)).resolves.toBeUndefined();
  });

  it('accepts an upper-case extension', async () => {
    await expect(validateWorldFile(zipFile(100, 'WORLD.ZIP'), 1000)).resolves.toBeUndefined();
  });

  it.each([
    [
      'a wrong extension',
      new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], 'world.tar'),
      /\.zip/,
    ],
    ['an empty file', new File([], 'world.zip'), /empty/],
    [
      'a file that is not a zip',
      new File([new Uint8Array([1, 2, 3, 4, 5])], 'world.zip'),
      /not a zip/,
    ],
  ])('rejects %s', async (_name, file, message) => {
    await expect(validateWorldFile(file, 1000)).rejects.toThrow(message);
    await expect(validateWorldFile(file, 1000)).rejects.toBeInstanceOf(UploadValidationError);
  });

  it('rejects a file over the limit and says the limit', async () => {
    await expect(validateWorldFile(zipFile(2048), 1024)).rejects.toThrow(/1\.0 KB limit/);
  });
});

describe('formatBytes', () => {
  it.each([
    [512, '512 B'],
    [1536, '1.5 KB'],
    [5 * 1024 * 1024, '5.0 MB'],
    [3 * 1024 ** 3, '3.0 GB'],
  ])('formats %d', (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text);
  });
});

describe('uploadWorld', () => {
  it('sends a small archive in one request with the dimension in the query', async () => {
    const requests = stubFetch(() => jsonResponse(envelope({})));
    await uploadWorld(zipFile(SINGLE_REQUEST_LIMIT_BYTES));
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe('/api/upload/world?dimension=overworld');
    expect(requests[0]?.method).toBe('POST');
  });

  it('cuts a large archive into pieces, in order, then finalises', async () => {
    const requests = stubFetch((request) =>
      request.url.endsWith('/init')
        ? jsonResponse(envelope({ upload_id: 'abc', chunk_size: UPLOAD_PIECE_BYTES }))
        : jsonResponse(envelope({})),
    );
    const progress: UploadProgress[] = [];
    const size = UPLOAD_PIECE_BYTES * 2 + 10;
    await uploadWorld(zipFile(size), { onProgress: (p) => progress.push(p) });

    expect(requests.map((r) => r.url)).toEqual([
      '/api/upload/init',
      '/api/upload/chunk',
      '/api/upload/chunk',
      '/api/upload/chunk',
      '/api/upload/finalize',
    ]);
    const init = requests[0]?.body as FormData;
    expect(init.get('total_chunks')).toBe('3');
    expect(init.get('total_size')).toBe(String(size));
    const indexes = requests.slice(1, 4).map((r) => (r.body as FormData).get('chunk_index'));
    expect(indexes).toEqual(['0', '1', '2']);
    expect(progress.at(-1)).toMatchObject({
      phase: 'finalizing',
      sentBytes: size,
      totalBytes: size,
    });
  });

  it('retries a piece that fails with a server error', async () => {
    let failures = 1;
    const requests = stubFetch((request) => {
      if (request.url.endsWith('/init')) return jsonResponse(envelope({ upload_id: 'abc' }));
      if (request.url.endsWith('/chunk') && failures-- > 0)
        return jsonResponse({ detail: 'busy' }, 503);
      return jsonResponse(envelope({}));
    });
    vi.useFakeTimers();
    const done = uploadWorld(zipFile(SINGLE_REQUEST_LIMIT_BYTES + 1));
    await vi.runAllTimersAsync();
    await done;
    vi.useRealTimers();
    expect(requests.filter((r) => r.url.endsWith('/chunk'))).toHaveLength(2);
  });

  it('does not retry a rejected piece and asks the API to discard the upload', async () => {
    const requests = stubFetch((request) => {
      if (request.url.endsWith('/init')) return jsonResponse(envelope({ upload_id: 'abc' }));
      if (request.url.endsWith('/chunk')) return jsonResponse({ detail: 'Invalid chunk' }, 400);
      return jsonResponse(envelope({}));
    });
    await expect(uploadWorld(zipFile(SINGLE_REQUEST_LIMIT_BYTES + 1))).rejects.toThrow(
      'Invalid chunk',
    );
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      'POST /api/upload/init',
      'POST /api/upload/chunk',
      'DELETE /api/upload/cancel/abc',
    ]);
  });

  it('rejects an init answer without an upload id', async () => {
    stubFetch(() => jsonResponse(envelope({ chunk_size: 5 })));
    await expect(uploadWorld(zipFile(SINGLE_REQUEST_LIMIT_BYTES + 1))).rejects.toMatchObject({
      kind: 'parse',
    });
  });

  it('stops when cancelled', async () => {
    const controller = new AbortController();
    stubFetch((request) => {
      if (request.url.endsWith('/init')) return jsonResponse(envelope({ upload_id: 'abc' }));
      if (request.url.endsWith('/chunk')) {
        controller.abort();
        throw new DOMException('aborted', 'AbortError');
      }
      return jsonResponse(envelope({}));
    });
    const error = await uploadWorld(zipFile(SINGLE_REQUEST_LIMIT_BYTES + 1), {
      signal: controller.signal,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('aborted');
  });
});

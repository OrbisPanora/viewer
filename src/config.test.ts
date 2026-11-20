import { describe, expect, it } from 'vitest';
import { ConfigError, parseConfig } from './config';

describe('parseConfig', () => {
  it('uses the same origin and a 500 MiB limit by default', () => {
    expect(parseConfig({})).toEqual({ apiBaseUrl: '', maxUploadBytes: 500 * 1024 * 1024 });
  });

  it('normalises an origin and drops the trailing slash', () => {
    expect(parseConfig({ VITE_API_BASE_URL: 'http://localhost:8020/' }).apiBaseUrl).toBe(
      'http://localhost:8020',
    );
  });

  it.each(['not a url', 'ftp://example.test', 'http://example.test/api', 'javascript:alert(1)'])(
    'rejects the API URL %s',
    (value) => {
      expect(() => parseConfig({ VITE_API_BASE_URL: value })).toThrow(ConfigError);
    },
  );

  it('reads the upload limit in MiB', () => {
    expect(parseConfig({ VITE_MAX_UPLOAD_MB: '10' }).maxUploadBytes).toBe(10 * 1024 * 1024);
  });

  it.each(['0', '-1', '1.5', 'abc', '99999'])('rejects the upload limit %s', (value) => {
    expect(() => parseConfig({ VITE_MAX_UPLOAD_MB: value })).toThrow(/VITE_MAX_UPLOAD_MB/);
  });
});

/**
 * Thin wrapper around `fetch` used by every API call.
 *
 * It adds what each caller would otherwise repeat: the configured base URL, a time limit,
 * cancellation, and the translation of every failure into an {@link ApiError} whose message
 * is safe to show to the user.
 */
import { config } from '@/config';
import { ApiError } from './errors';

/** Default time limit for a request, in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 15_000;

/** Longest server-provided message shown to the user, so a stray HTML page cannot flood the UI. */
const MAX_MESSAGE_LENGTH = 300;

/** Options accepted by {@link apiRequest}. */
export interface RequestOptions {
  /** HTTP method. Defaults to `GET`. */
  method?: 'GET' | 'POST' | 'DELETE';
  /** Request body. A `FormData` sets its own content type. */
  body?: FormData;
  /** Cancels the request when aborted. */
  signal?: AbortSignal;
  /** Overrides {@link DEFAULT_TIMEOUT_MS}. */
  timeoutMs?: number;
}

/**
 * Extracts a readable message from an error response.
 *
 * FastAPI answers `{"detail": "text"}` or, for validation errors, `{"detail": [{"msg": ...}]}`.
 * Anything else (a proxy's HTML page, for instance) gets a generic message with the status.
 *
 * @param response - The failed response.
 * @returns A short message without markup.
 */
async function describeFailure(response: Response): Promise<string> {
  const fallback = `The API answered ${response.status} ${response.statusText}`.trim();
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'detail' in body) {
      const detail = (body as { detail: unknown }).detail;
      if (typeof detail === 'string') return detail.slice(0, MAX_MESSAGE_LENGTH);
      if (Array.isArray(detail)) {
        const messages = detail
          .map((item: unknown) =>
            typeof item === 'object' && item !== null && 'msg' in item
              ? String((item as { msg: unknown }).msg)
              : '',
          )
          .filter(Boolean);
        if (messages.length > 0) return messages.join('; ').slice(0, MAX_MESSAGE_LENGTH);
      }
    }
  } catch {
    // Not JSON: use the fallback.
  }
  return fallback;
}

/**
 * Sends a request to the API and returns the successful response.
 *
 * @param path - Path starting with `/`, for example `/api/worlds/health`.
 * @param options - Method, body, cancellation and time limit.
 * @returns The response, whose status is 2xx.
 * @throws {ApiError} On timeout, cancellation, network failure or a non-2xx status.
 */
export async function apiRequest(path: string, options: RequestOptions = {}): Promise<Response> {
  const { method = 'GET', body, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let response: Response;
  try {
    const init: RequestInit = { method, signal: combined, credentials: 'same-origin' };
    if (body !== undefined) init.body = body;
    response = await fetch(`${config.apiBaseUrl}${path}`, init);
  } catch {
    if (signal?.aborted) throw new ApiError('aborted', 'The request was cancelled.');
    if (timeout.aborted) {
      throw new ApiError('timeout', 'The API did not answer in time.');
    }
    throw new ApiError('network', 'Cannot reach the API. Is it running?');
  }

  if (!response.ok) {
    throw new ApiError('http', await describeFailure(response), response.status);
  }
  return response;
}

/**
 * Sends a request and parses the JSON body.
 *
 * @param path - Path starting with `/`.
 * @param options - Method, body, cancellation and time limit.
 * @returns The parsed body, with unknown shape.
 * @throws {ApiError} On any failure, including a body that is not JSON.
 */
export async function apiJson(path: string, options: RequestOptions = {}): Promise<unknown> {
  const response = await apiRequest(path, options);
  try {
    return await response.json();
  } catch {
    throw new ApiError('parse', 'The API answered with something that is not JSON.');
  }
}

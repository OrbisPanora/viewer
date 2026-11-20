/**
 * Helpers shared by the tests. Not part of the app bundle.
 */
import { vi } from 'vitest';

/**
 * Builds a JSON response like the API's.
 *
 * @param body - Value to serialise.
 * @param status - HTTP status.
 * @returns A `Response`.
 */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Wraps data in the API's success envelope.
 *
 * @param data - The `data` member.
 * @returns The envelope object.
 */
export function envelope(data: unknown): { status: string; data: unknown; timestamp: string } {
  return { status: 'success', data, timestamp: '2026-01-01T00:00:00Z' };
}

/** A request seen by the fake `fetch`. */
export interface RecordedRequest {
  url: string;
  method: string;
  body: BodyInit | null | undefined;
}

/**
 * Replaces `fetch` with a function that answers from a handler and records every call.
 *
 * @param handler - Receives the request and returns the response (or throws).
 * @returns The list that fills with the requests made.
 */
export function stubFetch(
  handler: (request: RecordedRequest) => Response | Promise<Response>,
): RecordedRequest[] {
  const requests: RecordedRequest[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const request = { url, method: init?.method ?? 'GET', body: init?.body };
      requests.push(request);
      return handler(request);
    }),
  );
  return requests;
}

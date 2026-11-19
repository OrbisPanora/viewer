/**
 * Errors raised by the API layer.
 *
 * Every failure of a request becomes an {@link ApiError}, so callers handle one type and
 * switch on `kind` instead of inspecting `fetch` internals.
 */

/** What went wrong with a request. */
export type ApiErrorKind =
  /** The server answered with a non-2xx status. */
  | 'http'
  /** The request never got an answer (server down, offline, DNS). */
  | 'network'
  /** No answer arrived within the time limit. */
  | 'timeout'
  /** The caller cancelled the request. */
  | 'aborted'
  /** The answer was not the JSON shape the app expects. */
  | 'parse';

/** A failed API request. */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  /** HTTP status for `kind === 'http'`, otherwise `undefined`. */
  readonly status: number | undefined;

  /**
   * Creates the error.
   *
   * @param kind - Category of the failure.
   * @param message - A message that is safe to show to the user.
   * @param status - HTTP status, when there was an answer.
   */
  constructor(kind: ApiErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }

  /**
   * Tells whether retrying the same request could succeed.
   *
   * @returns `true` for network failures, timeouts and 5xx answers.
   */
  get isTransient(): boolean {
    return (
      this.kind === 'network' ||
      this.kind === 'timeout' ||
      (this.kind === 'http' && this.status !== undefined && this.status >= 500)
    );
  }
}

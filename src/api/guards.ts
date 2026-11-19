/**
 * Runtime validation of API responses.
 *
 * TypeScript types disappear at runtime, and the network is not trusted: a proxy error page
 * or an API of another version must produce a clear {@link ApiError}, not a crash deep in
 * the renderer. Each `as*` helper checks one value and returns it typed.
 */
import { ApiError } from './errors';

/**
 * Builds the error for a value that does not have the expected shape.
 *
 * @param path - Where in the response the value was found, for example `data.upload_id`.
 * @param expected - What was expected there.
 * @returns A parse error.
 */
function mismatch(path: string, expected: string): ApiError {
  return new ApiError('parse', `Unexpected response from the API: ${path} should be ${expected}.`);
}

/**
 * Checks that a value is a plain object.
 *
 * @param value - The value to check.
 * @param path - Location of the value, for the error message.
 * @returns The value as a record.
 * @throws {ApiError} If it is not an object.
 */
export function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw mismatch(path, 'an object');
  }
  return value as Record<string, unknown>;
}

/**
 * Checks that a value is a string.
 *
 * @param value - The value to check.
 * @param path - Location of the value, for the error message.
 * @returns The string.
 * @throws {ApiError} If it is not a string.
 */
export function asString(value: unknown, path: string): string {
  if (typeof value !== 'string') throw mismatch(path, 'a string');
  return value;
}

/**
 * Checks that a value is a finite number.
 *
 * @param value - The value to check.
 * @param path - Location of the value, for the error message.
 * @returns The number.
 * @throws {ApiError} If it is not a finite number.
 */
export function asNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw mismatch(path, 'a number');
  return value;
}

/**
 * Checks that a value is a boolean.
 *
 * @param value - The value to check.
 * @param path - Location of the value, for the error message.
 * @returns The boolean.
 * @throws {ApiError} If it is not a boolean.
 */
export function asBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw mismatch(path, 'true or false');
  return value;
}

/**
 * Checks that a value is an array.
 *
 * @param value - The value to check.
 * @param path - Location of the value, for the error message.
 * @returns The array, with unchecked elements.
 * @throws {ApiError} If it is not an array.
 */
export function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw mismatch(path, 'a list');
  return value;
}

/**
 * Unwraps the API's `{status, data, error, timestamp}` envelope.
 *
 * @param value - The parsed JSON body.
 * @returns The `data` member, unchecked, or `null` when absent.
 * @throws {ApiError} If the body is not an envelope, or reports `status: "error"`.
 */
export function unwrapEnvelope(value: unknown): unknown {
  const envelope = asRecord(value, 'response');
  const status = asString(envelope.status, 'response.status');
  if (status !== 'success') {
    const message =
      typeof envelope.error === 'string' ? envelope.error : 'The API reported an error.';
    throw new ApiError('http', message);
  }
  return envelope.data ?? null;
}

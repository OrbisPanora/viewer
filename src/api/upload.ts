/**
 * Uploading a world archive to the API.
 *
 * Small archives go in one request. Larger ones are cut into fixed-size pieces that are
 * sent one after another, so a single request never exceeds what a reverse proxy accepts
 * and a failed piece can be retried without restarting the transfer.
 */
import { apiJson } from './client';
import { ApiError } from './errors';
import { asString, asRecord, unwrapEnvelope } from './guards';

/** Archives up to this size are sent in a single request. */
export const SINGLE_REQUEST_LIMIT_BYTES = 1024 * 1024;

/**
 * Size of each piece of a chunked upload. It matches the size the API recommends in its
 * `/upload/init` answer; the API accepts any size, so this is advisory on its side.
 */
export const UPLOAD_PIECE_BYTES = 5 * 1024 * 1024;

/** How many times one piece is tried before the upload fails. */
const PIECE_ATTEMPTS = 3;

/** Wait before retrying a failed piece, multiplied by the attempt number. */
const RETRY_DELAY_MS = 500;

/** Time limit for one request that carries file data; large pieces on a slow link need more than the default. */
const TRANSFER_TIMEOUT_MS = 120_000;

/** The Minecraft dimension to load. The viewer only shows the overworld. */
export const UPLOAD_DIMENSION = 'overworld';

/** First bytes of a non-empty zip archive. */
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] as const;

/** Where an upload currently is. */
export type UploadPhase = 'sending' | 'finalizing';

/** Progress report passed to the caller while an upload runs. */
export interface UploadProgress {
  /** `sending` while data moves, `finalizing` while the API unpacks and loads the world. */
  readonly phase: UploadPhase;
  /** Bytes sent so far. */
  readonly sentBytes: number;
  /** Total bytes to send. */
  readonly totalBytes: number;
}

/** Options for {@link uploadWorld}. */
export interface UploadOptions {
  /** Cancels the upload and asks the API to discard what it received. */
  signal?: AbortSignal;
  /** Called after each piece is accepted. */
  onProgress?: (progress: UploadProgress) => void;
}

/** A file the user picked is not an acceptable world archive. */
export class UploadValidationError extends Error {
  /**
   * Creates the error.
   *
   * @param message - What is wrong, written for the user.
   */
  constructor(message: string) {
    super(message);
    this.name = 'UploadValidationError';
  }
}

/**
 * Checks a picked file before any data is sent.
 *
 * This only saves the user a slow upload of an obvious mistake. The API remains the
 * authority and validates the archive again.
 *
 * @param file - The file the user chose.
 * @param maxBytes - Largest accepted size.
 * @throws {UploadValidationError} If the extension, size or leading bytes are wrong.
 */
export async function validateWorldFile(file: File, maxBytes: number): Promise<void> {
  if (!file.name.toLowerCase().endsWith('.zip')) {
    throw new UploadValidationError('Choose a .zip archive of a Minecraft world.');
  }
  if (file.size === 0) {
    throw new UploadValidationError('The file is empty.');
  }
  if (file.size > maxBytes) {
    throw new UploadValidationError(
      `The file is larger than the ${formatBytes(maxBytes)} limit (${formatBytes(file.size)}).`,
    );
  }
  const head = new Uint8Array(await file.slice(0, ZIP_MAGIC.length).arrayBuffer());
  if (!ZIP_MAGIC.every((byte, index) => head[index] === byte)) {
    throw new UploadValidationError('The file is not a zip archive.');
  }
}

/**
 * Formats a byte count for display.
 *
 * @param bytes - The count.
 * @returns A short string such as `1.5 MB`.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Waits, giving up early if the upload is cancelled.
 *
 * @param ms - Time to wait.
 * @param signal - Cancellation.
 * @throws {ApiError} With kind `aborted` if cancelled while waiting.
 */
function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ApiError('aborted', 'The upload was cancelled.'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new ApiError('aborted', 'The upload was cancelled.'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Builds the form body for one request.
 *
 * @param fields - Text fields.
 * @param file - Optional file part as `[fieldName, blob, filename]`.
 * @returns The form data.
 */
function form(
  fields: Record<string, string>,
  file?: [name: string, blob: Blob, filename: string],
): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.append(name, value);
  if (file) data.append(file[0], file[1], file[2]);
  return data;
}

/**
 * Sends one piece, retrying transient failures.
 *
 * @param uploadId - Session identifier from the init call.
 * @param index - Zero-based piece number.
 * @param blob - The piece's bytes.
 * @param signal - Cancellation.
 * @throws {ApiError} If every attempt fails, or immediately for a non-transient error.
 */
async function sendPiece(
  uploadId: string,
  index: number,
  blob: Blob,
  signal?: AbortSignal,
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await apiJson('/api/upload/chunk', {
        method: 'POST',
        body: form({ upload_id: uploadId, chunk_index: String(index) }, [
          'chunk',
          blob,
          `piece_${index}`,
        ]),
        timeoutMs: TRANSFER_TIMEOUT_MS,
        ...(signal ? { signal } : {}),
      });
      return;
    } catch (error) {
      const retryable = error instanceof ApiError && error.isTransient;
      if (!retryable || attempt >= PIECE_ATTEMPTS) throw error;
      await pause(RETRY_DELAY_MS * attempt, signal);
    }
  }
}

/**
 * Uploads a world in one request.
 *
 * @param file - The validated archive.
 * @param options - Progress and cancellation.
 */
async function uploadSingle(file: File, options: UploadOptions): Promise<void> {
  options.onProgress?.({ phase: 'sending', sentBytes: 0, totalBytes: file.size });
  await apiJson(`/api/upload/world?dimension=${UPLOAD_DIMENSION}`, {
    method: 'POST',
    body: form({}, ['file', file, file.name]),
    timeoutMs: TRANSFER_TIMEOUT_MS,
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

/**
 * Uploads a world in pieces.
 *
 * @param file - The validated archive.
 * @param options - Progress and cancellation.
 */
async function uploadInPieces(file: File, options: UploadOptions): Promise<void> {
  const { signal, onProgress } = options;
  const pieceCount = Math.ceil(file.size / UPLOAD_PIECE_BYTES);

  const init = asRecord(
    unwrapEnvelope(
      await apiJson('/api/upload/init', {
        method: 'POST',
        body: form({
          filename: file.name,
          total_chunks: String(pieceCount),
          total_size: String(file.size),
          dimension: UPLOAD_DIMENSION,
        }),
        ...(signal ? { signal } : {}),
      }),
    ),
    'response.data',
  );
  const uploadId = asString(init.upload_id, 'data.upload_id');

  try {
    for (let index = 0; index < pieceCount; index++) {
      const start = index * UPLOAD_PIECE_BYTES;
      const piece = file.slice(start, Math.min(start + UPLOAD_PIECE_BYTES, file.size));
      onProgress?.({ phase: 'sending', sentBytes: start, totalBytes: file.size });
      await sendPiece(uploadId, index, piece, signal);
    }
    onProgress?.({ phase: 'finalizing', sentBytes: file.size, totalBytes: file.size });
    await apiJson('/api/upload/finalize', {
      method: 'POST',
      body: form({ upload_id: uploadId }),
      timeoutMs: TRANSFER_TIMEOUT_MS,
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    // Free the pieces already stored on the server. Best effort: the original error matters more.
    await apiJson(`/api/upload/cancel/${encodeURIComponent(uploadId)}`, { method: 'DELETE' }).catch(
      () => undefined,
    );
    throw error;
  }
}

/**
 * Uploads a world archive and makes the API load it.
 *
 * @param file - An archive that passed {@link validateWorldFile}.
 * @param options - Progress callback and cancellation.
 * @throws {ApiError} If the transfer or the API's unpacking fails, or the upload is cancelled.
 */
export async function uploadWorld(file: File, options: UploadOptions = {}): Promise<void> {
  if (file.size <= SINGLE_REQUEST_LIMIT_BYTES) {
    await uploadSingle(file, options);
  } else {
    await uploadInPieces(file, options);
  }
}

/**
 * State of the world upload, for the home page.
 *
 * The phases form a small state machine; the store is the only place that changes them,
 * so the page cannot show a progress bar for an upload that has already failed.
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { ApiError } from '@/api/errors';
import {
  UploadValidationError,
  formatBytes,
  uploadWorld,
  validateWorldFile,
  type UploadProgress,
} from '@/api/upload';
import { config } from '@/config';
import { useWorldStore } from './world';

/** Where the upload is. `failed` and `done` end the flow until `reset` or a new `start`. */
export type UploadState = 'idle' | 'validating' | 'sending' | 'finalizing' | 'done' | 'failed';

export const useUploadStore = defineStore('upload', () => {
  const state = ref<UploadState>('idle');
  const progress = ref<UploadProgress | null>(null);
  const errorMessage = ref('');
  let controller: AbortController | null = null;

  /**
   * Whether an upload is in progress.
   */
  const busy = computed(
    () => state.value === 'validating' || state.value === 'sending' || state.value === 'finalizing',
  );

  /**
   * Human-readable description of the current step.
   */
  const label = computed(() => {
    switch (state.value) {
      case 'validating':
        return 'Checking the file…';
      case 'sending': {
        const p = progress.value;
        return p
          ? `Sending ${formatBytes(p.sentBytes)} of ${formatBytes(p.totalBytes)}…`
          : 'Sending…';
      }
      case 'finalizing':
        return 'Unpacking the world…';
      case 'done':
        return 'World loaded.';
      default:
        return '';
    }
  });

  /**
   * Validates and uploads a file.
   *
   * @param file - The archive the user picked.
   * @returns `true` if the world is now loaded; `false` after a failure or cancellation,
   *   with `errorMessage` set unless the user cancelled.
   */
  async function start(file: File): Promise<boolean> {
    if (busy.value) return false;
    errorMessage.value = '';
    progress.value = null;
    controller = new AbortController();
    const { signal } = controller;

    try {
      state.value = 'validating';
      await validateWorldFile(file, config.maxUploadBytes);

      state.value = 'sending';
      await uploadWorld(file, {
        signal,
        onProgress: (p) => {
          progress.value = p;
          state.value = p.phase;
        },
      });

      state.value = 'done';
      useWorldStore().markReady();
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.kind === 'aborted') {
        state.value = 'idle';
      } else {
        state.value = 'failed';
        errorMessage.value =
          error instanceof UploadValidationError || error instanceof ApiError
            ? error.message
            : 'The upload failed for an unknown reason.';
      }
      return false;
    } finally {
      controller = null;
    }
  }

  /** Cancels the upload in progress, if any. The API is asked to discard what it received. */
  function cancel(): void {
    controller?.abort();
  }

  /** Returns to the idle state, clearing the last result. */
  function reset(): void {
    if (busy.value) return;
    state.value = 'idle';
    progress.value = null;
    errorMessage.value = '';
  }

  return { state, progress, errorMessage, busy, label, start, cancel, reset };
});

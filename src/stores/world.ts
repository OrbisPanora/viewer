/**
 * Whether the API has a world loaded, as the pages need to know it.
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { ApiError } from '@/api/errors';
import { fetchWorldLoaded } from '@/api/worlds';

/**
 * `unknown` before the first check, `checking` during it, `ready` when a world is loaded,
 * `empty` when the API runs without a world, `unreachable` when the API cannot be reached.
 */
export type WorldStatus = 'unknown' | 'checking' | 'ready' | 'empty' | 'unreachable';

/** Attempts made when the API cannot be reached, for example while it is still starting. */
const CHECK_ATTEMPTS = 3;
/** Wait between attempts, in milliseconds. */
const CHECK_DELAY_MS = 1_000;

export const useWorldStore = defineStore('world', () => {
  const status = ref<WorldStatus>('unknown');
  const message = ref('');

  /**
   * Asks the API whether a world is loaded and stores the answer.
   *
   * Only an unreachable API is retried. A reachable API that has no world answers
   * immediately and will not have one a moment later: uploading is what loads it.
   *
   * @param delayMs - Wait between attempts; tests pass 0.
   * @returns The resulting status.
   */
  async function check(delayMs = CHECK_DELAY_MS): Promise<WorldStatus> {
    status.value = 'checking';
    message.value = '';
    for (let attempt = 1; attempt <= CHECK_ATTEMPTS; attempt++) {
      try {
        status.value = (await fetchWorldLoaded()) ? 'ready' : 'empty';
        return status.value;
      } catch (error) {
        const reason = error instanceof ApiError ? error.message : 'Unexpected error.';
        message.value = reason;
        if (attempt < CHECK_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    status.value = 'unreachable';
    return status.value;
  }

  /** Marks a world as loaded, after a successful upload. */
  function markReady(): void {
    status.value = 'ready';
    message.value = '';
  }

  return { status, message, check, markReady };
});

<!--
  The map. Gets the block sprites (downloaded from Mojang and drawn on the first visit, then read
  from the browser's storage), checks that the API has a world, then starts the pixi viewer inside a
  container that fills the page, and stops it when the page is left.
-->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { fetchWorldRegions } from '@/api/worlds';
import DebugOverlay from '@/components/DebugOverlay.vue';
import ErrorDialog from '@/components/ErrorDialog.vue';
import LoadingProgress from '@/components/LoadingProgress.vue';
import { config } from '@/config';
import { useWorldStore } from '@/stores/world';
import { prepareAtlas } from '@/viewer/pack/prepare';
import type { RenderedAtlas } from '@/viewer/pack/render';
import type { ViewerController, ViewerStats } from '@/viewer/viewerController';

/** Side of a region in blocks (32 chunks of 16 blocks). */
const REGION_BLOCKS = 512;

const router = useRouter();
const world = useWorldStore();

const container = ref<HTMLElement | null>(null);
const stats = ref<ViewerStats | null>(null);
const showDebug = ref(false);
const problem = ref<{ title: string; message: string } | null>(null);
/** The step the user is waiting for while the sprites are prepared, or `null`. */
const loading = ref<{ label: string; done: number; total: number } | null>(null);

let viewer: ViewerController | null = null;
/** Set when the page is left before the viewer finished starting. */
let unmounted = false;

/**
 * Picks a start position: the middle of the first region the API lists, or `undefined`
 * to let the viewer centre on the first chunk that loads.
 *
 * @returns Block coordinates, or `undefined`.
 */
async function findStart(): Promise<{ x: number; z: number } | undefined> {
  try {
    const first = (await fetchWorldRegions())[0];
    if (first) {
      return {
        x: first[0] * REGION_BLOCKS + REGION_BLOCKS / 2,
        z: first[1] * REGION_BLOCKS + REGION_BLOCKS / 2,
      };
    }
  } catch {
    // The hint is optional; the viewer has its own fallback.
  }
  return undefined;
}

/**
 * Gets the block sprites, showing the progress. On failure the error dialog is shown.
 *
 * @returns The sprites, or `undefined` if they could not be prepared.
 */
async function getAtlas(): Promise<RenderedAtlas | undefined> {
  loading.value = { label: 'Preparing the block textures', done: 0, total: 0 };
  try {
    return await prepareAtlas(config.minecraftVersion, (label, done, total) => {
      loading.value = { label, done, total };
    });
  } catch (error) {
    console.error('Block textures failed to load', error);
    problem.value = {
      title: 'Cannot load the block textures',
      message:
        `The block textures of Minecraft ${config.minecraftVersion} could not be downloaded from Mojang. ` +
        'Check the network connection and reload the page.',
    };
    return undefined;
  } finally {
    loading.value = null;
  }
}

onMounted(async () => {
  const atlas = await getAtlas();
  if (unmounted || !atlas) return;

  const status = await world.check();
  if (unmounted) return;
  if (status === 'empty') {
    problem.value = { title: 'No world loaded', message: 'Upload a world archive first.' };
    return;
  }
  if (status !== 'ready') {
    problem.value = { title: 'Cannot reach the API', message: world.message || 'Is it running?' };
    return;
  }

  const startAt = await findStart();
  if (unmounted || !container.value) return;
  try {
    // Imported here so the pixi.js chunk is only downloaded when a world is shown.
    const { ViewerController } = await import('@/viewer/viewerController');
    const created = await ViewerController.create({
      atlas,
      container: container.value,
      ...(startAt ? { startAt } : {}),
      onStats: (s) => {
        if (showDebug.value) stats.value = s;
      },
    });
    if (unmounted) {
      created.destroy();
    } else {
      viewer = created;
      if (import.meta.env.DEV) {
        // Development only: lets benchmarks/run.ts drive the viewer. Not in the build.
        const { installBenchHook } = await import('@/viewer/benchHook');
        installBenchHook(created);
      }
    }
  } catch (error) {
    console.error('Viewer failed to start', error);
    problem.value = {
      title: 'Cannot start the viewer',
      message: 'The browser could not start WebGL, or the block textures failed to load.',
    };
  }
});

onBeforeUnmount(() => {
  unmounted = true;
  viewer?.destroy();
  viewer = null;
});

/** Leaves the viewer for the home page. */
function goHome(): void {
  void router.push('/');
}
</script>

<template>
  <div class="viewer">
    <div ref="container" class="viewer__canvas"></div>
    <div v-if="loading" class="viewer__loading">
      <LoadingProgress :label="loading.label" :done="loading.done" :total="loading.total" />
    </div>
    <div class="viewer__tools">
      <label class="viewer__toggle"> <input v-model="showDebug" type="checkbox" /> Debug </label>
      <DebugOverlay v-if="showDebug" :stats="stats" />
    </div>
    <ErrorDialog
      v-if="problem"
      :title="problem.title"
      :message="problem.message"
      action-label="Back to home"
      @close="goHome"
    />
  </div>
</template>

<style scoped>
.viewer {
  position: relative;
  height: 100%;
  min-height: 20rem;
}

.viewer__canvas {
  position: absolute;
  inset: 0;
  overflow: hidden;
  /* Dragging the map must not select the page's text. */
  user-select: none;
  touch-action: none;
}

.viewer__loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.viewer__loading > * {
  width: min(28rem, 100%);
}

.viewer__tools {
  position: absolute;
  top: 0.75rem;
  left: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: flex-start;
  /* Clicks and drags pass through to the map; only the checkbox below takes them. */
  pointer-events: none;
}

.viewer__toggle {
  pointer-events: auto;
  padding: 0.25rem 0.6rem;
  border-radius: var(--radius);
  background: rgb(0 0 0 / 0.55);
  color: #fff;
  font-size: 0.85rem;
}
</style>

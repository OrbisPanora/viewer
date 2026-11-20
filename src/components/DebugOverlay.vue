<!--
  Small panel with the viewer's internal numbers. Every value is rendered as text.
-->
<script setup lang="ts">
import type { ViewerStats } from '@/viewer/viewerController';

defineProps<{
  /** The latest statistics, or `null` before the first report. */
  stats: ViewerStats | null;
}>();

/**
 * Formats a duration in milliseconds.
 *
 * @param value - Milliseconds.
 * @returns The value with one decimal.
 */
function ms(value: number): string {
  return value.toFixed(1);
}
</script>

<template>
  <dl v-if="stats" class="debug">
    <dt>Camera</dt>
    <dd>{{ stats.cameraX.toFixed(1) }}, {{ stats.cameraZ.toFixed(1) }}</dd>
    <dt>Zoom</dt>
    <dd>{{ stats.zoom.toFixed(2) }}</dd>
    <dt>Visible chunks</dt>
    <dd>{{ stats.visibleChunks }}</dd>
    <dt>Cached</dt>
    <dd>{{ stats.cachedChunks }}</dd>
    <dt>Loading</dt>
    <dd>{{ stats.loadingChunks }}</dd>
    <dt>Missing</dt>
    <dd>{{ stats.missingChunks }}</dd>
    <dt>Frame ms (p50 / p95)</dt>
    <dd>{{ ms(stats.frameMsP50) }} / {{ ms(stats.frameMsP95) }}</dd>
    <dt>Own code ms (p50 / p95)</dt>
    <dd>{{ ms(stats.workMsP50) }} / {{ ms(stats.workMsP95) }}</dd>
    <dt>Wanted update ms (p95)</dt>
    <dd>{{ ms(stats.wantedMsP95) }}</dd>
    <dt>Chunk build ms (p50 / p95)</dt>
    <dd>{{ ms(stats.buildMsP50) }} / {{ ms(stats.buildMsP95) }}</dd>
    <dt>Tilemaps (shown / all)</dt>
    <dd>{{ stats.visibleTilemaps }} / {{ stats.tilemaps }}</dd>
    <dt>Tiles shown</dt>
    <dd>{{ stats.visibleTiles }}</dd>
    <dt>Queued</dt>
    <dd>{{ stats.queuedChunks }}</dd>
    <dt>Requests (started / aborted / failed)</dt>
    <dd>{{ stats.startedRequests }} / {{ stats.abortedRequests }} / {{ stats.failedRequests }}</dd>
    <dt>Wait ms (p50 / p95)</dt>
    <dd>{{ ms(stats.waitMsP50) }} / {{ ms(stats.waitMsP95) }}</dd>
    <dt>Request ms (p50 / p95)</dt>
    <dd>{{ ms(stats.requestMsP50) }} / {{ ms(stats.requestMsP95) }}</dd>
    <dt>Unknown blocks</dt>
    <dd>{{ stats.unknownBlocks }}</dd>
  </dl>
</template>

<style scoped>
.debug {
  display: grid;
  grid-template-columns: auto auto;
  gap: 0.1rem 0.75rem;
  margin: 0;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius);
  background: rgb(0 0 0 / 0.7);
  color: #fff;
  font:
    0.8rem/1.4 ui-monospace,
    monospace;
  pointer-events: none;
}

dt {
  font-weight: 600;
}

dd {
  margin: 0;
  text-align: right;
}
</style>

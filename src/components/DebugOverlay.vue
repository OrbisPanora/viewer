<!--
  Small panel with the viewer's internal numbers. Every value is rendered as text.
-->
<script setup lang="ts">
import type { ViewerStats } from '@/viewer/viewerController';

defineProps<{
  /** The latest statistics, or `null` before the first report. */
  stats: ViewerStats | null;
}>();
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

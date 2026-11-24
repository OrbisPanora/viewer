<!--
  Progress of a step the user waits for, such as downloading the block textures.
-->
<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  /** Text describing the current step. */
  label: string;
  /** Steps done so far. */
  done: number;
  /** Total steps, or `0` when unknown. */
  total: number;
}>();

/** Percentage for the bar, or `null` for an indeterminate bar. */
const percent = computed(() =>
  props.total > 0 ? Math.min(100, Math.round((props.done / props.total) * 100)) : null,
);
</script>

<template>
  <div class="loading" role="status">
    <p class="loading__label">{{ label }}</p>
    <progress :value="percent ?? undefined" max="100" :aria-label="label"></progress>
  </div>
</template>

<style scoped>
.loading {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  align-items: stretch;
  padding: 1.5rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}

.loading__label {
  margin: 0;
}

progress {
  width: 100%;
  height: 0.75rem;
  accent-color: var(--accent);
}
</style>

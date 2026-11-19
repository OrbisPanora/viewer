<!--
  Progress of the world upload, with a cancel button.
-->
<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  /** Text describing the current step. */
  label: string;
  /** Bytes sent so far, or `null` when the amount is unknown. */
  sent: number | null;
  /** Total bytes, or `null` when unknown. */
  total: number | null;
}>();

defineEmits<{
  /** The user asked to cancel. */
  cancel: [];
}>();

/** Percentage for the bar, or `null` for an indeterminate bar. */
const percent = computed(() =>
  props.sent !== null && props.total
    ? Math.min(100, Math.round((props.sent / props.total) * 100))
    : null,
);
</script>

<template>
  <div class="progress" role="status">
    <p class="progress__label">{{ label }}</p>
    <progress :value="percent ?? undefined" max="100" :aria-label="label"></progress>
    <button class="button" type="button" @click="$emit('cancel')">Cancel</button>
  </div>
</template>

<style scoped>
.progress {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  align-items: stretch;
  padding: 1.5rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}

.progress__label {
  margin: 0;
}

progress {
  width: 100%;
  height: 0.75rem;
  accent-color: var(--accent);
}

.button {
  align-self: flex-end;
}
</style>

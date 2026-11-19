<!--
  A modal message built on the native <dialog> element, which traps focus, closes on
  Escape and is announced by screen readers without extra code.
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue';

defineProps<{
  /** Short heading. */
  title: string;
  /** Explanation, shown as text (never as HTML). */
  message: string;
  /** Label of the button. */
  actionLabel?: string;
}>();

const emit = defineEmits<{
  /** The dialog was dismissed, by the button or by Escape. */
  close: [];
}>();

const dialog = ref<HTMLDialogElement | null>(null);

onMounted(() => dialog.value?.showModal());
</script>

<template>
  <dialog ref="dialog" class="dialog" @close="emit('close')">
    <h2>{{ title }}</h2>
    <p>{{ message }}</p>
    <form method="dialog">
      <button class="button button--primary" autofocus>{{ actionLabel ?? 'Close' }}</button>
    </form>
  </dialog>
</template>

<style scoped>
.dialog {
  max-width: 28rem;
  padding: 1.5rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
}

.dialog::backdrop {
  background: rgb(0 0 0 / 0.6);
}

.dialog h2 {
  margin-top: 0;
}
</style>

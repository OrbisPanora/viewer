<!--
  A file picker that also accepts a dropped file. It only reports the choice; checking
  and uploading the file is the parent's job.

  The real <input type="file"> stays in the page (visually hidden) so keyboard and
  screen-reader users get the normal file dialog; the label around it is the visible target.
-->
<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  /** Disables the picker, for example while an upload runs. */
  disabled?: boolean;
}>();

const emit = defineEmits<{
  /** The user chose or dropped a file. */
  select: [file: File];
}>();

const isDragOver = ref(false);

/**
 * Reports the first file of a list. Extra files are ignored: a world is one archive.
 *
 * @param files - Files from the input or the drop.
 */
function pick(files: FileList | null | undefined): void {
  const file = files?.[0];
  if (file) emit('select', file);
}

/**
 * Handles the input's change event, then clears it so the same file can be chosen again.
 *
 * @param event - The change event.
 */
function onChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  pick(input.files);
  input.value = '';
}

/**
 * Handles a drop on the zone.
 *
 * @param event - The drop event.
 */
function onDrop(event: DragEvent): void {
  isDragOver.value = false;
  if (!props.disabled) pick(event.dataTransfer?.files);
}
</script>

<template>
  <label
    class="drop"
    :class="{ 'drop--over': isDragOver, 'drop--disabled': disabled }"
    @dragover.prevent="isDragOver = true"
    @dragleave.prevent="isDragOver = false"
    @drop.prevent="onDrop"
  >
    <input
      class="visually-hidden"
      type="file"
      accept=".zip,application/zip"
      :disabled="disabled"
      @change="onChange"
    />
    <svg class="drop__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
    <span class="drop__title">Drop a world archive here</span>
    <span class="drop__hint">or click to choose a .zip file</span>
  </label>
</template>

<style scoped>
.drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 2.5rem 1rem;
  border: 2px dashed var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  cursor: pointer;
  text-align: center;
}

.drop:hover,
.drop--over,
.drop:focus-within {
  border-color: var(--accent);
  background: var(--surface-raised);
}

.drop--disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.drop__icon {
  width: 3rem;
  height: 3rem;
  color: var(--accent);
}

.drop__title {
  font-size: 1.1rem;
  font-weight: 600;
}

.drop__hint {
  color: var(--text-muted);
}
</style>

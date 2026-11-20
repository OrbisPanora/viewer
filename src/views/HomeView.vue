<!--
  Home page: choose a world archive, upload it, then open the viewer.
-->
<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import DropZone from '@/components/DropZone.vue';
import ErrorDialog from '@/components/ErrorDialog.vue';
import UploadProgress from '@/components/UploadProgress.vue';
import { config } from '@/config';
import { formatBytes } from '@/api/upload';
import { useUploadStore } from '@/stores/upload';

const router = useRouter();
const upload = useUploadStore();
const { busy, label, progress, errorMessage, state } = storeToRefs(upload);

/**
 * Uploads the chosen file and opens the viewer when the world is loaded.
 *
 * @param file - The archive the user picked.
 */
async function onSelect(file: File): Promise<void> {
  if (await upload.start(file)) await router.push('/viewer');
}
</script>

<template>
  <div class="container">
    <h1>OrbisPanora</h1>
    <p class="lead">Upload a zipped Minecraft world to see it from above in isometric view.</p>

    <UploadProgress
      v-if="busy"
      :label="label"
      :sent="progress?.sentBytes ?? null"
      :total="progress?.totalBytes ?? null"
      @cancel="upload.cancel()"
    />
    <DropZone v-else @select="onSelect" />

    <p class="note">
      The archive must contain the world folder with its <code>region</code> files. Maximum size:
      {{ formatBytes(config.maxUploadBytes) }}. The file is sent to the API you are connected to and
      is not kept by this page.
    </p>

    <ErrorDialog
      v-if="state === 'failed'"
      title="Upload failed"
      :message="errorMessage"
      @close="upload.reset()"
    />
  </div>
</template>

<style scoped>
.lead {
  color: var(--text-muted);
  margin-bottom: 1.5rem;
}

.note {
  margin-top: 1.5rem;
  color: var(--text-muted);
  font-size: 0.9rem;
}
</style>

<!--
  Application shell: the navigation bar above the routed page.
-->
<script setup lang="ts">
import AppNav from '@/components/AppNav.vue';
</script>

<template>
  <AppNav />
  <main class="page">
    <RouterView />
  </main>
</template>

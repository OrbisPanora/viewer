<!--
  Points to the API's own interactive documentation. It is opened in a new tab rather than
  embedded: the pages are served by the API with their own scripts, and framing them from
  the same origin would give them full access to this app's page.
-->
<script setup lang="ts">
import { config } from '@/config';

const docs = `${config.apiBaseUrl}/docs`;
const reference = `${config.apiBaseUrl}/redoc`;
const schema = `${config.apiBaseUrl}/openapi.json`;
</script>

<template>
  <div class="container">
    <h1>API</h1>
    <p>
      The API documents itself. These pages are generated from the code, so they always match the
      running version.
    </p>
    <ul>
      <li>
        <a :href="docs" target="_blank" rel="noopener noreferrer"
          >Interactive documentation (Swagger UI)</a
        >
      </li>
      <li><a :href="reference" target="_blank" rel="noopener noreferrer">Reference (ReDoc)</a></li>
      <li><a :href="schema" target="_blank" rel="noopener noreferrer">OpenAPI schema (JSON)</a></li>
    </ul>
  </div>
</template>

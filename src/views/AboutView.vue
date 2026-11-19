<!--
  About page: what the project is and how its parts fit together.
-->
<template>
  <div class="container">
    <h1>About OrbisPanora</h1>
    <p>
      OrbisPanora shows a Minecraft world from above in isometric view, in the browser. It has three
      parts:
    </p>
    <ul>
      <li><strong>lib</strong>: a Python library that reads and writes Anvil region files.</li>
      <li><strong>api</strong>: a FastAPI server that uses the library to serve chunks as JSON.</li>
      <li><strong>web</strong>: this page, which draws the chunks with WebGL.</li>
    </ul>
    <p>
      Use a copy of a world you care about: the API only reads worlds, but a copy costs nothing.
    </p>
  </div>
</template>

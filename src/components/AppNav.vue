<!--
  Top navigation bar. Links use RouterLink so navigation does not reload the page.
-->
<template>
  <header class="nav">
    <nav class="nav__inner" aria-label="Main">
      <RouterLink to="/" class="nav__brand">
        <img src="/assets/opw.png" alt="" width="28" height="28" />
        OrbisPanora
      </RouterLink>
      <RouterLink to="/viewer">Viewer</RouterLink>
      <RouterLink to="/api-docs">API</RouterLink>
      <RouterLink to="/about">About</RouterLink>
    </nav>
  </header>
</template>

<style scoped>
.nav {
  flex: none;
  height: var(--nav-height);
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.nav__inner {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  height: 100%;
  padding: 0 1rem;
}

.nav a {
  color: var(--text-muted);
  text-decoration: none;
}

.nav a:hover,
.nav a.router-link-exact-active {
  color: var(--text);
}

.nav__brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-right: auto;
  color: var(--text) !important;
  font-weight: 600;
}
</style>

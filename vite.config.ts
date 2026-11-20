/**
 * Vite and Vitest configuration.
 *
 * In development the browser only talks to the Vite server. Requests under `/api` (and the
 * API's own documentation pages) are forwarded to the real API, so the app needs no CORS
 * setup and calls the same origin that a reverse proxy would give it in production.
 * The API's address is read from `VITE_DEV_API_TARGET` (see `.env.example`).
 */
import { fileURLToPath, URL } from 'node:url';
import { loadEnv, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

/** Paths that belong to the API. Responses for these keep the API's own headers. */
const API_PATHS = ['/api', '/docs', '/redoc', '/openapi.json'];

/**
 * Builds the Content-Security-Policy for the app's own pages.
 *
 * `style-src 'unsafe-inline'` is needed because Vue injects component styles as `<style>`
 * elements in development. Scripts are never inline. `worker-src blob:` and `img-src blob:`
 * are used by pixi.js to decode images off the main thread. There is no `unsafe-eval`:
 * the viewer imports `pixi.js/unsafe-eval`, which replaces the code generation pixi would
 * otherwise do with `new Function`.
 *
 * @param dev - Whether the policy is for the dev server, which also needs its HMR WebSocket.
 * @returns The header value.
 */
function contentSecurityPolicy(dev: boolean): string {
  const directives = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    `connect-src 'self'${dev ? ' ws:' : ''}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  return directives.join('; ');
}

/**
 * Sets security headers on the app's own responses in `vite dev` and `vite preview`.
 *
 * Responses for API paths are skipped: the API's documentation pages load their scripts
 * from a CDN and must keep their own policy. A production web server has to send the
 * same headers; the values are documented in the README.
 *
 * @param dev - Whether this is the dev server.
 * @returns A Vite plugin.
 */
function securityHeaders(dev: boolean): Plugin {
  const csp = contentSecurityPolicy(dev);
  const middleware = (
    req: { url?: string },
    res: { setHeader: (name: string, value: string) => void },
    next: () => void,
  ): void => {
    const url = req.url ?? '/';
    if (!API_PATHS.some((prefix) => url === prefix || url.startsWith(`${prefix}/`))) {
      res.setHeader('Content-Security-Policy', csp);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    }
    next();
  };
  return {
    name: 'orbispanora-security-headers',
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  };
}

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiTarget = env.VITE_DEV_API_TARGET ?? 'http://127.0.0.1:8000';
  const proxy = Object.fromEntries(
    API_PATHS.map((path) => [path, { target: apiTarget, changeOrigin: false }]),
  );

  return {
    plugins: [vue(), securityHeaders(command === 'serve')],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      // Loopback only: the dev server must not be reachable from the local network.
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy,
    },
    preview: {
      host: '127.0.0.1',
      port: 4173,
      strictPort: true,
      proxy,
    },
    build: {
      sourcemap: true,
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
      restoreMocks: true,
      coverage: {
        provider: 'v8',
        // Every source file counts, including those no test imports.
        include: ['src/**/*.{ts,vue}'],
        exclude: [
          'src/**/*.test.ts',
          'src/test-utils.ts',
          'src/env.d.ts',
          // These two draw with WebGL through pixi.js, which the test environment does not
          // have. They are checked by running the viewer.
          'src/viewer/sceneRenderer.ts',
          'src/viewer/atlas.ts',
        ],
        reporter: ['text', 'lcov'],
        thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
      },
    },
  };
});

# OrbisPanora web

Isometric viewer for Minecraft worlds. A Vue 3 single-page app that uploads a zipped world
to the OrbisPanora API (`../api`) and draws the chunks it returns with pixi.js (WebGL).

## Requirements

- Node.js 22 or newer (24 is what the Dockerfiles use).
- The API running locally. From `../api`: `uv run orbispanora run`.

## Quick start

```bash
npm ci
npm run dev          # http://127.0.0.1:5173
```

Open the page, drop a world archive (`.zip` with the world folder inside), and the viewer
opens. Pan by dragging or with the arrow keys (WASD and ZQSD also work), zoom with the mouse
wheel or `+` and `-`.

Use a copy of a world you care about. The API only reads worlds, but a copy costs nothing.

## Scripts

| Command                 | Purpose                                                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`           | Dev server with hot reload and the API proxy.                                                                                                             |
| `npm run build`         | Type-check, then build to `dist/`.                                                                                                                        |
| `npm run preview`       | Serve `dist/` (port 4173), with the same proxy and headers.                                                                                               |
| `npm run typecheck`     | `vue-tsc` only.                                                                                                                                           |
| `npm run lint`          | ESLint, including the rule that exports must have a doc comment.                                                                                          |
| `npm run format`        | Prettier (`format:check` only reports).                                                                                                                   |
| `npm test`              | Vitest unit and component tests.                                                                                                                          |
| `npm run test:coverage` | The same with coverage. CI fails below 80 % (statements, branches, functions, lines). `sceneRenderer.ts` and `atlas.ts` draw with WebGL and are excluded. |

## Configuration

### Changing the API port

The browser never talks to the API directly in development. It calls the Vite server on its
own origin (`/api/...`), and Vite forwards `/api`, `/docs`, `/redoc` and `/openapi.json` to the
API. To point it at another port, for example when the API runs with `--port 8020`, create
`.env.local` (not committed):

```
VITE_DEV_API_TARGET=http://127.0.0.1:8020
```

and restart `npm run dev`. The default is `http://127.0.0.1:8000`. Because everything goes
through one origin, no CORS setup is needed.

### Other variables

All variables are listed in `.env.example`. Vite copies every `VITE_*` variable into the
browser bundle, so never put a secret in one.

| Variable              | Default                 | Meaning                                                               |
| --------------------- | ----------------------- | --------------------------------------------------------------------- |
| `VITE_DEV_API_TARGET` | `http://127.0.0.1:8000` | Where the dev and preview servers forward API requests.               |
| `VITE_API_BASE_URL`   | empty                   | API origin as the browser sees it. Empty means the page's own origin. |
| `VITE_MAX_UPLOAD_MB`  | `500`                   | Largest archive the upload form accepts. The API's own limit is 500.  |

Invalid values stop the app at startup with a message naming the variable (`src/config.ts`).

## Architecture

```
src/
├── main.ts, App.vue         app shell, router, Pinia
├── config.ts                validated environment variables
├── api/                     everything that talks to the API
│   ├── client.ts            fetch wrapper: timeout, cancellation, ApiError
│   ├── guards.ts            runtime validation of every response
│   ├── chunks.ts            GET /api/chunks/{x}/{z}/{h}?mode=isometric
│   ├── worlds.ts            world health and region list
│   └── upload.ts            single and chunked upload, file validation
├── viewer/                  the map; no Vue code, unit tested
│   ├── projection.ts        isometric maths and which chunks are visible
│   ├── camera.ts            position, zoom, viewport
│   ├── chunkLoader.ts       parallel limit, priority, cancellation, retry
│   ├── chunkCache.ts        least-recently-used cache
│   ├── sceneRenderer.ts     pixi tilemaps and placeholders
│   ├── inputController.ts   pointer, wheel and keyboard
│   ├── atlas.ts             block sprite sheet
│   └── viewerController.ts  connects the pieces above
├── stores/                  Pinia: world status, upload state machine
├── components/, views/      Vue UI
└── test-utils.ts            fetch stub for tests
```

How a chunk reaches the screen: the camera moves, `viewerController` recomputes which chunks
are visible, `chunkLoader` fetches the missing ones nearest first (at most six at a time,
cancelling requests for chunks that scrolled away), and `sceneRenderer` draws each as one
tilemap. Chunks the world does not have are remembered and shown as grey diamonds.

The API computes each block's screen position, so the client only places sprites. The
sprite sheet is `public/iso_cube.png` and `public/iso_cube.json`. A block with no sprite is
drawn as glass and reported once in the console.

### Adding an API call

1. Add the function to the matching file in `src/api/`, using `apiJson` and the `as*` helpers
   from `guards.ts` so an unexpected answer becomes an `ApiError` and not a crash.
2. Write its test with `stubFetch` from `src/test-utils.ts`.
3. Call it from a store or component, and show `error.message` as text.

## Security

- The API's answers are validated before use (`src/api/guards.ts`).
- No `v-html`, `innerHTML` or `eval` (ESLint forbids them). The pixi build used is
  `pixi.js/unsafe-eval`, so the Content-Security-Policy does not need `unsafe-eval`.
- The dev and preview servers send a Content-Security-Policy, `X-Content-Type-Options`,
  `Referrer-Policy` and `Permissions-Policy` for the app's pages (`vite.config.ts`). The API's
  own `/docs` pages keep their own headers. The dev server listens on `127.0.0.1` only.
- The upload form checks the extension, size and zip signature before sending anything. The API
  stays the authority and validates again.
- The API pages open in a new tab with `rel="noopener noreferrer"`, not in a frame.
- `npm audit --omit=dev` reports no vulnerabilities. `npm audit` reports 19 moderate ones, all
  in the lint and test toolchain (`minimatch`, `glob`, `js-beautify`) that is not shipped.

## Deployment

The production image (`Dockerfile.prod`) serves the built files with an unprivileged nginx on
port 8080 and sends the same security headers as `vite.config.ts`. It also forwards `/api`,
`/docs`, `/redoc` and `/openapi.json` to the API, so the app and the API share one origin and
the app needs no configuration. Set the API's address when starting the container:

```bash
docker run -p 8080:8080 -e API_UPSTREAM=http://api:8000 ghcr.io/orbispanora/viewer:0.1.0
```

nginx resolves the host name of `API_UPSTREAM` when it starts, so the API has to be reachable
by that name at that time. The default is `http://127.0.0.1:8000`.

- Uploads go through the image in pieces of 5 MB; `client_max_body_size` is 20 MB because of that.
  The size limit of a whole upload is set in the API (`ORBISPANORA_UPLOAD_MAX_SIZE_MB`) and in the
  build of the app (`VITE_MAX_UPLOAD_MB`).
- The API has no authentication: anyone who can reach it can upload a world and switch the
  loaded one. Put access control in front of it before exposing it beyond your own machine or
  network.

## Docker

`docker compose up` starts the dev server on `127.0.0.1:5173`, reaching an API on the host.
`Dockerfile.prod` is the production image described above. Releases are published to
`ghcr.io/orbispanora/viewer` by the workflow in `.github/workflows/release.yaml` when a tag
`vX.Y.Z` is pushed. The image is scanned with Trivy before it is pushed.

## Licence

PolyForm Noncommercial License 1.0.0, see `LICENSE`.

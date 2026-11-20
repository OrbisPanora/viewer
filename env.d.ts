/// <reference types="vite/client" />

/**
 * The environment variables the app reads. Vite copies every `VITE_*` variable into the
 * browser bundle, so none of these may hold a secret.
 */
interface ImportMetaEnv {
  /** Origin of the API. Empty (the default) means the page's own origin. */
  readonly VITE_API_BASE_URL?: string;
  /** Largest world archive, in MiB, that the upload form accepts. */
  readonly VITE_MAX_UPLOAD_MB?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

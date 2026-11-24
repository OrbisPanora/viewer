/**
 * Runtime configuration of the app, read once from Vite environment variables.
 *
 * Vite copies every `VITE_*` variable into the bundle, so this module only handles values
 * that are safe to publish. Invalid values stop the app at startup with a message naming
 * the variable, instead of failing later in an unrelated place.
 */

/** The settings the rest of the app reads. */
export interface AppConfig {
  /** Origin of the API without a trailing slash, or `''` for the page's own origin. */
  readonly apiBaseUrl: string;
  /** Largest world archive the upload form accepts, in bytes. */
  readonly maxUploadBytes: number;
  /** Minecraft version whose `client.jar` the block sprites are drawn from, for example `26.3`. */
  readonly minecraftVersion: string;
}

/** Raised when an environment variable holds an unusable value. */
export class ConfigError extends Error {
  /**
   * Creates the error.
   *
   * @param variable - Name of the offending variable.
   * @param problem - What is wrong with its value.
   */
  constructor(variable: string, problem: string) {
    super(`Invalid ${variable}: ${problem}`);
    this.name = 'ConfigError';
  }
}

const DEFAULT_MAX_UPLOAD_MB = 500;
const DEFAULT_MINECRAFT_VERSION = '26.3';
/** Upper bound that guards against typos such as an extra zero; not an API limit. */
const MAX_UPLOAD_MB_CEILING = 10_240;

/**
 * Validates the API origin.
 *
 * @param raw - The raw variable value.
 * @returns The origin without a trailing slash, or `''`.
 * @throws {ConfigError} If the value is not an http(s) origin.
 */
function parseApiBaseUrl(raw: string | undefined): string {
  const value = (raw ?? '').trim();
  if (value === '') return '';
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError('VITE_API_BASE_URL', `"${value}" is not a URL`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ConfigError('VITE_API_BASE_URL', 'only http and https are allowed');
  }
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    throw new ConfigError('VITE_API_BASE_URL', 'give an origin only, without a path');
  }
  return url.origin;
}

/**
 * Validates the upload size limit.
 *
 * @param raw - The raw variable value, in MiB.
 * @returns The limit in bytes.
 * @throws {ConfigError} If the value is not a whole number in range.
 */
function parseMaxUploadBytes(raw: string | undefined): number {
  const value = (raw ?? '').trim();
  if (value === '') return DEFAULT_MAX_UPLOAD_MB * 1024 * 1024;
  const megabytes = Number(value);
  if (!Number.isInteger(megabytes) || megabytes < 1 || megabytes > MAX_UPLOAD_MB_CEILING) {
    throw new ConfigError(
      'VITE_MAX_UPLOAD_MB',
      `"${value}" is not a whole number between 1 and ${MAX_UPLOAD_MB_CEILING}`,
    );
  }
  return megabytes * 1024 * 1024;
}

/**
 * Validates the Minecraft version.
 *
 * @param raw - The raw variable value.
 * @returns The version id, or the default.
 * @throws {ConfigError} If the value has characters a version id does not have.
 */
function parseMinecraftVersion(raw: string | undefined): string {
  const value = (raw ?? '').trim();
  if (value === '') return DEFAULT_MINECRAFT_VERSION;
  if (!/^[0-9A-Za-z][0-9A-Za-z._-]*$/.test(value)) {
    throw new ConfigError('VITE_MINECRAFT_VERSION', `"${value}" is not a Minecraft version id`);
  }
  return value;
}

/**
 * Builds the configuration from an environment object.
 *
 * @param env - Usually `import.meta.env`; a plain object in tests.
 * @returns The validated configuration.
 * @throws {ConfigError} If a variable is invalid.
 */
export function parseConfig(env: Record<string, string | undefined>): AppConfig {
  return {
    apiBaseUrl: parseApiBaseUrl(env.VITE_API_BASE_URL),
    maxUploadBytes: parseMaxUploadBytes(env.VITE_MAX_UPLOAD_MB),
    minecraftVersion: parseMinecraftVersion(env.VITE_MINECRAFT_VERSION),
  };
}

/** The configuration of the running app. */
export const config: AppConfig = parseConfig(import.meta.env);

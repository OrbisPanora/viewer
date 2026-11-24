/**
 * Finds the `client.jar` of a Minecraft version on Mojang's servers.
 *
 * The version manifest lists every version with the address of its description. That description names the
 * address, size and SHA-1 of the client. Both servers allow requests from any web page (CORS).
 */

/** Address of the list of versions. */
export const VERSION_MANIFEST_URL =
  'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

/** Hosts the viewer accepts for downloads. The content security policy allows the same two. */
const ALLOWED_HOSTS = new Set(['piston-meta.mojang.com', 'piston-data.mojang.com']);

/** Where to read the client of one version. */
export interface ClientJar {
  /** Address of the jar. */
  readonly url: string;
  /** Size of the jar in bytes. */
  readonly size: number;
  /** SHA-1 of the jar, as hexadecimal text. It names the stored atlas. */
  readonly sha1: string;
}

/**
 * Reads a JSON document.
 *
 * @param url - Address of the document.
 * @param fetchFn - The function that makes the request.
 * @returns The parsed document.
 * @throws {Error} If the request fails or the answer is not JSON.
 */
async function fetchJson(url: string, fetchFn: typeof fetch): Promise<unknown> {
  const response = await fetchFn(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return (await response.json()) as unknown;
}

/**
 * Checks that an address is on one of Mojang's download hosts.
 *
 * @param value - The value from the manifest.
 * @param what - What the address is, for the error message.
 * @returns The address.
 * @throws {Error} If it is not an https address on an allowed host.
 */
function mojangUrl(value: unknown, what: string): string {
  if (typeof value !== 'string') throw new Error(`The ${what} is missing from Mojang's answer`);
  const url = new URL(value);
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error(`The ${what} points to ${url.hostname}, which is not a Mojang download host`);
  }
  return url.href;
}

/**
 * Reads a field of an object.
 *
 * @param value - The object.
 * @param key - The field name.
 * @returns The field, or `undefined` if the value is not an object.
 */
function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

/**
 * Finds the client of a version.
 *
 * @param version - Version id, for example `26.3`.
 * @param fetchFn - The function that makes the requests; `fetch` unless a test replaces it.
 * @returns Address, size and SHA-1 of the client.
 * @throws {Error} If Mojang does not list the version, or an answer has an unexpected shape.
 */
export async function findClientJar(
  version: string,
  fetchFn: typeof fetch = fetch,
): Promise<ClientJar> {
  const manifest = await fetchJson(VERSION_MANIFEST_URL, fetchFn);
  const versions = field(manifest, 'versions');
  const listed = Array.isArray(versions)
    ? versions.find((v) => field(v, 'id') === version)
    : undefined;
  if (!listed) throw new Error(`Mojang does not list the version ${version}`);

  const description = await fetchJson(
    mojangUrl(field(listed, 'url'), 'address of the version file'),
    fetchFn,
  );
  const client = field(field(description, 'downloads'), 'client');
  const size = field(client, 'size');
  const sha1 = field(client, 'sha1');
  if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0) {
    throw new Error(`The size of the client of ${version} is missing from Mojang's answer`);
  }
  if (typeof sha1 !== 'string' || !/^[0-9a-f]{40}$/.test(sha1)) {
    throw new Error(`The SHA-1 of the client of ${version} is missing from Mojang's answer`);
  }
  return { url: mojangUrl(field(client, 'url'), 'address of the client'), size, sha1 };
}

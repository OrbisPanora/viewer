/**
 * Reads chosen files from a zip file on a server, without downloading the whole zip.
 *
 * A zip ends with a list of its files (the central directory) that gives the position and size of each. The
 * reader fetches that list with one range request, then fetches only the bytes of the files it is asked for.
 * Files that lie close to each other are fetched together. Every file is checked against the CRC-32 stored in
 * the zip. Zip64 archives are not supported.
 */
import { crc32 } from './crc32';

/** Reads the bytes `start` to `end` of the zip, both included. */
export type RangeReader = (start: number, end: number) => Promise<Uint8Array>;

/** One file of the zip, as listed in the central directory. */
export interface ZipEntry {
  /** Path inside the zip, such as `assets/minecraft/blockstates/stone.json`. */
  readonly name: string;
  /** 0 for stored, 8 for deflate. */
  readonly method: number;
  /** CRC-32 of the file's content. */
  readonly crc: number;
  /** Size of the stored bytes. */
  readonly compressedSize: number;
  /** Size of the content. */
  readonly size: number;
  /** Position of the local header in the zip. */
  readonly offset: number;
  /** Bytes of the central directory's name and extra field, used to estimate the local header's size. */
  readonly headerSize: number;
}

/** An opened zip. */
export interface ZipArchive {
  /**
   * Lists the names that start with a prefix.
   *
   * @param prefix - Start of the path, such as `assets/minecraft/blockstates/`.
   * @returns The matching names, in the order of the zip.
   */
  list(prefix: string): string[];
  /**
   * Reads files.
   *
   * @param names - Paths inside the zip.
   * @param onProgress - Called after each file with the number done and the total.
   * @returns The content of each file, by name.
   * @throws {Error} If a name is not in the zip, a method is not supported, or a size or CRC-32 does not match.
   */
  read(
    names: string[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<Map<string, Uint8Array>>;
}

const END_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
/** The end record is 22 bytes plus a comment of at most 65535 bytes. */
const MAX_END_SEARCH = 22 + 0xffff;
const LOCAL_HEADER_SIZE = 30;
/** Files separated by less than this many bytes are fetched in one request. */
const MERGE_GAP = 64 * 1024;

/**
 * Opens a zip.
 *
 * @param size - Size of the zip in bytes.
 * @param read - Fetches a range of the zip.
 * @returns The archive.
 * @throws {Error} If the data is not a zip, or is a Zip64 archive.
 */
export async function openRemoteZip(size: number, read: RangeReader): Promise<ZipArchive> {
  const tailStart = Math.max(0, size - MAX_END_SEARCH);
  const tail = await read(tailStart, size - 1);
  const tailView = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);

  let end = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tailView.getUint32(i, true) === END_SIGNATURE) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('Not a zip file: the end record was not found');

  const count = tailView.getUint16(end + 10, true);
  const directorySize = tailView.getUint32(end + 12, true);
  const directoryOffset = tailView.getUint32(end + 16, true);
  if (count === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    throw new Error('Zip64 archives are not supported');
  }

  const directory =
    directoryOffset >= tailStart
      ? tail.subarray(directoryOffset - tailStart, directoryOffset - tailStart + directorySize)
      : await read(directoryOffset, directoryOffset + directorySize - 1);

  const entries = parseDirectory(directory, count);

  return {
    list: (prefix) => [...entries.keys()].filter((name) => name.startsWith(prefix)),
    read: (names, onProgress) => readEntries(entries, size, read, names, onProgress),
  };
}

/**
 * Parses the central directory.
 *
 * @param bytes - The directory.
 * @param count - Number of entries it should hold.
 * @returns The entries by name.
 */
function parseDirectory(bytes: Uint8Array, count: number): Map<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const entries = new Map<string, ZipEntry>();
  let position = 0;
  for (let i = 0; i < count; i++) {
    if (position + 46 > bytes.length || view.getUint32(position, true) !== CENTRAL_SIGNATURE) {
      throw new Error('Not a zip file: the central directory is damaged');
    }
    const nameLength = view.getUint16(position + 28, true);
    const extraLength = view.getUint16(position + 30, true);
    const commentLength = view.getUint16(position + 32, true);
    const name = decoder.decode(bytes.subarray(position + 46, position + 46 + nameLength));
    entries.set(name, {
      name,
      method: view.getUint16(position + 10, true),
      crc: view.getUint32(position + 16, true),
      compressedSize: view.getUint32(position + 20, true),
      size: view.getUint32(position + 24, true),
      offset: view.getUint32(position + 42, true),
      headerSize: nameLength + extraLength,
    });
    position += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/**
 * Fetches, inflates and checks the chosen files.
 *
 * @param entries - The directory.
 * @param size - Size of the zip.
 * @param read - Fetches a range of the zip.
 * @param names - The files to read.
 * @param onProgress - Called after each file.
 * @returns The content of each file, by name.
 */
async function readEntries(
  entries: Map<string, ZipEntry>,
  size: number,
  read: RangeReader,
  names: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, Uint8Array>> {
  const wanted = names.map((name) => {
    const entry = entries.get(name);
    if (!entry) throw new Error(`${name} is not in the zip`);
    return entry;
  });
  wanted.sort((a, b) => a.offset - b.offset);

  // Each group is one request: files whose estimated ranges are less than MERGE_GAP apart.
  const groups: { start: number; end: number; entries: ZipEntry[] }[] = [];
  for (const entry of wanted) {
    const end = Math.min(
      size - 1,
      entry.offset + LOCAL_HEADER_SIZE + entry.headerSize + entry.compressedSize - 1,
    );
    const last = groups[groups.length - 1];
    if (last && entry.offset - last.end <= MERGE_GAP) {
      last.end = Math.max(last.end, end);
      last.entries.push(entry);
    } else {
      groups.push({ start: entry.offset, end, entries: [entry] });
    }
  }

  const result = new Map<string, Uint8Array>();
  let done = 0;
  for (const group of groups) {
    let bytes = await read(group.start, group.end);
    for (const entry of group.entries) {
      const local = entry.offset - group.start;
      // The local header may have a longer extra field than the directory's copy, so its size is read here.
      const needHeader = local + LOCAL_HEADER_SIZE;
      if (needHeader > bytes.length) {
        bytes = await extend(bytes, group.start, needHeader - bytes.length, size, read);
      }
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      if (view.getUint32(local, true) !== LOCAL_SIGNATURE) {
        throw new Error(`${entry.name}: the local header is damaged`);
      }
      const dataStart =
        local +
        LOCAL_HEADER_SIZE +
        view.getUint16(local + 26, true) +
        view.getUint16(local + 28, true);
      const dataEnd = dataStart + entry.compressedSize;
      if (dataEnd > bytes.length) {
        bytes = await extend(bytes, group.start, dataEnd - bytes.length, size, read);
      }
      const content = await inflate(bytes.subarray(dataStart, dataEnd), entry);
      if (content.length !== entry.size)
        throw new Error(`${entry.name}: wrong size after unpacking`);
      if (crc32(content) !== entry.crc) throw new Error(`${entry.name}: the CRC-32 does not match`);
      result.set(entry.name, content);
      onProgress?.(++done, wanted.length);
    }
  }
  return result;
}

/**
 * Fetches more bytes after a range already read.
 *
 * @param bytes - The bytes read so far.
 * @param start - Position of `bytes[0]` in the zip.
 * @param missing - How many more bytes are needed.
 * @param size - Size of the zip.
 * @param read - Fetches a range of the zip.
 * @returns The bytes with the new ones appended.
 */
async function extend(
  bytes: Uint8Array,
  start: number,
  missing: number,
  size: number,
  read: RangeReader,
): Promise<Uint8Array> {
  const have = start + bytes.length - 1;
  const last = Math.min(size - 1, have + missing);
  if (last <= have) throw new Error('The zip ends before the end of a file');
  const more = await read(have + 1, last);
  const joined = new Uint8Array(bytes.length + more.length);
  joined.set(bytes, 0);
  joined.set(more, bytes.length);
  return joined;
}

/**
 * Unpacks the stored bytes of one file.
 *
 * @param stored - The bytes as stored in the zip.
 * @param entry - The file's directory entry.
 * @returns The content.
 * @throws {Error} If the compression method is not stored or deflate.
 */
async function inflate(stored: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  if (entry.method === 0) return stored.slice();
  if (entry.method !== 8)
    throw new Error(`${entry.name}: compression method ${entry.method} is not supported`);
  const stream = new Blob([stored as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

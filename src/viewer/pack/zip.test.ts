import { describe, expect, it, vi } from 'vitest';
import { crc32 } from './crc32';
import { openRemoteZip, type RangeReader } from './zip';

interface Source {
  name: string;
  content: Uint8Array;
  stored?: boolean;
  /** Extra bytes in the local header only, to make it longer than the directory's copy. */
  localExtra?: number;
}

/** Compresses with raw deflate, as the entries of a zip are. */
async function deflateRaw(content: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([content as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Builds a zip in memory. */
async function buildZip(sources: Source[], comment = ''): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;
  const u16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];
  const u32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
  for (const source of sources) {
    const name = new TextEncoder().encode(source.name);
    const data = source.stored ? source.content : await deflateRaw(source.content);
    const method = source.stored ? 0 : 8;
    const crc = crc32(source.content);
    const extra = new Uint8Array(source.localExtra ?? 0);
    const local = Uint8Array.from([
      ...u32(0x04034b50),
      ...u16(20),
      ...u16(0),
      ...u16(method),
      ...u16(0),
      ...u16(0),
      ...u32(crc),
      ...u32(data.length),
      ...u32(source.content.length),
      ...u16(name.length),
      ...u16(extra.length),
      ...name,
      ...extra,
    ]);
    parts.push(local, data);
    directory.push(
      Uint8Array.from([
        ...u32(0x02014b50),
        ...u16(20),
        ...u16(20),
        ...u16(0),
        ...u16(method),
        ...u16(0),
        ...u16(0),
        ...u32(crc),
        ...u32(data.length),
        ...u32(source.content.length),
        ...u16(name.length),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u32(0),
        ...u32(offset),
        ...name,
      ]),
    );
    offset += local.length + data.length;
  }
  const directorySize = directory.reduce((n, d) => n + d.length, 0);
  const tail = new TextEncoder().encode(comment);
  const end = Uint8Array.from([
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(sources.length),
    ...u16(sources.length),
    ...u32(directorySize),
    ...u32(offset),
    ...u16(tail.length),
    ...tail,
  ]);
  const all = [...parts, ...directory, end];
  const zip = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of all) {
    zip.set(part, at);
    at += part.length;
  }
  return zip;
}

const text = (s: string) => new TextEncoder().encode(s);

/** A reader over bytes that records its requests. */
function reader(zip: Uint8Array) {
  const requests: [number, number][] = [];
  const read: RangeReader = async (start, end) => {
    requests.push([start, end]);
    return zip.slice(start, end + 1);
  };
  return { read, requests };
}

describe('crc32', () => {
  it('gives the standard check values', () => {
    expect(crc32(text('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe('openRemoteZip', () => {
  const sources: Source[] = [
    { name: 'assets/minecraft/blockstates/stone.json', content: text('{"variants":{}}') },
    {
      name: 'assets/minecraft/textures/block/stone.png',
      content: text('stored-data '.repeat(100)),
      stored: true,
    },
    { name: 'other/readme.txt', content: text('hello') },
  ];

  it('lists names by prefix', async () => {
    const zip = await buildZip(sources);
    const archive = await openRemoteZip(zip.length, reader(zip).read);
    expect(archive.list('assets/minecraft/')).toEqual([sources[0]!.name, sources[1]!.name]);
    expect(archive.list('nothing/')).toEqual([]);
  });

  it('reads deflated and stored files and reports progress', async () => {
    const zip = await buildZip(sources);
    const archive = await openRemoteZip(zip.length, reader(zip).read);
    const progress = vi.fn();
    const files = await archive.read([sources[1]!.name, sources[0]!.name], progress);
    expect(files.get(sources[0]!.name)).toEqual(sources[0]!.content);
    expect(files.get(sources[1]!.name)).toEqual(sources[1]!.content);
    expect(progress.mock.calls).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it('fetches only the central directory and the requested file', async () => {
    const big = {
      name: 'big.bin',
      content: new Uint8Array(500_000).map((_, i) => (i * 7919) % 251),
      stored: true,
    };
    const zip = await buildZip([big, ...sources]);
    const { read, requests } = reader(zip);
    const archive = await openRemoteZip(zip.length, read);
    const before = requests.length;
    await archive.read(['other/readme.txt']);
    const fetched = requests.slice(before).reduce((n, [a, b]) => n + (b - a + 1), 0);
    expect(fetched).toBeLessThan(1000);
  });

  it('merges files that are close together into one request', async () => {
    const zip = await buildZip(sources);
    const { read, requests } = reader(zip);
    const archive = await openRemoteZip(zip.length, read);
    const before = requests.length;
    await archive.read(sources.map((s) => s.name));
    expect(requests.length - before).toBe(1);
  });

  it('reads a file whose local header has a longer extra field than the directory', async () => {
    const zip = await buildZip([
      { name: 'a.txt', content: text('x'.repeat(200)), localExtra: 40 },
      ...sources,
    ]);
    const archive = await openRemoteZip(zip.length, reader(zip).read);
    const files = await archive.read(['a.txt']);
    expect(files.get('a.txt')).toEqual(text('x'.repeat(200)));
  });

  it('finds the end record after a comment', async () => {
    const zip = await buildZip(sources, 'a comment');
    const archive = await openRemoteZip(zip.length, reader(zip).read);
    expect(archive.list('')).toHaveLength(3);
  });

  it('throws when a byte of the content is changed', async () => {
    const zip = await buildZip(sources);
    const marker = text('stored-data '.repeat(5));
    let at = 0;
    while (!marker.every((byte, i) => zip[at + i] === byte)) at++;
    const damaged = zip.slice();
    damaged[at] = (damaged[at]! + 1) & 0xff;
    const archive = await openRemoteZip(damaged.length, reader(damaged).read);
    await expect(archive.read([sources[1]!.name])).rejects.toThrow('CRC-32');
  });

  it('throws on a name that is not in the zip', async () => {
    const zip = await buildZip(sources);
    const archive = await openRemoteZip(zip.length, reader(zip).read);
    await expect(archive.read(['missing.txt'])).rejects.toThrow('not in the zip');
  });

  it('throws when the data is not a zip', async () => {
    const data = text('this is not a zip file at all, only text');
    await expect(openRemoteZip(data.length, reader(data).read)).rejects.toThrow('Not a zip file');
  });

  it('throws on Zip64 markers', async () => {
    const zip = await buildZip(sources);
    const damaged = zip.slice();
    const view = new DataView(damaged.buffer);
    view.setUint32(damaged.length - 22 + 16, 0xffffffff, true);
    await expect(openRemoteZip(damaged.length, reader(damaged).read)).rejects.toThrow('Zip64');
  });

  it('throws on a compression method it does not know', async () => {
    const zip = await buildZip(sources);
    const damaged = zip.slice();
    const dv = new DataView(damaged.buffer);
    // The directory starts after all local entries; the method is at +10 of the first entry.
    const directoryStart = dv.getUint32(damaged.length - 22 + 16, true);
    dv.setUint16(directoryStart + 10, 12, true);
    const other = await openRemoteZip(damaged.length, reader(damaged).read);
    await expect(other.read([sources[0]!.name])).rejects.toThrow('method 12');
  });
});

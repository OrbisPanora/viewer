/**
 * A bounded cache of loaded chunks that forgets the least recently used ones first.
 */

/** Map with a size limit and least-recently-used eviction. */
export class ChunkCache<T> {
  private readonly entries = new Map<string, T>();

  /**
   * Creates the cache.
   *
   * @param maxEntries - Size above which {@link evict} starts removing entries.
   * @param onEvict - Called with each entry removed by {@link evict}, to release its resources.
   */
  constructor(
    private readonly maxEntries: number,
    private readonly onEvict?: (key: string, value: T) => void,
  ) {}

  /**
   * Number of entries held.
   *
   * @returns The count.
   */
  get size(): number {
    return this.entries.size;
  }

  /**
   * Reads an entry and marks it as recently used.
   *
   * @param key - The chunk key.
   * @returns The value, or `undefined`.
   */
  get(key: string): T | undefined {
    const value = this.entries.get(key);
    if (value !== undefined) {
      // A Map iterates in insertion order, so re-inserting moves the key to the "newest" end.
      this.entries.delete(key);
      this.entries.set(key, value);
    }
    return value;
  }

  /**
   * Reads an entry without changing its recency.
   *
   * @param key - The chunk key.
   * @returns The value, or `undefined`.
   */
  peek(key: string): T | undefined {
    return this.entries.get(key);
  }

  /**
   * Tells whether a key is present.
   *
   * @param key - The chunk key.
   * @returns `true` if cached.
   */
  has(key: string): boolean {
    return this.entries.has(key);
  }

  /**
   * Stores an entry as the most recently used.
   *
   * @param key - The chunk key.
   * @param value - The value.
   */
  set(key: string, value: T): void {
    this.entries.delete(key);
    this.entries.set(key, value);
  }

  /**
   * Removes entries, oldest first, until the cache is within its limit.
   *
   * @param protectedKeys - Keys that must stay, for example chunks on screen.
   * @returns The keys removed.
   */
  evict(protectedKeys: ReadonlySet<string>): string[] {
    const removed: string[] = [];
    for (const [key, value] of this.entries) {
      if (this.entries.size <= this.maxEntries) break;
      if (protectedKeys.has(key)) continue;
      this.entries.delete(key);
      this.onEvict?.(key, value);
      removed.push(key);
    }
    return removed;
  }

  /**
   * Removes everything, calling the eviction callback for each entry.
   */
  clear(): void {
    for (const [key, value] of this.entries) this.onEvict?.(key, value);
    this.entries.clear();
  }
}

import { describe, expect, it, vi } from 'vitest';
import { ChunkCache } from './chunkCache';

describe('ChunkCache', () => {
  it('evicts the least recently used entry beyond the limit', () => {
    const onEvict = vi.fn();
    const cache = new ChunkCache<number>(2, onEvict);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a');
    cache.set('c', 3);
    expect(cache.evict(new Set())).toEqual(['b']);
    expect(onEvict).toHaveBeenCalledWith('b', 2);
    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
  });

  it('keeps protected entries even when over the limit', () => {
    const cache = new ChunkCache<number>(1);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.evict(new Set(['a', 'b']))).toEqual(['c']);
    expect(cache.size).toBe(2);
  });

  it('does nothing within the limit', () => {
    const cache = new ChunkCache<number>(5);
    cache.set('a', 1);
    expect(cache.evict(new Set())).toEqual([]);
  });

  it('peek does not refresh recency', () => {
    const cache = new ChunkCache<number>(1);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.peek('a');
    expect(cache.evict(new Set())).toEqual(['a']);
  });

  it('calls the eviction callback for every entry on clear', () => {
    const onEvict = vi.fn();
    const cache = new ChunkCache<number>(5, onEvict);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(onEvict).toHaveBeenCalledTimes(2);
    expect(cache.size).toBe(0);
  });
});

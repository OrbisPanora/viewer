import { describe, expect, it } from 'vitest';
import { percentile, RollingWindow } from './metrics';

describe('percentile', () => {
  it('is 0 for no values', () => {
    expect(percentile([], 0.5)).toBe(0);
  });

  it('takes the nearest rank of unsorted values', () => {
    const values = [9, 1, 5, 3, 7];
    expect(percentile(values, 0.5)).toBe(5);
    expect(percentile(values, 0.95)).toBe(9);
    expect(percentile(values, 0)).toBe(1);
    expect(values).toEqual([9, 1, 5, 3, 7]);
  });
});

describe('RollingWindow', () => {
  it('keeps only the most recent values', () => {
    const window = new RollingWindow(3);
    for (const value of [100, 1, 2, 3]) window.push(value);
    expect(window.count).toBe(3);
    expect(window.percentile(0.95)).toBe(3);
  });

  it('reports 0 while empty', () => {
    expect(new RollingWindow(5).percentile(0.5)).toBe(0);
  });
});

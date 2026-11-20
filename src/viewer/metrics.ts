/**
 * Small helpers to measure the viewer: a window over the most recent values of a quantity,
 * with the percentiles the debug overlay and the benchmark report.
 */

/**
 * Nearest-rank percentile of a list of values.
 *
 * @param values - Measurements, in any order.
 * @param fraction - 0.5 for the median, 0.95 for the 95th percentile.
 * @returns The percentile, or 0 for an empty list.
 */
export function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.floor(fraction * ordered.length))] ?? 0;
}

/** The last `capacity` values pushed, oldest dropped first. */
export class RollingWindow {
  private readonly values: number[] = [];
  private next = 0;

  /**
   * Creates an empty window.
   *
   * @param capacity - Number of values kept.
   */
  constructor(private readonly capacity: number) {}

  /**
   * Adds a value, replacing the oldest one when the window is full.
   *
   * @param value - The measurement.
   */
  push(value: number): void {
    if (this.values.length < this.capacity) {
      this.values.push(value);
    } else {
      this.values[this.next] = value;
      this.next = (this.next + 1) % this.capacity;
    }
  }

  /**
   * Number of values held.
   *
   * @returns The count, at most the capacity.
   */
  get count(): number {
    return this.values.length;
  }

  /**
   * Percentile of the values held.
   *
   * @param fraction - 0.5 for the median, 0.95 for the 95th percentile.
   * @returns The percentile, or 0 when empty.
   */
  percentile(fraction: number): number {
    return percentile(this.values, fraction);
  }
}

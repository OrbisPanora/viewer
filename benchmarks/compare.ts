/**
 * Prints two result files side by side.
 *
 *   node benchmarks/compare.ts benchmarks/results/before.json benchmarks/results/after.json
 *
 * Every number found in both files is listed with the ratio after / before. The labels of
 * both files (machine, commit, world) are printed first, so that a difference caused by
 * another machine or another world is visible.
 */
import { readFileSync } from 'node:fs';

const LABELS = new Set(['machine', 'world', 'script', 'timestamp']);

/**
 * Lists every number of a result file with its dotted path. Labels are skipped.
 *
 * @param node - A parsed JSON value.
 * @param prefix - Path of `node`.
 * @param into - Receives the numbers.
 * @returns `into`.
 */
function numbers(
  node: unknown,
  prefix = '',
  into = new Map<string, number>(),
): Map<string, number> {
  if (typeof node === 'number') {
    into.set(prefix.replace(/\.$/, ''), node);
  } else if (Array.isArray(node)) {
    // Time series are not compared one sample at a time.
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (!LABELS.has(key)) numbers(value, `${prefix}${key}.`, into);
    }
  }
  return into;
}

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) {
  console.log('Usage: node benchmarks/compare.ts BEFORE.json AFTER.json');
  process.exit(2);
}
const before = JSON.parse(readFileSync(beforePath, 'utf8')) as Record<string, unknown>;
const after = JSON.parse(readFileSync(afterPath, 'utf8')) as Record<string, unknown>;
console.log('before:', JSON.stringify(before.machine), JSON.stringify(before.world));
console.log('after: ', JSON.stringify(after.machine), JSON.stringify(after.world));

const old = numbers(before);
console.log(
  `\n${'metric'.padEnd(64)}${'before'.padStart(12)}${'after'.padStart(12)}${'ratio'.padStart(8)}`,
);
for (const [key, value] of numbers(after)) {
  const previous = old.get(key);
  if (previous === undefined) continue;
  const ratio = previous ? (value / previous).toFixed(2) : '-';
  console.log(
    `${key.padEnd(64)}${previous.toFixed(3).padStart(12)}${value.toFixed(3).padStart(12)}${ratio.padStart(8)}`,
  );
}

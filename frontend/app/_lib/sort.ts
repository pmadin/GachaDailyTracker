import type { SortDir } from '../_components/SortIcon';

export type { SortDir };

/**
 * Ascending comparator for a single column value. Booleans sort false-before-true
 * (matches the original admin/games "is_active" sort), nullish values sort last,
 * numbers compare numerically, everything else compares as a locale-aware string.
 */
export function compareValues(
  a: string | number | boolean | null | undefined,
  b: string | number | boolean | null | undefined,
): number {
  const na = typeof a === 'boolean' ? Number(a) : a;
  const nb = typeof b === 'boolean' ? Number(b) : b;
  if (na == null && nb == null) return 0;
  if (na == null) return 1;
  if (nb == null) return -1;
  if (typeof na === 'number' && typeof nb === 'number') return na - nb;
  return String(na).localeCompare(String(nb));
}

/** Sorts a copy of `rows` by `getValue(row)`, applying `dir`. Does not mutate `rows`. */
export function sortRows<T>(
  rows: T[],
  getValue: (row: T) => string | number | boolean | null | undefined,
  dir: SortDir,
): T[] {
  const sorted = [...rows].sort((a, b) => compareValues(getValue(a), getValue(b)));
  return dir === 'asc' ? sorted : sorted.reverse();
}

import type { StatusEntry } from '../../lib/git'

/**
 * Pure helpers for the sidebar's instant file filter and its keyboard
 * advance-on-validate, kept framework-agnostic and unit-tested.
 */

/** Trims and lower-cases a filter query for case-insensitive substring matching. */
export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase()
}

/**
 * Whether `path` matches an already-{@link normalizeQuery}d query. An empty
 * query matches everything.
 */
export function matchesQuery(path: string, normalized: string): boolean {
  return normalized === '' || path.toLowerCase().includes(normalized)
}

/**
 * The entries whose repository-relative path matches `query` (case-insensitive
 * substring over the whole path). Returns the **same array reference** when the
 * query is empty, so callers can memoize and skip needless re-renders.
 */
export function filterEntries(
  entries: readonly StatusEntry[],
  query: string,
): readonly StatusEntry[] {
  const normalized = normalizeQuery(query)
  if (normalized === '') {
    return entries
  }
  return entries.filter((entry) => matchesQuery(entry.path, normalized))
}

/**
 * Given a list of `length` rows and the `index` of the one about to be removed
 * (validated/un-validated), the index — *into the current list* — of the row to
 * focus next: the following sibling if there is one, else the previous, else
 * `-1` when the list will be empty. Read the neighbour's identity before acting,
 * since the act reorders the list.
 */
export function neighborIndex(length: number, index: number): number {
  if (index < 0 || index >= length) {
    return -1
  }
  if (index + 1 < length) {
    return index + 1
  }
  return index - 1
}

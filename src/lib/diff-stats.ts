import type { DiffFile } from './git'

/** Added / removed line counts for one changed file. */
export interface LineDelta {
  /** Lines added (new side). */
  readonly add: number
  /** Lines removed (old side). */
  readonly del: number
}

/**
 * Counts the added and removed lines across a file's diff hunks — the single
 * source of the `+N −N` magnitude. The diff store sums each loaded section's
 * files with it to feed the sidebar counts, and the diff panel header sums the
 * open file the same way; both read straight from the diffs already in hand, so
 * no separate backend pass computes the counts.
 */
export function countDiffLines(file: DiffFile): LineDelta {
  let add = 0
  let del = 0
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.kind === 'add') {
        add++
      } else if (line.kind === 'delete') {
        del++
      }
    }
  }
  return { add, del }
}

import type { DiffFile } from './git'

/** Added / removed line counts for one changed file. */
export interface FileStat {
  /** Lines added (new side). */
  readonly add: number
  /** Lines removed (old side). */
  readonly del: number
}

/** Counts the added and removed lines across a file's diff hunks. */
export function countDiffLines(file: DiffFile): FileStat {
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

/**
 * Indexes a section's diffs by path into per-file {@link FileStat}s — the source
 * for the sidebar's `+N −N` change magnitude. Binary/mode-only files (no hunks)
 * map to `{ add: 0, del: 0 }`.
 */
export function indexDiffStats(files: readonly DiffFile[]): Record<string, FileStat> {
  const stats: Record<string, FileStat> = {}
  for (const file of files) {
    stats[file.path] = countDiffLines(file)
  }
  return stats
}

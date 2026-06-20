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

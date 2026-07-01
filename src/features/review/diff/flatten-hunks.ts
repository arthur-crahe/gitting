import type { DiffFile, DiffLine } from '../../../lib/git'

/** A hunk header row (`@@ … @@`) separating blocks of lines in the diff view. */
export interface HunkHeaderRow {
  readonly type: 'header'
  readonly key: string
  readonly text: string
  /** Index of this hunk within the file's `hunks` — the handle a per-hunk stage
   * action uses to resolve the hunk (its tuple + fingerprint) to (un)stage. */
  readonly hunkIndex: number
}

/** A single content row of the diff view, wrapping one {@link DiffLine}. */
export interface LineRow {
  readonly type: 'line'
  readonly key: string
  readonly line: DiffLine
  /** Index of the owning hunk within the file's `hunks`. */
  readonly hunkIndex: number
  /** Index of this line within its hunk's `lines` — the handle a line-level
   * selection uses to (un)stage individual lines. */
  readonly lineIndex: number
}

/** A flattened, render-ready row of the diff view. */
export type DiffRow = HunkHeaderRow | LineRow

/** The unified-diff header string for a hunk. */
function headerText(hunk: DiffFile['hunks'][number]): string {
  return `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`
}

/**
 * Flattens a file's hunks into a single ordered list of rows (a header before
 * each hunk, then its lines), the form the diff view renders and virtualizes.
 *
 * Pure and order-preserving: the line rows are exactly the file's hunk lines,
 * in order — the seam where the ADR fidelity invariant (what is shown equals
 * the gix hunks) is unit-tested, independently of any DOM rendering.
 */
export function flattenHunks(file: DiffFile): DiffRow[] {
  const rows: DiffRow[] = []
  file.hunks.forEach((hunk, h) => {
    rows.push({ type: 'header', key: `h${h}`, text: headerText(hunk), hunkIndex: h })
    hunk.lines.forEach((line, l) => {
      rows.push({ type: 'line', key: `h${h}l${l}`, line, hunkIndex: h, lineIndex: l })
    })
  })
  return rows
}

import type { DiffLineKind, Hunk } from './git'

/** FNV-1a (64-bit) offset basis. */
const FNV_OFFSET = 0xcbf29ce484222325n
/** FNV-1a (64-bit) prime. */
const FNV_PRIME = 0x100000001b3n
/** 64-bit wraparound mask (BigInt has no fixed width). */
const MASK = 0xffffffffffffffffn

/** Reused across calls — encoding is stateless. */
const ENCODER = new TextEncoder()

/** The unified-diff sign character for a line kind, matching the Rust side. */
function sign(kind: DiffLineKind): string {
  if (kind === 'context') {
    return ' '
  }
  return kind === 'add' ? '+' : '-'
}

/**
 * Content hash of a hunk, **byte-for-byte identical** to the Rust
 * `hunk_fingerprint` (`src-tauri/src/git/hunk_patch.rs`): FNV-1a (64-bit) over
 * each line's canonical `"{sign}{content}\n"` (sign ∈ `{' ', '+', '-'}`), as
 * zero-padded 16-hex.
 *
 * It is the WYSIWYG staleness guard carried in a `HunkSelection`: computed here
 * from the rendered hunk just before a stage/unstage click, and recomputed on the
 * backend from a fresh re-diff. A re-edit between render and click — even one that
 * preserves the `@@` header tuple — changes the hash, so the backend rejects the
 * selection instead of silently staging content the user never saw. A shared
 * reference value is pinned in both test suites so the two implementations cannot
 * drift.
 */
export function hunkFingerprint(hunk: Hunk): string {
  let hash = FNV_OFFSET
  for (const line of hunk.lines) {
    const bytes = ENCODER.encode(`${sign(line.kind)}${line.content}\n`)
    for (const byte of bytes) {
      hash = ((hash ^ BigInt(byte)) * FNV_PRIME) & MASK
    }
  }
  return hash.toString(16).padStart(16, '0')
}

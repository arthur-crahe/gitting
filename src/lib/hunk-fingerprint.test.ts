import { describe, expect, it } from 'vitest'
import type { Hunk } from './git'
import { hunkFingerprint } from './hunk-fingerprint'

/** A one-line-changed hunk (`old` → `new`) inside a three-line file, mirroring
 * the Rust `one_change_hunk` fixture so the pinned hash is comparable. */
function oneChange(oldMid: string, newMid: string): Hunk {
  return {
    oldStart: 1,
    oldLines: 3,
    newStart: 1,
    newLines: 3,
    lines: [
      { kind: 'context', oldNo: 1, newNo: 1, content: 'a' },
      { kind: 'delete', oldNo: 2, newNo: null, content: oldMid },
      { kind: 'add', oldNo: null, newNo: 2, content: newMid },
      { kind: 'context', oldNo: 3, newNo: 3, content: 'c' },
    ],
  }
}

describe('hunkFingerprint', () => {
  it('matches the cross-language reference hash pinned on the Rust side', () => {
    // Canonical serialization " a\n-b\n+B\n c\n"; the SAME hex is asserted in
    // `src-tauri/src/git/hunk_patch.rs::fingerprint_matches_the_cross_language_reference`.
    expect(hunkFingerprint(oneChange('b', 'B'))).toBe('485c57cbfeae1b69')
  })

  it('is stable and content-sensitive (a same-tuple re-edit changes the hash)', () => {
    expect(hunkFingerprint(oneChange('b', 'B'))).toBe(hunkFingerprint(oneChange('b', 'B')))
    expect(hunkFingerprint(oneChange('b', 'B'))).not.toBe(hunkFingerprint(oneChange('b', 'Bx')))
  })

  it('is always sixteen hex digits, zero-padded', () => {
    expect(hunkFingerprint(oneChange('b', 'B'))).toMatch(/^[0-9a-f]{16}$/)
  })
})

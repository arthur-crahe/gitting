import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DiffFile } from '../../../lib/git'
import { DiffView } from './diff-view'

const FILE: DiffFile = {
  path: 'a.txt',
  changeKind: 'modified',
  oldMode: '100644',
  newMode: '100644',
  isBinary: false,
  hunks: [
    {
      oldStart: 1,
      oldLines: 2,
      newStart: 1,
      newLines: 2,
      lines: [
        { kind: 'context', oldNo: 1, newNo: 1, content: 'a' },
        { kind: 'delete', oldNo: 2, newNo: null, content: 'b' },
        { kind: 'add', oldNo: null, newNo: 2, content: 'B' },
      ],
    },
  ],
}

describe('DiffView', () => {
  it('renders exactly the file’s hunk lines, in order (DOM fidelity)', () => {
    const { container } = render(<DiffView file={FILE} />)
    const rendered = [...container.querySelectorAll('.diff-line__content')].map(
      (el) => el.textContent,
    )
    expect(rendered).toEqual(FILE.hunks.flatMap((h) => h.lines).map((l) => l.content))
  })

  it('shows the hunk header', () => {
    const { container } = render(<DiffView file={FILE} />)
    expect(container.querySelector('.diff-hunk-head')?.textContent).toBe('@@ -1,2 +1,2 @@')
  })

  it('shows a notice instead of lines for a binary file', () => {
    const { container } = render(<DiffView file={{ ...FILE, isBinary: true, hunks: [] }} />)
    expect(container.querySelectorAll('.diff-line').length).toBe(0)
    expect(container.textContent).toMatch(/binaire/i)
  })

  it('shows a notice for a hunkless conflict', () => {
    const { container } = render(<DiffView file={{ ...FILE, changeKind: 'conflict', hunks: [] }} />)
    expect(container.textContent).toMatch(/conflit/i)
  })
})

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

// The line-by-line fidelity invariant is covered by flatten-hunks.test.ts; here
// we only assert the component's branching, since the virtualized rows do not
// mount under jsdom (no layout engine).
describe('DiffView', () => {
  it('renders the virtualized scroller for a file with hunks', () => {
    const { container } = render(<DiffView file={FILE} />)
    expect(container.querySelector('.diff-scroll')).not.toBeNull()
    expect(container.querySelector('.diff-notice')).toBeNull()
  })

  it('shows a notice instead of a scroller for a binary file', () => {
    const { container } = render(<DiffView file={{ ...FILE, isBinary: true, hunks: [] }} />)
    expect(container.querySelector('.diff-scroll')).toBeNull()
    expect(container.textContent).toMatch(/binaire/i)
  })

  it('shows a notice for a hunkless conflict', () => {
    const { container } = render(<DiffView file={{ ...FILE, changeKind: 'conflict', hunks: [] }} />)
    expect(container.textContent).toMatch(/conflit/i)
  })

  it('shows a notice for a mode-only change', () => {
    const { container } = render(
      <DiffView file={{ ...FILE, oldMode: '100644', newMode: '100755', hunks: [] }} />,
    )
    expect(container.textContent).toMatch(/mode/i)
  })
})

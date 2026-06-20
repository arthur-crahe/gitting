import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { StatusEntry } from '../../lib/git'
import { FileRow } from './file-row'
import { type RowActions, RowProvider } from './row-context'

function renderRow(entry: StatusEntry, actions: Partial<RowActions> = {}) {
  const full: RowActions = { select: vi.fn(), act: vi.fn(), ...actions }
  render(
    <Theme>
      <RowProvider value={full}>
        <FileRow section="unstaged" entry={entry} />
      </RowProvider>
    </Theme>,
  )
  return full
}

describe('FileRow', () => {
  it('splits the path into a muted directory and a prominent file name', () => {
    renderRow({ path: 'src/features/review.tsx', kind: 'modified' })
    expect(screen.getByText('review.tsx')).toHaveClass('file-row__name')
    // The directory carries a leading LRM (bidi guard), so match by substring.
    expect(screen.getByText(/src\/features/)).toHaveClass('file-row__dir')
    expect(screen.getByText('/')).toHaveClass('file-row__sep')
  })

  it('shows no directory or separator for a root-level file', () => {
    renderRow({ path: 'README.md', kind: 'untracked' })
    expect(screen.getByText('README.md')).toBeInTheDocument()
    expect(screen.queryByText('/')).not.toBeInTheDocument()
  })

  it('exposes the row identity for the keyboard model and opens on click', () => {
    const select = vi.fn()
    renderRow({ path: 'src/a.ts', kind: 'added' }, { select })
    const target = document.querySelector('[data-file-row]')
    expect(target).toHaveAttribute('data-section', 'unstaged')
    expect(target).toHaveAttribute('data-path', 'src/a.ts')
    expect(target).toHaveAttribute('tabindex', '-1')
    fireEvent.click(target as Element)
    expect(select).toHaveBeenCalledWith('unstaged', 'src/a.ts')
  })
})

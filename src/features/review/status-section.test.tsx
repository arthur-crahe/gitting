import { Theme } from '@radix-ui/themes'
import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { StatusEntry } from '../../lib/git'
import { type RowActions, RowProvider } from './row-context'
import { StatusSection } from './status-section'

const ENTRIES: StatusEntry[] = [
  { path: 'src/app.tsx', kind: 'modified' },
  { path: 'src/features/review.tsx', kind: 'added' },
  { path: 'README.md', kind: 'untracked' },
]

function renderSection(props: Partial<Parameters<typeof StatusSection>[0]> = {}) {
  const actions: RowActions = { select: vi.fn(), act: vi.fn() }
  render(
    <Theme>
      <RowProvider value={actions}>
        <StatusSection
          title="À reviewer"
          section="unstaged"
          entries={ENTRIES}
          query=""
          mode="list"
          open
          onToggle={() => {}}
          scrollRef={createRef<HTMLElement>()}
          empty={<span>Aucune modification locale.</span>}
          {...props}
        />
      </RowProvider>
    </Theme>,
  )
}

describe('StatusSection', () => {
  it('renders every file and the total count when unfiltered', () => {
    renderSection()
    expect(screen.getByText('app.tsx')).toBeInTheDocument()
    expect(screen.getByText('review.tsx')).toBeInTheDocument()
    expect(screen.getByText('README.md')).toBeInTheDocument()
    expect(screen.getByText('3')).toHaveClass('review-section__count--queue')
  })

  it('filters by path and reports matched / total', () => {
    renderSection({ query: 'review' })
    expect(screen.getByText('review.tsx')).toBeInTheDocument()
    expect(screen.queryByText('app.tsx')).not.toBeInTheDocument()
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
  })

  it('shows the no-match line when a filter excludes everything', () => {
    renderSection({ query: 'zzz' })
    expect(screen.getByText('Aucun fichier ne correspond.')).toBeInTheDocument()
    expect(screen.getByText('0 / 3')).toBeInTheDocument()
  })

  it('shows the empty body (not the no-match line) when the section is truly empty', () => {
    renderSection({ entries: [], query: 'anything' })
    expect(screen.getByText('Aucune modification locale.')).toBeInTheDocument()
    expect(screen.queryByText('Aucun fichier ne correspond.')).not.toBeInTheDocument()
  })

  it('marks the queue count badge empty when there is nothing to review', () => {
    renderSection({ entries: [] })
    expect(screen.getByText('0')).toHaveAttribute('data-empty', 'true')
  })
})

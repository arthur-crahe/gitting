import { fireEvent, render, screen, within } from '@testing-library/react'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { DiffSection } from '../../stores/use-diff-store'
import type { RowActions } from './row-context'
import { useSidebarKeyboard } from './use-sidebar-keyboard'

/** A minimal sidebar shape: a filter input plus three file rows (2 unstaged, 1 staged). */
function Harness({
  actions,
  clearFilter = () => false,
}: {
  actions: RowActions
  clearFilter?: () => boolean
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLInputElement>(null)
  const { onKeyDown } = useSidebarKeyboard({ rootRef, filterRef, actions, clearFilter })
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: test harness mirroring the sidebar's delegated key handler.
    <div ref={rootRef} onKeyDown={onKeyDown}>
      <div className="review-split__list-head">
        <input ref={filterRef} aria-label="filter" />
      </div>
      <button type="button" data-file-row data-section="unstaged" data-path="a.ts" tabIndex={-1}>
        a
      </button>
      <button type="button" data-file-row data-section="unstaged" data-path="b.ts" tabIndex={-1}>
        b
      </button>
      <button type="button" data-file-row data-section="staged" data-path="c.ts" tabIndex={-1}>
        c
      </button>
    </div>
  )
}

function makeActions(): RowActions {
  return { select: vi.fn(), act: vi.fn(async () => true) }
}

/**
 * A stateful harness mirroring the real sidebar: `act` removes the row (as a
 * stage/unstage moves it out of the section) and `restoreFocus` runs in a layout
 * effect on the resulting re-render — so it exercises the post-mutation focus
 * recovery, not just the synchronous key handling.
 */
function MutableHarness({ initial }: { initial: { section: DiffSection; path: string }[] }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState(initial)
  const actions = useMemo<RowActions>(
    () => ({
      select: () => {},
      act: (_section, path) => {
        setRows((current) => current.filter((row) => row.path !== path))
        return Promise.resolve(true)
      },
    }),
    [],
  )
  const { onKeyDown, restoreFocus } = useSidebarKeyboard({
    rootRef,
    filterRef,
    actions,
    clearFilter: () => false,
  })
  // biome-ignore lint/correctness/useExhaustiveDependencies: mirror the sidebar — re-home focus on every row change.
  useLayoutEffect(() => {
    restoreFocus()
  }, [rows, restoreFocus])
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: test harness mirroring the sidebar's delegated key handler.
    <div ref={rootRef} onKeyDown={onKeyDown}>
      <div className="review-split__list-head">
        <input ref={filterRef} aria-label="filter" />
      </div>
      {rows.map((row) => (
        <button
          key={row.path}
          type="button"
          data-file-row
          data-section={row.section}
          data-path={row.path}
          tabIndex={-1}
        >
          {row.path}
        </button>
      ))}
    </div>
  )
}

describe('useSidebarKeyboard', () => {
  it('steps from the filter into the first row on ArrowDown', () => {
    const actions = makeActions()
    render(<Harness actions={actions} />)
    fireEvent.keyDown(screen.getByLabelText('filter'), { key: 'ArrowDown' })
    expect(actions.select).toHaveBeenCalledWith('unstaged', 'a.ts')
  })

  it('clears the filter on Esc before falling into the list', () => {
    const actions = makeActions()
    const clearFilter = vi.fn(() => true)
    render(<Harness actions={actions} clearFilter={clearFilter} />)
    fireEvent.keyDown(screen.getByLabelText('filter'), { key: 'Escape' })
    expect(clearFilter).toHaveBeenCalled()
    expect(actions.select).not.toHaveBeenCalled()
  })

  it('moves the selection down and up, clamped at the ends', () => {
    const actions = makeActions()
    render(<Harness actions={actions} />)
    fireEvent.keyDown(screen.getByText('a'), { key: 'ArrowDown' })
    expect(actions.select).toHaveBeenLastCalledWith('unstaged', 'b.ts')
    fireEvent.keyDown(screen.getByText('b'), { key: 'ArrowUp' })
    expect(actions.select).toHaveBeenLastCalledWith('unstaged', 'a.ts')
    // ArrowUp from the first row stays put.
    fireEvent.keyDown(screen.getByText('a'), { key: 'ArrowUp' })
    expect(actions.select).toHaveBeenLastCalledWith('unstaged', 'a.ts')
  })

  it('throttles a held arrow: opens on the leading edge, then the landed file', () => {
    vi.useFakeTimers()
    try {
      const actions = makeActions()
      render(<Harness actions={actions} />)
      const a = screen.getByText('a')
      a.focus()
      // Auto-repeat opens immediately on the leading edge — the diff is never
      // frozen while the key is held — and the cursor advances on every repeat.
      fireEvent.keyDown(a, { key: 'ArrowDown', repeat: true })
      expect(actions.select).toHaveBeenCalledTimes(1)
      expect(actions.select).toHaveBeenLastCalledWith('unstaged', 'b.ts')
      // A further repeat inside the window is throttled (no extra open yet)…
      fireEvent.keyDown(screen.getByText('b'), { key: 'ArrowDown', repeat: true })
      expect(actions.select).toHaveBeenCalledTimes(1)
      expect(document.activeElement).toBe(screen.getByText('c'))
      // …until the cadence boundary, when the diff catches up to the landed row.
      vi.advanceTimersByTime(100)
      expect(actions.select).toHaveBeenCalledTimes(2)
      expect(actions.select).toHaveBeenLastCalledWith('staged', 'c.ts')
    } finally {
      vi.useRealTimers()
    }
  })

  it('opens immediately on a single (non-repeat) arrow press', () => {
    const actions = makeActions()
    render(<Harness actions={actions} />)
    fireEvent.keyDown(screen.getByText('a'), { key: 'ArrowDown' })
    expect(actions.select).toHaveBeenCalledWith('unstaged', 'b.ts')
  })

  it('jumps to the first and last row on Home / End', () => {
    const actions = makeActions()
    render(<Harness actions={actions} />)
    fireEvent.keyDown(screen.getByText('b'), { key: 'End' })
    expect(actions.select).toHaveBeenLastCalledWith('staged', 'c.ts')
    fireEvent.keyDown(screen.getByText('c'), { key: 'Home' })
    expect(actions.select).toHaveBeenLastCalledWith('unstaged', 'a.ts')
  })

  it('validates the focused row and pre-selects the next sibling on Enter', () => {
    const actions = makeActions()
    render(<Harness actions={actions} />)
    fireEvent.keyDown(screen.getByText('a'), { key: 'Enter' })
    expect(actions.select).toHaveBeenCalledWith('unstaged', 'b.ts')
    expect(actions.act).toHaveBeenCalledWith('unstaged', 'a.ts')
  })

  it('un-validates a staged row on Backspace but never an unstaged one', () => {
    const actions = makeActions()
    const { container } = render(<Harness actions={actions} />)
    fireEvent.keyDown(within(container).getByText('c'), { key: 'Backspace' })
    expect(actions.act).toHaveBeenCalledWith('staged', 'c.ts')
    expect(actions.act).toHaveBeenCalledTimes(1)

    // An unstaged row is already pending review: Backspace is a no-op there.
    fireEvent.keyDown(within(container).getByText('a'), { key: 'Backspace' })
    expect(actions.act).toHaveBeenCalledTimes(1)
  })

  it('focuses the filter on "/"', () => {
    const actions = makeActions()
    render(<Harness actions={actions} />)
    const filter = screen.getByLabelText('filter')
    fireEvent.keyDown(screen.getByText('a'), { key: '/' })
    expect(document.activeElement).toBe(filter)
  })

  it('returns focus to the filter on Escape from a row (never blurs to body)', () => {
    const actions = makeActions()
    render(<Harness actions={actions} />)
    fireEvent.keyDown(screen.getByText('a'), { key: 'Escape' })
    expect(document.activeElement).toBe(screen.getByLabelText('filter'))
  })

  it('lands focus on the next row after validating a row with a sibling', () => {
    render(
      <MutableHarness
        initial={[
          { section: 'unstaged', path: 'a.ts' },
          { section: 'unstaged', path: 'b.ts' },
        ]}
      />,
    )
    fireEvent.keyDown(screen.getByText('a.ts'), { key: 'Enter' })
    expect(document.activeElement).toBe(screen.getByText('b.ts'))
  })

  it('keeps a keyboard target (the filter) after the last file is validated', () => {
    render(<MutableHarness initial={[{ section: 'unstaged', path: 'only.ts' }]} />)
    fireEvent.keyDown(screen.getByText('only.ts'), { key: 'Enter' })
    expect(document.activeElement).toBe(screen.getByLabelText('filter'))
  })

  it('disarms focus recovery when a validate fails, so a later refresh cannot steal focus', async () => {
    // The write fails and the row stays put (no section change arrives).
    function FailHarness() {
      const rootRef = useRef<HTMLDivElement>(null)
      const filterRef = useRef<HTMLInputElement>(null)
      const [tick, setTick] = useState(0)
      const actions = useMemo<RowActions>(
        () => ({ select: () => {}, act: () => Promise.resolve(false) }),
        [],
      )
      const { onKeyDown, restoreFocus } = useSidebarKeyboard({
        rootRef,
        filterRef,
        actions,
        clearFilter: () => false,
      })
      // biome-ignore lint/correctness/useExhaustiveDependencies: mirror the sidebar — an unrelated status change re-runs restoreFocus.
      useLayoutEffect(() => {
        restoreFocus()
      }, [tick, restoreFocus])
      return (
        // biome-ignore lint/a11y/noStaticElementInteractions: test harness mirroring the sidebar's delegated key handler.
        <div ref={rootRef} onKeyDown={onKeyDown}>
          <div className="review-split__list-head">
            <input ref={filterRef} aria-label="filter" />
          </div>
          <button
            type="button"
            data-file-row
            data-section="unstaged"
            data-path="a.ts"
            tabIndex={-1}
          >
            a.ts
          </button>
          <button
            type="button"
            data-file-row
            data-section="unstaged"
            data-path="b.ts"
            tabIndex={-1}
          >
            b.ts
          </button>
          <button type="button" onClick={() => setTick((t) => t + 1)}>
            refresh
          </button>
        </div>
      )
    }
    render(<FailHarness />)
    const a = screen.getByText('a.ts')
    a.focus()
    fireEvent.keyDown(a, { key: 'Enter' })
    // Let the failed act() settle so the latch is disarmed.
    await Promise.resolve()
    await Promise.resolve()
    // Focus elsewhere, then trigger an unrelated refresh: a stale latch would
    // yank focus back to the pre-picked sibling here.
    screen.getByLabelText('filter').focus()
    fireEvent.click(screen.getByText('refresh'))
    expect(document.activeElement).toBe(screen.getByLabelText('filter'))
  })
})

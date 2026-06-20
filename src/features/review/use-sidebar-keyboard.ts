import { type KeyboardEvent, type RefObject, useCallback, useRef } from 'react'
import type { DiffSection } from '../../stores/use-diff-store'
import { neighborIndex } from './file-filter'
import type { RowActions } from './row-context'

/** A rendered file row's identity, read back from its data-attributes. */
interface RowId {
  readonly section: DiffSection
  readonly path: string
}

/** Every rendered file-row element under `root`, in document order. */
function fileRows(root: HTMLElement | null): HTMLElement[] {
  return root ? Array.from(root.querySelectorAll<HTMLElement>('[data-file-row]')) : []
}

/** Reads a row element's section + path, or `null` when it is not a file row. */
function rowId(el: HTMLElement | null | undefined): RowId | null {
  const section = el?.getAttribute('data-section')
  const path = el?.getAttribute('data-path')
  if ((section === 'staged' || section === 'unstaged') && path) {
    return { section, path }
  }
  return null
}

/** Focuses a row and brings it just into view (scroll is a no-op under jsdom). */
function reveal(el: HTMLElement): void {
  el.focus()
  if (typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ block: 'nearest' })
  }
}

/** Inputs the sidebar gives its keyboard model. */
interface KeyboardOptions {
  /** The sidebar root that owns the handler and contains every row + the filter. */
  readonly rootRef: RefObject<HTMLElement | null>
  /** The filter input — `/` focuses it, and it is the entry point into the list. */
  readonly filterRef: RefObject<HTMLInputElement | null>
  /** Row interactions (open a file's diff / validate it). */
  readonly actions: RowActions
  /** Clears the filter; returns whether anything was actually cleared. */
  readonly clearFilter: () => boolean
}

/**
 * The sidebar's keyboard model (see the redesign spec). Navigation walks the
 * rendered `[data-file-row]` nodes in document order, so it stays correct across
 * the flat list, the tree, an active filter and collapsed folders with no
 * duplicated model:
 *
 * - ↑/↓, Home/End move the selection and open its diff (clamped, no wrap);
 * - Enter validates the focused file and advances to the next sibling (the
 *   burn-down flow), pre-selecting that sibling so the diff store keeps it across
 *   the stage refresh;
 * - Backspace/Delete un-validates a focused **staged** row;
 * - `/` (or Ctrl/⌘-F) focuses the filter; Esc clears it, then falls back into
 *   the list.
 *
 * Returns the `onKeyDown` handler and `restoreFocus`, which the sidebar calls in
 * a layout effect after a stage/unstage re-render to land focus on the
 * pre-computed next row (the originally focused node has by then unmounted).
 */
export function useSidebarKeyboard({ rootRef, filterRef, actions, clearFilter }: KeyboardOptions) {
  // The row to focus once the post-mutation re-render lands; a ref so it survives
  // the async refresh without triggering a render of its own.
  const pendingFocus = useRef<RowId | null>(null)
  // Set on every keyboard-driven validate/un-validate so the layout effect always
  // re-homes focus afterwards — even when no sibling was pre-picked (the last file
  // in a section), which would otherwise strand focus on <body>.
  const recover = useRef(false)

  const open = useCallback(
    (el: HTMLElement) => {
      const id = rowId(el)
      if (id) {
        actions.select(id.section, id.path)
      }
    },
    [actions],
  )

  // Validate (or un-validate) the focused row, having first picked and
  // pre-selected the sibling to land on so the diff follows the burn-down.
  const actAndAdvance = useCallback(
    (rows: HTMLElement[], current: HTMLElement) => {
      const id = rowId(current)
      if (!id) {
        return
      }
      const siblings = rows.filter((el) => el.getAttribute('data-section') === id.section)
      const next = siblings[neighborIndex(siblings.length, siblings.indexOf(current))]
      const nextId = rowId(next)
      // The focused row will unmount as the file moves sections; record where to
      // re-home focus. `recover` fires the fallback even when nextId is null.
      pendingFocus.current = nextId
      recover.current = true
      if (nextId) {
        actions.select(nextId.section, nextId.path)
      }
      // Disarm the recovery latch if the write fails: no section change will
      // arrive to consume it, so a later unrelated status change must not be able
      // to fire it and yank focus to a row the user never acted on.
      void Promise.resolve(actions.act(id.section, id.path)).then((underway) => {
        if (!underway) {
          recover.current = false
          pendingFocus.current = null
        }
      })
    },
    [actions],
  )

  const restoreFocus = useCallback(() => {
    if (!recover.current) {
      return
    }
    recover.current = false
    const target = pendingFocus.current
    pendingFocus.current = null
    const rows = fileRows(rootRef.current)
    const el =
      (target &&
        rows.find(
          (row) =>
            row.getAttribute('data-section') === target.section &&
            row.getAttribute('data-path') === target.path,
        )) ||
      rows[0]
    if (el) {
      reveal(el)
    } else {
      // The queue is fully burned down (no rows left): keep a live keyboard
      // target in the sidebar so navigation can resume, never stranding <body>.
      filterRef.current?.focus()
    }
  }, [rootRef, filterRef])

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const root = rootRef.current
      // Never hijack IME composition (French dead keys compose via the input).
      if (!root || event.nativeEvent.isComposing) {
        return
      }
      const target = event.target as HTMLElement
      const inFilter = target === filterRef.current

      // `/` or Ctrl/⌘-F jumps to the filter from anywhere but a text field.
      if (
        !inFilter &&
        (event.key === '/' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f'))
      ) {
        event.preventDefault()
        filterRef.current?.focus()
        filterRef.current?.select()
        return
      }

      // Leave the toolbar controls (toggle, menu) to their own key handling.
      if (!inFilter && target.closest('.review-split__list-head')) {
        return
      }

      const rows = fileRows(root)
      if (rows.length === 0) {
        if (inFilter && event.key === 'Escape') {
          clearFilter()
        }
        return
      }

      // Focus + open the row at `at` (callers only pass in-range, clamped indices).
      const move = (at: number) => {
        const el = rows[at]
        if (el) {
          reveal(el)
          open(el)
        }
      }

      // From the filter, ↑/↓/Enter step into the list; Esc clears then falls in.
      if (inFilter) {
        switch (event.key) {
          case 'ArrowDown':
          case 'Enter':
            event.preventDefault()
            move(0)
            return
          case 'ArrowUp':
            event.preventDefault()
            move(rows.length - 1)
            return
          case 'Escape':
            event.preventDefault()
            if (!clearFilter()) {
              move(0)
            }
            return
          default:
            return
        }
      }

      const current = target.closest<HTMLElement>('[data-file-row]')
      const index = current ? rows.indexOf(current) : -1

      switch (event.key) {
        case 'ArrowDown': {
          event.preventDefault()
          const at = index < 0 ? 0 : Math.min(index + 1, rows.length - 1)
          // Skip the redundant re-select when clamped to the same row.
          if (at !== index) {
            move(at)
          }
          return
        }
        case 'ArrowUp': {
          event.preventDefault()
          const at = index <= 0 ? 0 : index - 1
          if (at !== index) {
            move(at)
          }
          return
        }
        case 'Home':
          event.preventDefault()
          move(0)
          return
        case 'End':
          event.preventDefault()
          move(rows.length - 1)
          return
        case 'Enter':
          if (current) {
            event.preventDefault()
            actAndAdvance(rows, current)
          }
          return
        case 'Backspace':
        case 'Delete':
          if (current && rowId(current)?.section === 'staged') {
            event.preventDefault()
            actAndAdvance(rows, current)
          }
          return
        case 'Escape':
          // Return to the filter (the list's entry point), never blur into
          // <body> — that would put focus outside this delegated key handler.
          event.preventDefault()
          filterRef.current?.focus()
          filterRef.current?.select()
          return
        default:
          return
      }
    },
    [rootRef, filterRef, clearFilter, open, actAndAdvance],
  )

  return { onKeyDown, restoreFocus }
}

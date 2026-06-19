import { createContext, useContext } from 'react'
import type { DiffSection, DiffSelection } from '../../stores/use-diff-store'
import { useDiffStore } from '../../stores/use-diff-store'

/**
 * Row interactions shared by the flat list and the tree: how to open a file and
 * how to validate/unvalidate one. Provided once by the review surface so both
 * layouts (and the recursive tree rows) behave the same without prop drilling.
 *
 * The current selection is intentionally **not** here: a row reads only its own
 * open/closed state via {@link useIsSelected}, so opening a file re-renders just
 * the two rows whose selected-ness flips rather than the whole (non-virtualized)
 * list.
 */
export interface RowActions {
  /** Open `path` (in `section`) in the diff panel. */
  readonly select: (section: DiffSection, path: string) => void
  /** Validate (stage) or un-validate (unstage) `path`, depending on `section`. */
  readonly act: (section: DiffSection, path: string) => void
}

const RowContext = createContext<RowActions | null>(null)

/** Provides the {@link RowActions} to the file rows beneath the review surface. */
export const RowProvider = RowContext.Provider

/** The ambient {@link RowActions}; throws if used outside a {@link RowProvider}. */
export function useRowActions(): RowActions {
  const actions = useContext(RowContext)
  if (!actions) {
    throw new Error('useRowActions must be used within a RowProvider')
  }
  return actions
}

/** Whether `path` in `section` is the file currently open in the diff panel. */
export function isSelected(
  selected: DiffSelection | null,
  section: DiffSection,
  path: string,
): boolean {
  return selected?.section === section && selected.path === path
}

/**
 * Subscribes a single row to just its own selected-ness (a derived boolean), so
 * it re-renders only when that file's open/closed state actually changes.
 */
export function useIsSelected(section: DiffSection, path: string): boolean {
  return useDiffStore((s) => isSelected(s.selected, section, path))
}

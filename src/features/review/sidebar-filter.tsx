import { forwardRef } from 'react'
import { SearchIcon, XIcon } from '../../components/icons'

/** Props for the sidebar's instant file filter. */
interface SidebarFilterProps {
  /** Current query. */
  readonly value: string
  /** Called with the new query on every keystroke (and on clear). */
  readonly onChange: (value: string) => void
}

/**
 * The sidebar's instant file filter — a borderless field that fills the header,
 * with a leading search glyph and a trailing clear button (shown only when
 * non-empty). Controlled by the {@link Sidebar}; the ref is forwarded so the
 * keyboard model can focus it (`/` or Ctrl/⌘-F).
 */
export const SidebarFilter = forwardRef<HTMLInputElement, SidebarFilterProps>(
  function SidebarFilter({ value, onChange }, ref) {
    return (
      <div className="sidebar-filter">
        <span className="sidebar-filter__icon">
          <SearchIcon />
        </span>
        <input
          ref={ref}
          className="sidebar-filter__input"
          type="text"
          value={value}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          placeholder="Filtrer les fichiers…"
          aria-label="Filtrer les fichiers"
          title="Filtrer — ↓ pour parcourir la liste, Entrée pour valider"
          onChange={(event) => onChange(event.target.value)}
        />
        {value ? (
          <button
            type="button"
            className="sidebar-filter__clear"
            aria-label="Effacer le filtre"
            onClick={() => onChange('')}
          >
            <XIcon />
          </button>
        ) : null}
      </div>
    )
  },
)

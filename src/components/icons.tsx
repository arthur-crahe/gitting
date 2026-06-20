import type { ReactNode } from 'react'

/** Geometry knobs for {@link StrokeIcon}. */
interface StrokeIconProps {
  /** Coordinate system; defaults to a 16-unit square. */
  readonly viewBox?: string
  /** Rendered width and height in px (square); defaults to 16. */
  readonly size?: number
  /** Stroke weight; defaults to 1.4. */
  readonly strokeWidth?: number
  /** The glyph geometry (paths, circles, lines…). */
  readonly children: ReactNode
}

/**
 * Shared frame for the app's one-color line glyphs: no fill, stroked with the
 * current text color, round caps/joins, and hidden from assistive tech (the
 * enclosing control carries the accessible name).
 */
export function StrokeIcon({
  viewBox = '0 0 16 16',
  size = 16,
  strokeWidth = 1.4,
  children,
}: StrokeIconProps) {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative glyph; the enclosing control provides the accessible name.
    <svg
      viewBox={viewBox}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}

/** Circular-arrow glyph for refresh / re-check actions. */
export function RefreshIcon() {
  return (
    <StrokeIcon>
      <path d="M13.4 8a5.4 5.4 0 1 1-1.5-3.8" />
      <path d="M13.6 2.6 V5 H11.2" />
    </StrokeIcon>
  )
}

/** Sun glyph — shown in dark mode to offer switching to light. */
export function SunIcon() {
  return (
    <StrokeIcon strokeWidth={1.3}>
      <circle cx="8" cy="8" r="3.1" />
      <path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.1 1.1M11.9 11.9 13 13M13 3l-1.1 1.1M4.1 11.9 3 13" />
    </StrokeIcon>
  )
}

/** Moon glyph — shown in light mode to offer switching to dark. */
export function MoonIcon() {
  return (
    <StrokeIcon strokeWidth={1.3}>
      <path d="M13.5 9.5A5.5 5.5 0 1 1 6.5 2.5a4.3 4.3 0 0 0 7 7Z" />
    </StrokeIcon>
  )
}

/**
 * Disclosure chevron — points down when `open`, rotates to point right when
 * collapsed. Rotation is CSS-driven through the `[data-open]` attribute; the
 * caller supplies the `className` carrying those rules (the app uses
 * `disclosure-chevron`).
 */
export function Chevron({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg
      className={className}
      data-open={open}
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Checkmark — validates (stages) a file. */
export function CheckIcon() {
  return (
    <StrokeIcon size={14} strokeWidth={1.7}>
      <path d="M3 8.5 6.5 12 13 4.5" />
    </StrokeIcon>
  )
}

/** Curved back-arrow — un-validates (unstages) a file, sending it to review. */
export function UndoIcon() {
  return (
    <StrokeIcon size={14}>
      <path d="M6 4 2.5 7.5 6 11" />
      <path d="M2.5 7.5h7a4 4 0 0 1 0 8H7" />
    </StrokeIcon>
  )
}

/** Stacked horizontal lines — the flat-list view in the layout toggle. */
export function ListIcon() {
  return (
    <StrokeIcon size={14}>
      <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
    </StrokeIcon>
  )
}

/** A root row with two branching children — the tree view in the layout toggle. */
export function TreeIcon() {
  return (
    <StrokeIcon size={14}>
      <path d="M2.5 3.5h11" />
      <path d="M5 3.5v9" />
      <path d="M5 8h8.5" />
      <path d="M5 12h8.5" />
    </StrokeIcon>
  )
}

/**
 * The brand glyph: a stacked plus over minus — the diff gutter's own vocabulary,
 * monochrome. Identity that emerges from the domain, not decoration. Sized by the
 * caller (welcome mark, completion state).
 */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <StrokeIcon viewBox="0 0 24 24" size={size} strokeWidth={2.2}>
      <path d="M12 5v8M8 9h8" />
      <path d="M8 17.5h8" />
    </StrokeIcon>
  )
}

/** Vertical three-dot overflow handle for a menu trigger. */
export function KebabIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
      <circle cx="8" cy="3.4" r="1.15" />
      <circle cx="8" cy="8" r="1.15" />
      <circle cx="8" cy="12.6" r="1.15" />
    </svg>
  )
}

/** A check inside a circle — the queue-cleared completion mark. */
export function CheckCircleIcon({ size = 40 }: { size?: number }) {
  return (
    <StrokeIcon viewBox="0 0 24 24" size={size} strokeWidth={1.6}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.4 10.8 15.2 16 9.2" />
    </StrokeIcon>
  )
}

/** A neutral document glyph for diff notices (binary, submodule, empty…). */
export function DocumentIcon({ size = 30 }: { size?: number }) {
  return (
    <StrokeIcon viewBox="0 0 24 24" size={size} strokeWidth={1.5}>
      <path d="M6 3.5h7l5 5V20a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 20Z" />
      <path d="M13 3.5V8.5h5" />
    </StrokeIcon>
  )
}

/** Magnifier glyph — the sidebar's file filter. */
export function SearchIcon({ size = 14 }: { size?: number }) {
  return (
    <StrokeIcon size={size} strokeWidth={1.5}>
      <circle cx="7" cy="7" r="4.2" />
      <path d="M10.2 10.2 14 14" />
    </StrokeIcon>
  )
}

/** A small cross — clears the filter. */
export function XIcon({ size = 13 }: { size?: number }) {
  return (
    <StrokeIcon size={size} strokeWidth={1.5}>
      <path d="M4 4 12 12M12 4 4 12" />
    </StrokeIcon>
  )
}

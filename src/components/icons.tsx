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

import { type RefObject, useEffect, useRef, useState } from 'react'

/**
 * Drives the "stuck" state of a `position: sticky` section header. Because the
 * header shares the sidebar's tint, a naive sticky header is invisible over
 * scrolling content; we add a hairline seam only while it is pinned. Detection
 * uses an `IntersectionObserver` on a zero-height sentinel placed just above the
 * header (scroll-driven CSS is banned on WebKitGTK — see the design system),
 * watching it leave the top of `scrollRef`.
 *
 * @param scrollRef the scroll viewport that contains the section.
 * @returns a tuple of the sentinel ref to render above the header, and whether
 *   the header is currently stuck.
 */
export function useStuck(
  scrollRef: RefObject<HTMLElement | null>,
): [RefObject<HTMLDivElement | null>, boolean] {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || typeof IntersectionObserver === 'undefined') {
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => setStuck(entry ? !entry.isIntersecting : false),
      { root: scrollRef.current ?? null, threshold: [0] },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [scrollRef])

  return [sentinelRef, stuck]
}

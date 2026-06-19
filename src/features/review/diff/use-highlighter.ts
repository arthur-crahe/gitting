import { useEffect, useState } from 'react'
import type { HighlighterCore } from 'shiki/core'
import { getHighlighter } from '../../../lib/highlighter'

/**
 * Loads the shared Shiki highlighter and returns it once ready, or `null` while
 * it loads (the diff renders as plain text until then, then re-colors). The
 * underlying instance is created once and cached, so later mounts resolve
 * immediately.
 */
export function useHighlighter(): HighlighterCore | null {
  const [highlighter, setHighlighter] = useState<HighlighterCore | null>(null)

  useEffect(() => {
    let active = true
    void getHighlighter().then((instance) => {
      if (active) {
        setHighlighter(instance)
      }
    })
    return () => {
      active = false
    }
  }, [])

  return highlighter
}

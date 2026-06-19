import type { HighlighterCore } from 'shiki/core'
import { beforeAll, describe, expect, it } from 'vitest'
import { getHighlighter } from '../../../lib/highlighter'
import { tokenizeLine } from './tokenize'

let highlighter: HighlighterCore

beforeAll(async () => {
  highlighter = await getHighlighter()
})

describe('tokenizeLine', () => {
  it('colors a line and reproduces its text exactly (no loss)', () => {
    const content = '  const x = 1 // é'
    const tokens = tokenizeLine(highlighter, content, 'typescript')

    expect(tokens.length).toBeGreaterThan(1)
    // Concatenating the tokens must reproduce the input byte-for-byte —
    // including leading whitespace and unicode.
    expect(tokens.map((t) => t.content).join('')).toBe(content)
    // At least one token carries a real color (not the inherit fallback).
    expect(tokens.some((t) => t.light.startsWith('#'))).toBe(true)
  })

  it('returns no tokens for an empty line', () => {
    expect(tokenizeLine(highlighter, '', 'typescript')).toEqual([])
  })
})

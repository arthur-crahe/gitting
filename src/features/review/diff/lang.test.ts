import { describe, expect, it } from 'vitest'
import { langForPath } from './lang'

describe('langForPath', () => {
  it('maps known extensions to Shiki language ids', () => {
    expect(langForPath('src/app.ts')).toBe('typescript')
    expect(langForPath('src/App.tsx')).toBe('tsx')
    expect(langForPath('main.rs')).toBe('rust')
    expect(langForPath('Cargo.toml')).toBe('toml')
    expect(langForPath('styles/global.css')).toBe('css')
    expect(langForPath('README.md')).toBe('markdown')
  })

  it('is case-insensitive on the extension', () => {
    expect(langForPath('A.TS')).toBe('typescript')
  })

  it('returns null for an unknown or extensionless path', () => {
    expect(langForPath('data.bin')).toBeNull()
    expect(langForPath('LICENSE')).toBeNull()
    expect(langForPath('Makefile')).toBeNull()
  })
})

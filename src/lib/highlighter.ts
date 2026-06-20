import bash from '@shikijs/langs/bash'
import css from '@shikijs/langs/css'
import html from '@shikijs/langs/html'
import javascript from '@shikijs/langs/javascript'
import json from '@shikijs/langs/json'
import jsx from '@shikijs/langs/jsx'
import markdown from '@shikijs/langs/markdown'
import python from '@shikijs/langs/python'
import rust from '@shikijs/langs/rust'
import toml from '@shikijs/langs/toml'
import tsx from '@shikijs/langs/tsx'
import typescript from '@shikijs/langs/typescript'
import yaml from '@shikijs/langs/yaml'
import githubDarkDimmed from '@shikijs/themes/github-dark-dimmed'
import githubLight from '@shikijs/themes/github-light'
import { createHighlighterCore, type HighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

/**
 * Shiki theme ids the diff tokens carry colors for (mapped to light/dark CSS).
 * Dark uses GitHub's *dimmed* palette: its desaturated keyword/structure tokens
 * let the green/red diff tints stay dominant and never clash with the wash.
 */
export const LIGHT_THEME = 'github-light'
export const DARK_THEME = 'github-dark-dimmed'

/**
 * The bundled grammars. A curated set covering the languages this app reviews,
 * loaded up front so highlighting is synchronous once the core is ready — kept
 * deliberately small to bound the bundle (`langForPath` must stay in sync).
 */
const LANGS = [
  typescript,
  tsx,
  javascript,
  jsx,
  json,
  css,
  html,
  markdown,
  rust,
  toml,
  yaml,
  python,
  bash,
]

let instance: Promise<HighlighterCore> | null = null

/**
 * The shared Shiki core highlighter, created once. Uses the fine-grained
 * `shiki/core` with the **JavaScript** regex engine (no `onig.wasm` asset — fully
 * offline in the Tauri WebView) and only the two themes / curated grammars we
 * need, rather than the full bundle.
 */
export function getHighlighter(): Promise<HighlighterCore> {
  if (!instance) {
    instance = createHighlighterCore({
      themes: [githubLight, githubDarkDimmed],
      langs: LANGS,
      engine: createJavaScriptRegexEngine(),
    })
  }
  return instance
}

/**
 * Maps a file extension to a Shiki language id. Only the grammars bundled by
 * `lib/highlighter.ts` appear here — an unmapped file falls back to plain,
 * uncolored text rather than failing to highlight.
 */
const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  json: 'json',
  jsonc: 'json',
  css: 'css',
  html: 'html',
  htm: 'html',
  md: 'markdown',
  markdown: 'markdown',
  rs: 'rust',
  toml: 'toml',
  yaml: 'yaml',
  yml: 'yaml',
  py: 'python',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
}

/** The Shiki language id for a repo-relative path, or `null` if unsupported. */
export function langForPath(path: string): string | null {
  const dot = path.lastIndexOf('.')
  if (dot === -1) {
    return null
  }
  return EXT_TO_LANG[path.slice(dot + 1).toLowerCase()] ?? null
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/app'
import { ErrorBoundary } from './app/error-boundary'
import { ThemeProvider } from './app/theme-provider'
// Self-hosted typefaces (offline, Vite-bundled — no runtime CDN). Geist Variable
// carries every UI weight in one file; Commit Mono ships 400/500 for code, paths
// and the wordmark. Imported before Radix so the @font-face rules are registered
// when the themed styles (which reference --default-font-family) first apply.
import '@fontsource-variable/geist/index.css'
import '@fontsource/commit-mono/400.css'
import '@fontsource/commit-mono/500.css'
import '@radix-ui/themes/styles.css'
import './styles/global.css'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element "#root" not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </ThemeProvider>
  </StrictMode>,
)

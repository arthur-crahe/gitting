import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/app'
import { ErrorBoundary } from './app/error-boundary'
import { ThemeProvider } from './app/theme-provider'
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

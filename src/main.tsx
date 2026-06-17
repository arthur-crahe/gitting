import { Theme } from '@radix-ui/themes'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/app'
import '@radix-ui/themes/styles.css'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element "#root" not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <Theme appearance="dark" accentColor="iris" grayColor="slate" radius="medium">
      <App />
    </Theme>
  </StrictMode>,
)

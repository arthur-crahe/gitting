import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

// Unit tests only — no e2e/integration. Reuses the Vite config (plugins, resolve).
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      passWithNoTests: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: true,
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      exclude: [...configDefaults.exclude],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
      },
    },
  }),
)

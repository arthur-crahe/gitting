import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Set by the Tauri CLI when targeting a physical device; absent for desktop dev.
const host = process.env.TAURI_DEV_HOST

// Vite config tuned for Tauri 2 — https://v2.tauri.app/start/frontend/vite/
export default defineConfig({
  plugins: [react()],
  // Keep Rust compiler errors visible in the terminal.
  clearScreen: false,
  server: {
    // Must match `build.devUrl` in src-tauri/tauri.conf.json.
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  // Only these prefixes are exposed to the client via import.meta.env.
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    // WebView2 (Windows) / WebKitGTK 4.1 (Linux) baselines. safari13 is unreachable under
    // Vite 8's esbuild lowering, so use a modern floor both WebViews support natively.
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari16',
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
  },
})

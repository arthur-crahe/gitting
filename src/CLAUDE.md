# Frontend (`src/`)

React + TypeScript (strict) on Vite, rendered in the Tauri 2 WebView. UI built with **`@radix-ui/themes`**.

## Organization (feature-based)

- `app/` — bootstrap: root render, providers, the Radix `<Theme>` wrapper, global setup.
- `features/repo/` — opening and selecting the local repository.
- `features/review/` — the two review sections (À reviewer / Validé) and the file-by-file diff view.
- `components/` — shared presentational components built **on top of** Radix Themes (not a reimplementation of it).
- `stores/` — Zustand stores. One store per concern; expose selectors, colocate actions with state; hook naming `useXStore`.
- `lib/` — framework-agnostic helpers, shared types, and the **Tauri command bindings** (typed wrappers over `@tauri-apps/api`'s `invoke` — the single place the frontend talks to Rust).
- `styles/` — global styles and theme tokens.
- `test/` — Vitest setup (`setup.ts`).

## Conventions

- Cross the Rust boundary only through `lib/` bindings — components never call `invoke` directly.
- `import type` for type-only imports. JSDoc on exported functions, hooks, and types.
- Unit tests colocated as `*.test.ts(x)` (Testing Library + jsdom). No E2E/integration.

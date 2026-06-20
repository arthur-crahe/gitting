# Gitting

Desktop app (Linux + Windows) for reviewing **local git changes** in an already-cloned repo — typically to relire what an AI agent just produced. Professional use, no accounts, fully local (no backend service).

## Review model

Git staging is the review cursor. The UI has two sections:

1. **À reviewer** (unstaged) — `git diff` (working tree vs index). Pending review. Validating a file **stages** it (`git add <file>`), moving it to section 2.
2. **Validé** (staged) — `git diff --staged` (index vs HEAD). Reviewed and accepted. **Unstaging** (`git restore --staged <file>`) sends it back to section 1.

Section 1 empty ⇒ everything has been reviewed.

## Stack — locked decisions

- **Tauri 2** desktop shell, targets **Linux + Windows**.
- **React + TypeScript (strict)** on **Vite**.
- **UI: `@radix-ui/themes`** — the themed component library, not only the `@radix-ui/react-*` primitives.
- **State: Zustand.**
- **Git backend: gitoxide (`gix`)** — pure-Rust, single default backend; no dependency on an installed `git`, no text-output parsing. **Shelling out to the `git` binary is a narrow fallback for index writes only** (stage/unstage), isolated in one module, until `gix` gains a stable index add/remove API. See `src-tauri/CLAUDE.md`.
- **Package manager: pnpm.** **Lint + format: Biome.** **Tests: Vitest (unit only).**

## Layout

```
CLAUDE.md            this file
package.json         frontend manifest (pnpm)
pnpm-workspace.yaml  pnpm settings + build-script allowlist
tsconfig.json        strict TS for the app (src/)
tsconfig.node.json   strict TS for build tooling (vite/vitest config)
biome.json           lint + format
vite.config.ts       Vite + Tauri dev/build
vitest.config.ts     unit tests (jsdom), merges the Vite config
index.html           Vite entry
rust-toolchain.toml  Rust = stable (>= 1.85 for gix)
docs/adr/            architecture decision records (MADR)
docs/reference/      durable technical references (e.g. tauri2-window-options.md — full Tauri 2 window/webview option catalog)
src/                 frontend (feature-based) — see src/CLAUDE.md
src-tauri/           Rust/Tauri backend — see src-tauri/CLAUDE.md
```

`src/`: `app/` (bootstrap, providers, Radix theme) · `features/{repo,review}/` · `components/` (shared, over Radix Themes) · `stores/` (Zustand) · `lib/` (helpers, types, Tauri bindings) · `styles/` · `test/` (Vitest setup).

## Conventions

- TypeScript strict; `import type` for type-only imports (`verbatimModuleSyntax`).
- Feature-based frontend; idiomatic Rust backend (`commands/` = Tauri commands, `git/` = gix layer).
- Naming: files kebab-case; React components PascalCase; hooks `useX`; Zustand stores `useXStore`.
- Commits: Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `chore:`).

## Engineering standards

- Low cyclomatic complexity, single responsibility, no duplication, no dead code — keep it testable.
- Vitest **unit tests from the start**. No E2E, no integration tests.
- Complete, consistent JSDoc (TS) / doc comments (Rust), kept in sync with the code.
- Performance is a first-class concern in design choices.

## Work principles

- **CLI over hand-editing.** Prefer official CLIs (`create-tauri-app`, `tauri`, `pnpm`, `biome`) to generate and update config rather than hand-authoring it. The stubs here are a starting point; let the CLIs own these files going forward.
- **Research before acting.** For anything that moves (versions, schemas, tooling conventions), verify against current official sources — don't rely on memory.
- **No AI slop.** Sober, intentional code and UI; no filler comments, no redundant `.md` files.
- **Professional bar.** Sound architecture, maintainability, and performance throughout.

## Installation & running

Frontend dependencies are **installed and pinned** (pnpm 10 — see `pnpm-lock.yaml`); versions were resolved to the latest stable via the registry (React 19, Vite 8, TypeScript 6, Vitest 4, Biome 2.5, Radix Themes 3, Tauri CLI/API 2.11). `src-tauri/Cargo.toml` targets `tauri`/`tauri-build` 2.x; `gix` + `thiserror` arrive with the git layer.

- `pnpm dev` — frontend page (Vite) at http://localhost:1420.
- `pnpm tauri dev` — native desktop window. Requires first: the **Rust toolchain** (`rustup`, stable ≥ 1.85) and the **Tauri Linux system libs** — on Debian/Ubuntu: `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`.

Version constraints to honor: `tauri`/`tauri-build`/`@tauri-apps/cli` share the same **minor**; `gix` needs **Rust ≥ 1.85** (depend on the `gix` facade, not `gix-index`); pnpm ≥ 11 would require Node ≥ 22 and the `allowBuilds` map (this repo is on pnpm 10 → `onlyBuiltDependencies` array).

## Releases & distribution

Installers are **never committed** — they ship as **GitHub Release assets**. `.github/workflows/release.yml` builds them on a matrix (`ubuntu-22.04` for portable `.deb`/`.rpm`/`.AppImage`, `windows-latest` for NSIS `.exe` + MSI) via `tauri-action`, on every `app-v*` tag. Cut a release with the **`/release`** command (`.claude/commands/release.md`): it bumps the version across `tauri.conf.json`/`package.json`/`Cargo.toml`/`Cargo.lock`, runs the gate, commits, tags `app-v<version>`, and pushes. The pipeline then creates a **draft** Release at `…/releases` to review and publish. Build releases only through CI (`ubuntu-22.04`) — never from a dev box, whose newer glibc breaks portability on older distros.

## Docker — decision: not adopted

No Docker / Compose. Rationale: a Tauri GUI needs a native WebView, windowing and GPU; the **Windows** target cannot be cross-built from a Linux container (it needs an MSVC host + signtool), and the maintained Tauri CI path uses bare runners — so a container would cover at most the Linux test/lint slice while adding a second environment to keep in sync. The `gix` backend is pure Rust (no libgit2/system-git), and Vitest runs fine natively. Reproducibility instead comes from `rust-toolchain.toml`, a pinned Node, and a documented apt one-liner for Tauri's Linux deps. Revisit only if onboarding pain appears — and then a single optional `.devcontainer` scoped to test/lint, not full Docker.

## Targets

Desktop **Linux + Windows**, professional use, **no account system**, fully local.

## `.claude/`

- `commands/release.md` — the **`/release`** command (bump version everywhere → gate → commit → tag `app-v<version>` → push → pipeline builds the draft Release).

Otherwise kept minimal — add subagents/hooks here only when a concrete need appears.

# Backend (`src-tauri/`)

Rust + Tauri 2. Entry split: `src/main.rs` is the thin binary (`app_lib::run()`); `src/lib.rs` holds `run()` and wires the app. `[lib].name = "app_lib"` in `Cargo.toml` must match the `app_lib::run()` call.

## Git layer — gix by default

**`gix` (gitoxide) is the single backend for all reads** — pure Rust, no installed-`git` dependency, no text parsing:

- **À reviewer (unstaged)** — index vs worktree (`gix` status `index_worktree`).
- **Validé (staged)** — HEAD-tree vs index (`gix` status `tree_index`); handle the unborn-HEAD (no commits) case.

**Index writes shell out to the system `git` binary** — a narrow, documented fallback, because `gix` index add/remove is not yet a stable API (tracked in gitoxide `crate-status.md`):

- `stage_file` → `git add -- <path>` (bulk: `stage_files`, chunked to stay under the platform arg limit)
- `unstage_file` → `git restore --staged -- <path>` (bulk: `unstage_files`)

Keep this in one module behind a trait so it can swap to native `gix` once index mutation lands. Invoke `git` directly (no shell), validate paths, pass `--` before the path, and surface exit code/stderr as a structured error. Do **not** use `gix`'s `worktree-mutation` feature for staging — that is checkout/reset, not per-file index editing.

## Module layout

- `git/` — gix layer: `repo` (open/discover), `status`, `diff` (per-file unstaged/staged hunks), `index_write` (the isolated shell-out), `error` (one `thiserror` enum, `serde::Serialize`).
- `commands/` — Tauri commands, thin wrappers over `git/`: `open_repo`, `repo_status`, `diff_unstaged`, `diff_staged`, `stage_file`, `unstage_file`, `stage_files`, `unstage_files`. Async, owned `String` args, `Result<T, GitError>`. Registered via `generate_handler!` in `lib.rs`.

## Notes

- Custom commands need no plugin permission; `capabilities/default.json` grants `core:default` to the `main` window. Add plugin permissions there only if a plugin is introduced.
- Version constraints: `gix` needs Rust ≥ 1.85; `tauri`/`tauri-build`/`@tauri-apps/cli` share a minor.
- Icons in `icons/` are generated later via `pnpm tauri icon <source.png>` — not hand-authored.
- `gen/` is build-generated (gitignored) — never authored or committed.

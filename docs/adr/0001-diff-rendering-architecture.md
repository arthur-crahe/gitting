# ADR 0001 — Diff rendering architecture

- **Status:** Accepted
- **Date:** 2026-06-18
- **Deciders:** project owner
- **Scope:** how the app turns a git diff into the on-screen review surface (`features/review`) and how that surface drives staging.

## Context

Gitting reviews **local git changes**, using git staging as the review cursor: *À reviewer* (unstaged, worktree vs index) and *Validé* (staged, HEAD-tree vs index). Validating a file stages it; unstaging sends it back.

Two facts from the locked stack frame every option:

1. **The diff is already computed in Rust.** Per `src-tauri/CLAUDE.md`, the `git/diff` module produces the unstaged/staged diffs through `gix` (whose diff engine is `gix-diff`, itself built on `imara-diff`). This is the single source of truth, and the hunks it produces are exactly the hunks we stage.
2. **The frontend is React 19 + TypeScript strict, themed with `@radix-ui/themes`.** It must *render* a diff and let the user accept it — eventually at file, hunk, and line granularity.

We evaluated the ecosystem of diff libraries (a fact-checked survey of ~34 candidates across React components, editor-based viewers, diff engines, parsers, syntax highlighters and virtualization helpers; see References) to decide whether to adopt a library, build our own, or mix.

## Decision drivers

- **Fidelity.** What we display must equal what we stage. A renderer that re-computes its own diff can chunk hunks differently from `gix`/git, desynchronising the displayed hunk from the staged result.
- **Staging is the product.** File-level staging is table stakes; per-hunk / per-line staging (à la `git add -p`) is the professional differentiator. **No library provides staging** — we build it regardless.
- **Radix-native, sober UI.** The look must come from Radix Themes tokens (color scale, radius, light/dark), not a foreign styling system bolted on. "No AI slop" implies owning the markup and the theme.
- **Large diffs.** AI-generated changes can be huge; the viewport must virtualize.
- **Constraints.** React 19 + strict TS; fully local (no git binary beyond the isolated index-write fallback); maintainability and low lock-in (avoid betting the core on a single-maintainer / 0.x dependency).

## Options considered

The rendering libraries split by **input model**, which is the decisive axis given driver #1.

### A. "Two raw strings, re-diff in JS" — *rejected*
`react-diff-viewer-continued`, Monaco `DiffEditor`, `@codemirror/merge`, `diff-match-patch`.
They ingest both file versions and recompute the diff client-side. This **discards the `gix` diff**, risks hunk-boundary divergence from what we stage, and each brings a foreign theming system (`@emotion`, VS Code themes, CodeMirror's `style-mod`) that fights Radix Themes. Monaco and CodeMirror are full editors — overpowered for a render-and-stage surface and heavy to self-host offline.

### B. "Unified-diff text / structured hunks" component — *viable, not chosen as the core*
- **`react-diff-view`** (otakustay, MIT) — consumes a unified-diff string; **exposes a per-line / per-change selection model** (`{change, side}`) that maps cleanly onto file/hunk/line staging; split + unified; BYO highlighting; CSS-variable theming. Caveats (verified): **no built-in virtualization**, single-maintainer with sporadic cadence.
- **`@git-diff-view/react`** (MIT) — accepts hunk text or two strings; built-in highlighting; widget hooks. Caveats (verified): **no virtualization** (open issue #21), "deep theming" is overstated (built-in light/dark only), open correctness bug #63 (syntax highlighting lost on unmount/remount — directly plausible when switching between our two sections), 0.x API.

### C. `diff2html` — *fallback only*
Takes a unified-diff string or structured JSON, but emits an **HTML string** (no React binding), has **no virtualization**, **no staging hooks**, and a GitHub-themed CSS hard to reconcile with Radix.

### D. Build the diff renderer in-house, composing best-in-class primitives — *chosen*
We own only the **diff layout** and the **staging interaction** (what defines the product), and delegate the genuinely hard, generic parts to maintained, framework-agnostic primitives.

## Decision

**Adopt option D: an in-house `DiffView` rendered from `gix`-produced structured hunks, composed with dedicated primitives. Keep `react-diff-view` as the reference design and an optional MVP fallback.**

```
gix-diff (Rust)  ──structured hunks over Tauri IPC──▶  <DiffView>  (React + Radix Themes, owned)
  └ source of truth, git-faithful hunks                  ├─ Shiki              syntax tokens, per line
                                                         ├─ TanStack Virtual   row virtualization
                                                         ├─ diff-match-patch   intra-line word diff
                                                         └─ gutter actions → stage / unstage  (file · hunk · line)
```

### Backend (`src-tauri/src/git/diff.rs`, `commands/`)
- Keep `gix-diff` as the engine (Histogram algorithm — git-faithful boundaries). It already lives in the dependency tree via `gix`.
- Emit **structured hunks**, not just unified-diff text, so the frontend never re-parses and can address individual hunks/lines for staging. A stable `serde::Serialize` shape:
  - `DiffFile { path, change_kind, old_mode, new_mode, is_binary, hunks: Vec<Hunk> }`
  - `Hunk { old_start, old_lines, new_start, new_lines, lines: Vec<Line> }`
  - `Line { kind: Context | Add | Delete, old_no: Option<u32>, new_no: Option<u32>, content }`
- `diff_unstaged` / `diff_staged` commands return `Vec<DiffFile>`.

### Frontend (`src/features/review/`, `src/lib/`)
- `lib/` exposes TS types mirroring the Rust structs and the typed `invoke` binding (the only place crossing the Rust boundary).
- `<DiffView>` → `<DiffHunk>` → `<DiffLine>`, split/unified toggle, rendered with Radix Themes primitives and tokens.
- **Shiki** in `shiki/core` fine-grained mode (pinned grammar + theme set), tokenizing **line by line**, with its CSS-variable theming mapped to Radix light/dark. Avoids the full ~1.2 MB bundle.
- **TanStack Virtual** for row virtualization of large diffs.
- **diff-match-patch** (or the `imara-diff` token grain on the Rust side) for intra-line word highlighting.

### Staging granularity (phased, honest scope)
- **v1 — file-level.** Uses the existing `stage_file` / `unstage_file` (`git add` / `git restore --staged`) per `src-tauri/CLAUDE.md`. `<DiffView>` is already structured around hunks/lines so the UI is forward-compatible.
- **Later — hunk/line-level.** Requires partial staging (`git apply --cached` with a reconstructed patch, or equivalent). This is a backend extension that stays **inside the isolated `index_write` module behind its trait** — the same boundary the project already reserves for index mutation. Not in v1.

## Consequences

**Positive**
- Fidelity by construction: we render exactly the `gix` hunks we stage.
- Full Radix-native, sober UI — no foreign style system to fight.
- Virtualization solved (the gap in *every* diff library surveyed).
- The staging model fits naturally instead of being retrofitted onto a viewer.
- The core depends only on heavily-maintained primitives (Shiki ~16M dl/wk, TanStack Virtual, diff-match-patch); no single-maintainer / 0.x runtime dependency on the critical path.

**Negative / costs**
- More code to own and unit-test: split/unified layout, gutters, selection, the hunk→DOM mapping.
- We own rendering performance (mitigated by virtualization and per-line tokenization).
- Shiki must be kept in fine-grained mode deliberately, or the bundle bloats.
- Word-level diff and partial (hunk/line) staging are additional, later work.

**Mitigations**
- Study `react-diff-view` (MIT) as a reference for the hunk/selection model; it remains a drop-in MVP renderer if we need to ship file-level review before the in-house view is ready.
- Ship file-level staging first; layer hunk/line staging once the index-write module gains partial-apply.

## Confirmation

- Vitest unit tests on: the TS hunk model, the structured-hunk → render mapping, and the selection→staging-target logic.
- Manual check in `pnpm tauri dev` on a 10k+ line diff to confirm virtualization keeps the viewport responsive.
- Invariant test: the set of lines shown in a hunk equals the set of lines applied when that hunk/file is staged.

## References

- `react-diff-view` — selection model & no built-in virtualization: <https://github.com/otakustay/react-diff-view>
- `@git-diff-view/react` — virtualization open request #21, remount-highlight bug #63: <https://github.com/MrWangJustToDo/git-diff-view/issues/21>, <https://github.com/MrWangJustToDo/git-diff-view/issues/63>
- `react-diff-viewer-continued` (re-diffs two strings, @emotion theming): <https://github.com/Aeolun/react-diff-viewer-continued>
- `diff2html` (HTML string, no React binding): <https://github.com/rtfpessoa/diff2html>
- `gix-diff` (structured hunks + unified-diff sink): <https://docs.rs/gix-diff/latest/gix_diff/>
- `imara-diff` (Rust diff engine under gix): <https://github.com/pascalkuthe/imara-diff>
- Shiki (fine-grained bundling, React output): <https://shiki.style/guide/best-performance>
- TanStack Virtual: <https://tanstack.com/virtual/latest>
- diff-match-patch: <https://github.com/google/diff-match-patch>

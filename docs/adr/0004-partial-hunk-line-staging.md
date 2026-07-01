# ADR 0004 — Partial (hunk / line) staging

- **Status:** Accepted
- **Date:** 2026-07-01
- **Deciders:** project owner
- **Scope:** how Gitting validates/unvalidates a *part* of a file — a hunk, then a line range — instead of the file-only staging of ADR 0001. Covers the backend staging mechanism (`git/index_write.rs`, `git/diff.rs`, new `git/hunk_patch.rs` + `git/partial.rs`, `commands/`), the review data model (the two sections *À reviewer* / *Validé*), and the diff-view interaction. The exhaustive, file-by-file implementation plan, edge-case matrix and test list live in [`docs/reference/partial-staging-plan.md`](../reference/partial-staging-plan.md); this ADR records the **decisions and their rationale**.

## Context

ADR 0001 shipped a diff viewer and **file-level** staging as the review cursor: validating a file runs `git add`, unvalidating runs `git restore --staged`, both isolated in `git/index_write.rs` (the one place the app shells out to `git`, per `src-tauri/CLAUDE.md`). Hunk/line granularity was explicitly deferred there. It is **ROADMAP P0 #1 — "the gap n°1"**: today it is impossible to accept the good 90 % of a file and leave the agent's scope-creep to review.

The task is bug-prone by reputation (every git GUI has partial-staging edge-case history), so the design was produced by a multi-agent analysis (codebase reading + web research across `git add-patch.c`, lazygit, git-cola, Magit, gitoxide; three competing designs; adversarial critique). Two of its conclusions reshaped the naïve approach and are the substance of this ADR.

## Decision drivers

- **gix-first, narrow shell-out.** Reads stay on `gix`; index writes may shell out to `git` only inside `index_write.rs`, behind a trait, until gitoxide blesses a native index add/remove (`src-tauri/CLAUDE.md`).
- **Byte fidelity is non-negotiable.** The staged index blob must be byte-identical to the reviewed content: CRLF, no-newline-at-EOF, and non-UTF-8 must survive. A staging tool that silently mutates bytes on Windows is a data-integrity bug.
- **WYSIWYG review invariant (ADR 0001).** What the panel shows must equal what gets staged. A stale selection must never silently stage unseen content.
- **Low complexity, incrementally shippable, testable.** Prefer a first increment that closes ~80 % of the value with the smallest correct surface, each phase unit-tested (Rust + Vitest).
- **Sober UI (Linear-like), Linux + Windows.** No new gutter column, no layout-metric churn; works on WebKitGTK and WebView2.

## Finding 1 — synthesize the patch from raw bytes, NOT from the gix diff

The obvious approach — rebuild a unified patch from the hunks already computed for display — is **wrong**, and would ship as a Windows/CRLF corruption bug. Verified **in-repo** (not merely from documentation):

- `git/diff.rs:264` feeds gix's **line-interned** input (`prep.interned_input()`) to the diff.
- `git/diff.rs:298` builds each displayed line as `content = bytes.to_str_lossy().into_owned()` — a `String`. Two independent, sufficient losses follow:
  1. **`to_str_lossy`** replaces any non-UTF-8 byte with U+FFFD → the rendered `content` is not byte-recoverable.
  2. The tokens are **newline-stripped**: an existing test asserts a context line's `content == "line16"` — *no* trailing `\n`. So the newline (and, per the imara tokenizer, a preceding `\r`) is absent from `content`.

Therefore CRLF status and EOF-newline status are **not present** in the diff we render, and a patch synthesized from it cannot round-trip them. **Decision:** the patch generator sources every emitted byte from the **raw** streams —

- *staging*: old side = the **index blob**, new side = the **worktree file**;
- *unstaging*: old side = the **HEAD blob**, new side = the **index blob**

— split by a terminator-preserving splitter and indexed by the freshly re-diffed hunk's `old_no`/`new_no`. The gix diff is used only to know *which* lines and their kinds (what the user saw); the bytes come from blobs. Apply runs with `-c core.autocrlf=false -c core.safecrlf=false --whitespace=nowarn` so git never rewrites them.

*(Confidence note: the two losses above are certain and repo-verified. Whether the tokenizer also strips `\r` is the one detail tied to which imara-diff `gix-diff 0.60` resolves — the lock pulls **both** `imara-diff 0.1.8` and `0.2.0` — but this only affects whether a pure-EOL change even produces a hunk; it does not affect the raw-byte sourcing decision, which the UTF-8 + `\n` losses already force. Pin it when implementing Phase 0.)*

## Finding 2 — a partially-staged file legitimately lives in BOTH sections

The review model assumed a file is in exactly one section (unstaged *or* staged). A partial file breaks that — but cleanly: `git/status.rs` derives the two sections from gix's two iterators (`index_worktree` for *À reviewer*, `tree_index` for *Validé*), and a partially-staged file genuinely differs worktree-vs-index **and** index-vs-HEAD, so gix already emits it in **both**. Today's disjointness is an emergent side-effect of file-only staging, not an invariant.

**Decision:** accept the overlap. **Zero backend/wire schema change** — no new `StatusEntry` field, no tri-state. `partial` is *derived client-side* as `unstaged ∩ staged`. The diff content layer is already partial-ready (`use-diff-store` `sectionCache` is keyed by `{section, path}`), so a both-sections file renders only its remaining hunks in *À reviewer* and only its validated hunks in *Validé*, with independent `+N/−N`. `review-stats` is corrected so an overlapping file is counted once (`total = |unstaged ∪ staged|`, `reviewed = |staged \ unstaged|`); "Section 1 empty ⇒ everything reviewed" stays literally true because a partial file always keeps an unstaged entry.

## Options considered (backend mechanism)

### A. Backend-synthesized unified patch → `git apply --cached [--reverse]` — **chosen**
- **+** Reuses the existing, documented, isolated shell-out; `git apply` is atomic (all-or-nothing → no half-staged index) and is the exact mechanism every robust GUI uses (GitHub Desktop, Magit, vim-fugitive, VS Code). The patch synthesizer is a **pure, table-testable** function.
- **−** Keeps the `git`-binary dependency for writes; we own the patch-synthesis correctness. Mitigated by sourcing raw bytes (Finding 1), a content fingerprint (below), and TempRepo tests that assert the staged blob byte-for-byte.

### B. Native `gix` blob/index reconstruction (no shell-out) — **rejected**
- Would compute the target index-blob content and update the index entry natively — ideologically ideal (drops the `git` dependency). But `gix-index` add/remove is **still not a stable API**: `crate-status.md` lists it unchecked; only `dangerously_push_entry` + manual stat/mode exists, the writer is V2/V3-only and **drops index extensions** (UNTR/FSMN/split-index), and there is no `git apply` safety net. Contradicts `src-tauri/CLAUDE.md`. Kept as a long-horizon option for if/when gitoxide blesses it.

### Granularity is a phasing decision, not a third mechanism
Ship **whole-hunk** staging first (v1) — gitui's beloved granularity, ~80 % of the value, one hunk per patch reproducing gix's `@@` header **verbatim** (correct for forward *and* reverse apply, since gix's `after_hunk_start` is already the index-side position; `--recount` is the only backstop, no arithmetic). Line-level (v2) adds one `reverse`-parametrized transform (drop unselected `+`, convert unselected `−` to context; reverse mirrors) that recomputes only the counts.

## Decision

**Option A**: a Rust-synthesized unified patch built from **raw blob/worktree bytes**, applied with a single atomic `git apply --cached [--reverse] --recount --whitespace=nowarn -c core.autocrlf=false -c core.safecrlf=false`, kept inside `index_write.rs`. Overlap-as-partial data model (Finding 2). **Whole-hunk first, line-level second.**

**Staleness / TOCTOU guard.** The one inbound wire addition, `HunkSelection`, carries a content **`fingerprint`** (a stable hash of the rendered hunk's `(sign, content)` lines, computed identically front and back), not just the 4-integer header tuple — which cannot detect a same-count re-edit between render and click. `partial.rs` re-diffs the file fresh immediately before applying and rejects on tuple **or** fingerprint mismatch with `GitError::Index("le diff a changé, rechargez")`; the store always refreshes so the stale hunk disappears.

### Resolved sub-decisions

| # | Question | Decision |
|---|---|---|
| 1 | gitattributes clean-filter / eol | **Literal bytes (WYSIWYG)** — stage what was reviewed; `autocrlf`/`safecrlf` forced off. Rare divergence from a re-filtered `git add` accepted. |
| 2 | Progress granularity | **File-level** — a partial file counts as not-yet-reviewed. |
| 3 | Untracked / added / deleted in v1 | **Degrade to whole-file**; `/dev/null` create/delete patches come in v2. |
| 4 | Line-selection visual (v2) | **Row tint + thin left accent bar**, no gutter column (preserves `ROW_HEIGHT=20`). |
| 5 | Panel-local burn-down keyboard | **Deferred to v2**, shipped with line selection. |
| 6 | Reject / discard a hunk | **Out of scope** — separate, confirm-guarded effort (ROADMAP P0 #2) reusing this engine as `git apply --reverse` on the worktree. |
| 7 | `--3way` fallback | **No** — deterministic atomic apply; fresh re-diff + fingerprint already guarantee a clean apply. |
| 8 | Whole-file `stage_file`/`unstage_file` | **Kept** alongside the partial path (bulk "tout valider", non-`Modified` files). |

## Implementation topology

Full detail in the plan doc. Module shape:

- **`git/index_write.rs`** — add `exec_stdin` (patch streamed on a dedicated thread that swallows `BrokenPipe` so git's real stderr surfaces) and `apply_partial` (single atomic invocation); factor `map_spawn_err`/`map_exit` out of `exec` (no duplication); extend `reject_unsafe_str` to reject control bytes (`\n`/`\r`/NUL — the path is written into the patch header) and make it `pub(super)`.
- **`git/hunk_patch.rs`** *(new, pure)* — `raw_lines` (terminator-preserving split matching the tokenizer's line boundaries), `quote_path` (git c-style), `hunk_fingerprint`, `build_patch` (verbatim gix header, `old/new mode` lines only when a mode delta is present, no-newline marker derived from the raw line's tail). Fully table-tested.
- **`git/diff.rs`** — add `diff_one(repo, path, section)` returning the fresh `DiffFile` (byte-identical to what was displayed) plus the resolved old/new `(ObjectId, EntryMode)` sides; short-circuits the walk to one file. No walk logic duplicated elsewhere.
- **`git/partial.rs`** *(new, orchestration)* — `stage_partial`/`unstage_partial`: validate path, `diff_one`, reject non-`Modified` (→ whole-file degrade), fingerprint+tuple guard, read raw bytes, `build_patch`, `apply_partial_patch`.
- **`git/mod.rs`**, **`commands/mod.rs`**, **`lib.rs`** — `HunkSelection` (`Deserialize`), two `spawn_blocking` command wrappers, handler registration.
- **Frontend** — `lib/git.ts` (bindings + `HunkSelection`), `lib/hunk-fingerprint.ts` (mirrors the Rust hash, pinned by a colocated test so front/back cannot drift), `flatten-hunks.ts` (row identity), `diff-view.tsx` (hover IconButton gated to `changeKind==='modified'`), `diff-panel.tsx` (section + `HunkActions` context), `use-repo-store.ts` (partial actions that always refresh, even on failure), `review-stats.ts` (union/difference dedup), `sidebar.tsx`/`file-row.tsx`/`tree-view.tsx` (derived `partial` badge).

## Phasing

0. Backend pure core (`hunk_patch` + `apply_partial`) — not user-visible, fully unit-tested.
1. Orchestration + IPC (`diff_one`, `partial.rs`, commands, bindings, store) — invokable end-to-end (no UI); TempRepo tests prove byte fidelity + overlap.
2. Overlap counting (`review-stats`, `partial` badge) — correct burn-down even before the hunk UI.
3. **Hunk UI (v1)** — the hover button → **ROADMAP P0 #1 closed at hunk granularity**.
4. Line-level (v2) — `reverse`-transform, `/dev/null` create/delete patches, line-selection UI + panel-local keyboard.
5. Polish + docs — CRLF/whitespace/gitattributes verification; update this ADR's status notes, `src-tauri/CLAUDE.md`, ROADMAP.

## Consequences

**Positive**
- Closes the top P0 gap with a mechanism proven across the ecosystem, staying within the existing isolated shell-out — no new architectural surface, near-zero lock-in.
- Byte-faithful by construction (raw-byte sourcing + autocrlf/safecrlf off + atomic apply): CRLF, no-newline, non-UTF-8 preserved in the index blob.
- Zero schema/wire change for the data model; the diff store was already partial-ready.
- WYSIWYG invariant defended by the content fingerprint + always-refresh, not merely the header tuple.

**Negative & mitigations**
- *Still shells out for writes.* Accepted and documented; native gix (Option B) revisited only when gitoxide blesses index add/remove. The trait boundary keeps the swap local.
- *We own patch-synthesis correctness.* Pure functions + TempRepo tests asserting the staged blob byte-for-byte (CRLF, no-newline, non-UTF-8), plus the degrade paths and path quoting/rejection.
- *gitattributes clean-filter divergence.* A path with a content filter stages the reviewed literal bytes, which may differ from a re-filtered `git add`. Known limitation of all patch-based partial staging; the WYSIWYG stance makes it the *intended* behavior for a review tool.
- *Fingerprint collision on non-UTF-8.* Two distinct non-UTF-8 lines both mapping to U+FFFD could collide in the lossy hash — accepted extreme corner.

## Confirmation

- **Tests.** Rust `hunk_patch` table tests (verbatim header forward/reverse, `raw_lines` boundaries incl. final line without `\n` and a CRLF line, no-newline marker, mode lines, empty selection → `None`); Rust `partial.rs` TempRepo tests running **real `git apply`** and asserting `git cat-file blob :<path>` is byte-identical for CRLF / no-newline / non-UTF-8 files, the both-sections overlap, the unstage mirror, the fingerprint-rejects-a-same-tuple-re-edit case, and the degrade paths; Vitest for `flatten-hunks`, `hunk-fingerprint` (pinned serialization), `review-stats` (partial counted once), `use-diff-store` reconcile transitions, `use-repo-store` (refresh-on-failure), `diff-view` (button gated to `modified`). Biome + strict-TS gate passes.
- **Manual (`pnpm tauri dev`)** on WebKitGTK and WebView2: stage/unstage a single hunk of a multi-hunk file → it appears in both sections with the right hunks each side; a CRLF file stays CRLF after a partial stage; burn-down and the completion beat fire only at true "À reviewer empty".

## References

- git-apply / git-add-patch: <https://git-scm.com/docs/git-apply> · <https://github.com/git/git/blob/master/add-patch.c>
- lazygit patch transform (forward/reverse primitive): <https://github.com/jesseduffield/lazygit/blob/master/pkg/commands/patch/transform.go>
- Magit new_start recomputation: <https://github.com/magit/magit/issues/3182>
- git-cola diff parsing: <https://github.com/git-cola/git-cola/blob/main/cola/diffparse.py>
- gitoxide crate status (native index add/remove still absent): <https://github.com/GitoxideLabs/gitoxide/blob/main/crate-status.md>
- Implementation plan (this decision, expanded): [`docs/reference/partial-staging-plan.md`](../reference/partial-staging-plan.md)
- Precedent: [ADR 0001 — diff rendering architecture](0001-diff-rendering-architecture.md)

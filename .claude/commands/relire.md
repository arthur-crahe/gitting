---
description: Deep multi-agent code review of a chosen scope, then verified fixes, a whole-repo AI-slop sweep, and seamless integration. Production-grade; no auto-commit.
argument-hint: "[local | staged | last | <sha> | <refA>..<refB> | since <ref>]  (default: local uncommitted)"
---

You are running a **deep, industrial-grade code review** of this repository. Context is professional and in production — **no right to error**. Take everything seriously, ground every claim in real code, and **never hallucinate findings** (if the code is clean, say so plainly — do not invent problems to look thorough). The dense WHY-comments this codebase favours (WebKitGTK constraints, gix specifics, focus lifecycles, IME guards) are **valuable, not slop**.

Run the four phases below **in order**. The review (Phase 1) must be **complete, written into the session, and independent** before any fix is applied.

---

## 0 — Resolve the review scope from `$ARGUMENTS`

`$ARGUMENTS` selects WHAT is under review; everything downstream is identical regardless of scope.

| `$ARGUMENTS` | Scope | How to inspect |
|---|---|---|
| *(empty)*, `local`, `working` | **Local uncommitted changes** (default) — staged + unstaged + untracked vs `HEAD` | `git status --porcelain`; `git diff HEAD -- <file>`; untracked files (`git ls-files --others --exclude-standard`) are wholly new |
| `staged` | Staged changes only | `git diff --staged` |
| `last`, `head` | The last commit | `git diff HEAD~1..HEAD` (root commit: `git show HEAD`) |
| `<sha>` | One commit | `git diff <sha>^..<sha>` (root: `git show <sha>`) |
| `<refA>..<refB>` / `<refA>...<refB>` | A commit range | `git diff <range>` |
| `since <ref>` | `<ref>..HEAD` | `git diff <ref>..HEAD` |

First, **resolve the scope and build the file inventory** (`git diff --name-status <scope>` + numstat). If the scope is empty of changes, report that and stop. Read the project's `CLAUDE.md` files and `docs/reference/` to ground yourself in the conventions and the design system. Read the highest-risk logic files yourself so you can independently adjudicate findings later.

---

## 1 — Deep multi-agent review (written, independent, NO fixes yet)

Drive this with the **`Workflow`** tool (multi-agent is the default given the scale). Build a workflow with these phases:

**Map** — a few parallel agents produce a shared brief: (a) a **business / functional** map of the change, (b) a **technical architecture** map (component tree, stores/data flow, backend, anything computed twice or in the wrong layer), (c) a **per-file coverage** map (purpose + test status of every changed/created file).

**Review** — ~9 parallel dimensional reviewers, each grounded in the brief and reading the real diff + files, covering the WHOLE scope (not file-by-file box-ticking; take a macro step back per dimension):
1. Correctness / bugs — core logic
2. Correctness / bugs — secondary logic & backend
3. Correctness / bugs — rendering, lifecycle, effects, a11y
4. Performance (re-renders, selectors, memo, IPC, hot paths, duplicated work)
5. Architecture / SRP / decomposition / maintainability — question the choices
6. Functional gaps & edge cases (business completeness, all states)
7. Duplication / DRY & dead code
8. Docs — JSDoc + Rust doc completeness AND accuracy; reference-doc drift
9. Consistency — naming, patterns, store/binding conventions, CSS/design-system

Each reviewer returns **structured findings** (title, severity blocker/major/minor/nit, category, file:line, problem, quoted evidence, impact, recommendation, confidence) plus a macro note.

**Verify** — adversarially verify **every** finding with an independent agent that reads the actual code and tries to **refute** it; default to refuted/uncertain when not clearly substantiated. Only `confirmed` findings are actionable.

**Synthesis** — collect the maps, macro notes, and verified findings. Then **write the full review into the session yourself**: a verdict, the confirmed findings grouped by severity (each cross-checked against your own reading), a macro architectural assessment, and an explicit list of verified non-defects (refuted/uncertain) so nothing is acted on blindly. Scale the fan-out to the change: a few finders for a small scope, a larger pool + multi-vote verification for a large/"audit" one.

---

## 2 — Apply the fixes (after the review is written)

For **each confirmed finding**, re-verify it is real against the live code, then apply the fix. Address all of them; if you deliberately skip one, state the rationale. Resolve duplicate findings (same root) once. You may reconsider the decomposition/architecture/implementation where a clearly-better structure exists.

## 3 — Whole-repo AI-slop sweep

Independently of the scope, sweep the **whole repo** for slop: comments that merely restate the code, filler/AI-tic prose, commented-out or dead code/types/exports/CSS, stray or duplicate `.md`/scaffolding files, debug leftovers, emoji. Fan out per directory if it helps. Flag ONLY genuine slop — valuable rationale comments stay. Remove what you find.

## 4 — Seamless integration (your fixes **and** pre-existing patches)

Make the reviewed code read **as if it had always been written correctly from the start**, with no trace of *when* or *how* anything was patched. This covers **two** sources:

1. **The fixes you applied in Phase 2** — fold them in natively.
2. **Fixes/patches already present in the code under review** — the code picked up at the start of the review may itself carry the scars of earlier corrections (by anyone, at any time). Detect and smooth those out **too**; they are in scope even though you did not write them.

In both cases, remove every tell of after-the-fact patching: comments alluding to a "fix"/"bug"/history or to what the code "used to" / "no longer" / "now" does; workaround / rustine markers; defensive bolt-ons grafted *beside* the original instead of folded *into* it; and shapes that betray a patch rather than a design. Rewrite / rename / reshape into the structure an original-correct implementation would have had — while preserving behaviour (the gate must stay green). The end state is a **uniform** codebase where nothing reads as "added later."

---

## Control points & close-out

- The review is **complete and presented before any fix**; **verify-before-fix** on every finding; **never hallucinate**.
- Run the **full gate green** before declaring done:
  `pnpm lint && pnpm typecheck && pnpm test`, and the Rust backend `cargo test` (binary lives at `~/.cargo/bin/cargo`; manifest `src-tauri/Cargo.toml`; do **not** run `cargo fmt`).
- Be honest about anything you could not verify (e.g. no GUI smoke-test for visual/IPC changes — flag it).
- **Do not commit or push.** Leave the fixes in the working tree, then report: what was confirmed, fixed, swept, and any verified non-defects left untouched.

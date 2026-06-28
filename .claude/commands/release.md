---
description: Cut a Gitting release end-to-end — bump the version everywhere, run the quality gate, commit, tag, and push so the GitHub Actions pipeline builds a draft Release.
argument-hint: "[version X.Y.Z | patch | minor | major]"
disable-model-invocation: true
allowed-tools: Read, Edit, Bash(git status:*), Bash(git rev-parse:*), Bash(git fetch:*), Bash(git ls-remote:*), Bash(git tag:*), Bash(git add:*), Bash(git commit:*), Bash(git push:*), Bash(git log:*), Bash(pnpm:*)
---

# Release Gitting

Cut a full release for version/bump: **$1**

## Current state
- Branch: !`git rev-parse --abbrev-ref HEAD`
- Working tree (empty = clean): !`git status --short`
- Existing release tags: !`git tag --list 'app-v*' --sort=-v:refname`

## Procedure

Do these in order. **Stop and report immediately if any check fails — never push a half-finished release.**

1. **Preconditions.** Abort unless all hold:
   - current branch is `main`;
   - the working tree is clean (no uncommitted changes);
   - `main` is up to date with the remote — run `git fetch --tags origin`, then confirm `git rev-parse main` equals `git rev-parse origin/main`.

2. **Resolve the target version** from `$1` and the current `version` in `src-tauri/tauri.conf.json`:
   - a semver `X.Y.Z` → use it as-is;
   - `patch` / `minor` / `major` → increment the current version accordingly.
   The target must be **≥** the current version, and the tag `app-v<target>` must not already exist **on the remote** — verify with `git ls-remote --tags origin "app-v<target>"` and abort if it returns anything. State the resolved version explicitly.

3. **Quality gate** — run all, require each to pass, abort on the first failure:
   - `pnpm install --frozen-lockfile`
   - `pnpm typecheck`
   - `pnpm lint`
   - `pnpm test`

4. **Bump the version** to the target — it must be identical across all four files:
   - `src-tauri/tauri.conf.json` → `"version"`
   - `package.json` → `"version"`
   - `src-tauri/Cargo.toml` → `[package]` `version`
   - `src-tauri/Cargo.lock` → the `version` line in the `name = "gitting"` package block (match it in context; other packages may share the same number)

   Skip this step if the target already equals the current version (e.g. the very first release) — then there is no bump commit and the tag lands on the current `HEAD`, so make sure `HEAD` is the intended release point.

5. **Generate the changelog** — this section becomes the body of the GitHub Release, so write it **for the people who use Gitting**, in French, not as a commit log. CI extracts it from `CHANGELOG.md` by version and appends the download line.
   - **Source range = everything since the last release.** Previous tag = the most recent existing `app-v*` tag (top of the list above); range = `<prev-tag>..HEAD`. First release ever → full history. Read the commits with `git log <range> --no-merges --pretty=format:'%s'`.
   - **Curate, don't transcribe.** Turn commits into what a user actually notices, in plain French. Several commits may collapse into one bullet; many commits produce no bullet at all. Use these headings, in this order, omitting any that end up empty:
     - `### Nouveautés` — user-visible capabilities (a `feat` that changes the UI/UX/behaviour). Say what they can now do, never how it's built.
     - `### Corrections` — bugs a user could actually have hit (a `fix` with a visible effect). Name the symptom that's gone.
     - `### Autres améliorations` — collapse whole internal categories into **one generic line each, no detail**: performance → `Améliorations de performance`; security/hardening → `Améliorations de sécurité`; an internal refactor worth a nod → `Refactorisation interne`.
   - **Omit entirely** (zero user value): code review, `chore`, `test`, `ci`, `build`, `style`, `docs`/ADR, dependency bumps, and any `feat`/`fix`/`refactor` that is pure internal plumbing with no user-visible effect.
   - If nothing is user-visible after curation, the whole body is a single line: `Améliorations internes et corrections.`
   - `Read` `CHANGELOG.md`, then with `Edit` replace the anchor line `<!-- release:anchor — /release inserts the new version section directly below this line -->` with **itself followed by** a blank line and the new section, so the newest version lands directly under the anchor (newest-first), above the previous one:
     ```
     ## [<target>] - <today's date, YYYY-MM-DD>

     ### Nouveautés
     - …
     ```
   - Do **not** write the download instruction here — CI appends it. Match the heading style and bullet format of the existing sections exactly.

6. **Commit** the bump and changelog — skip if nothing changed: `git add CHANGELOG.md` (covers a first-time file), then `git commit -am "chore(release): v<target>"` (the `-am` stages the four edited version files).

7. **Verify, then tag.** Re-read `src-tauri/tauri.conf.json` and confirm its `version` is exactly `<target>` — the pipeline derives the Release tag from this, so it MUST equal the git tag; abort on mismatch. Then `git tag app-v<target>` ← the `app-v` prefix is what triggers `.github/workflows/release.yml`.

8. **Push**: `git push origin main`, then `git push origin app-v<target>`.

9. **Report**:
   - the tag and version pushed;
   - the pipeline run → https://github.com/arthur-crahe/gitting/actions
   - that a **draft** Release will appear at https://github.com/arthur-crahe/gitting/releases once the `ubuntu-22.04` + `windows-latest` matrix finishes, with the generated changelog as its description and the installers (.deb/.rpm/.AppImage/.exe/.msi) attached.

**Do NOT publish the Release.** The pipeline creates it as a draft on purpose — the user reviews and publishes it.

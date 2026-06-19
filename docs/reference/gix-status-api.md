# gix status API (verified against gix v0.80.0)

How the app reads git status through `gix` (gitoxide), the single read backend.
All paths and types below were verified against the **gix v0.80.0** source tree
(tag `gix-v0.80.0`); the canonical consumer reference is
`gitoxide-core/src/repository/status.rs`.

## Cargo features

```toml
gix = { version = "0.80", features = ["status", "parallel"] }
```

- `status` is **not** a default feature; it transitively pulls in `dirwalk`,
  `index`, and `blob-diff`.
- `parallel` enables the multi-threaded index↔worktree walk and makes
  `gix::Repository: Send`. (Opening the repo *inside* a `spawn_blocking` closure
  also sidesteps the `Send` question, since only an owned `String` is captured.)
- Default features stay on for a C-free zlib backend (avoid `max-performance`,
  which pulls `zlib-ng` and a C toolchain).

## One pass yields both comparisons

`repo.status(progress)?.into_iter(patterns)?` returns an iterator that yields
**both** comparisons interleaved — you match on the `Item` variant, you do not
run two iterations:

- `status::Item::IndexWorktree(..)` → **index vs. working tree** = unstaged
  ("À reviewer").
- `status::Item::TreeIndex(..)` → **HEAD-tree vs. index** = staged ("Validé").
  An **unborn HEAD** (fresh repo, no commits) is treated as the empty tree, so
  every staged file surfaces as an `Addition` — no special-casing needed.

`patterns` is a pathspec filter; pass `None::<gix::bstr::BString>` for "everything".
Pass `gix::progress::Discard` as the progress argument when not surfacing progress.

## The facade path for the worktree-status plumbing

The unstaged `Modification.status` field is a plumbing type from the `gix-status`
crate, which is **not** re-exported at the `gix` crate root. It *is* reachable via
the porcelain module — `gix/src/status/mod.rs` has `pub use gix_status as plumbing;`:

```rust
use gix::status::plumbing::index_as_worktree::{Change, EntryStatus};
```

This keeps us on the `gix` facade (no direct `gix-status` dependency to version-sync).

## Reading each variant

```rust
use gix::bstr::{BString, ByteSlice};
use gix::status::{self, index_worktree};
use gix::status::plumbing::index_as_worktree::{Change as WorktreeChange, EntryStatus};

let iter = repo.status(gix::progress::Discard)?.into_iter(None::<BString>)?;
for item in iter {
    match item? {
        // Staged: HEAD-tree vs index. `change.fields()` → (&BStr location, usize, Mode, &oid).
        // Match on `&change` so the borrowed `location` stays valid.
        status::Item::TreeIndex(change) => {
            let (location, ..) = change.fields();
            let _path = location.to_str_lossy().into_owned();
            match &change {
                gix::diff::index::Change::Addition { .. } => { /* Added */ }
                gix::diff::index::Change::Deletion { .. } => { /* Deleted */ }
                gix::diff::index::Change::Modification { .. } => { /* Modified */ }
                gix::diff::index::Change::Rewrite { .. } => { /* Renamed */ }
            }
        }
        // Unstaged: a tracked file changed in the worktree.
        status::Item::IndexWorktree(index_worktree::Item::Modification { rela_path, status, .. }) => {
            match status {
                EntryStatus::Conflict { .. }   => { /* Conflict */ }
                EntryStatus::IntentToAdd       => { /* Added (git add -N) */ }
                EntryStatus::NeedsUpdate(_)    => { /* stat-only refresh — NOT a change, skip */ }
                EntryStatus::Change(c) => match c {
                    WorktreeChange::Removed                 => { /* Deleted */ }
                    WorktreeChange::Type { .. }             => { /* TypeChange */ }
                    WorktreeChange::Modification { .. }     => { /* Modified */ }
                    WorktreeChange::SubmoduleModification(_) => { /* Modified */ }
                },
            }
            let _ = rela_path; // BString, repo-relative
        }
        // Unstaged: untracked entry (only when collapsed status is None).
        status::Item::IndexWorktree(index_worktree::Item::DirectoryContents { entry, collapsed_directory_status }) => {
            if collapsed_directory_status.is_none() { /* Untracked: entry.rela_path */ }
        }
        // Unstaged: rename/copy detected in the worktree.
        status::Item::IndexWorktree(index_worktree::Item::Rewrite { dirwalk_entry, .. }) => {
            let _ = dirwalk_entry.rela_path; // destination path
        }
    }
}
```

Gotchas:
- `EntryStatus::NeedsUpdate` is a stat-only refresh, **not** a content change — drop it
  or it shows up as a false pending item.
- Untracked classification keys off the entry's own `entry.status ==
  gix::dir::entry::Status::Untracked` (as gix's own `Item::summary()` does), **not**
  `collapsed_directory_status`: under the default dirwalk options
  (`emit_collapsed: None`) that field is always `None`, so it is not a usable filter.
- Staged (tree↔index) rename detection is **on by default**: `repo.status(..)` sets
  `tree_index_renames = TrackRenames::AsConfigured`, which honors
  `status.renames`/`diff.renames` and performs rename detection when nothing is
  configured. `.tree_index_track_renames(..)` is an override/disable knob, not a
  prerequisite — so a staged rename surfaces as a single `Rewrite` (→ `Renamed`).
- Unstaged (index↔worktree) rename detection is **off by default** (`rewrites: None`);
  without it an unstaged rename appears as a deletion + an untracked addition. Enable
  it with `.index_worktree_rewrites(Some(gix::diff::Rewrites::default()))` to get one
  `IndexWorktree(Item::Rewrite { .. })` (→ `Renamed`), as this app does.
- Paths come out repo-relative as `BStr`/`BString` (`.to_str_lossy()`), or use
  `gix::path::from_bstr(..)` for an OS `Path`.
- `gix::Repository` is `Send` (with `parallel`) but **not** `Sync` — don't share one
  across an async boundary; open per call inside `spawn_blocking`.

## Repository identity

- `repo.workdir() -> Option<&Path>` — working-tree root (`None` for a bare repo).
- `repo.head_name() -> Result<Option<gix::refs::FullName>>` — `None` on detached
  HEAD; on unborn HEAD still yields the branch the next commit lands on.
  `name.shorten()` → `&BStr` for the short branch name.

## Sources

- gitoxide v0.80.0 — `gitoxide-core/src/repository/status.rs` (canonical consumer)
- `gix/src/status/mod.rs` (`pub use gix_status as plumbing;`)
- <https://docs.rs/gix/0.80.0/gix/status/>

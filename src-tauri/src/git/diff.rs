//! Structured per-file diffs for the two review sections, built from `gix`'s
//! own blob diff so the hunks the frontend renders are exactly the hunks that
//! staging (or unstaging) the file would apply — the ADR's fidelity invariant.
//!
//! Both entry points enumerate the same status iterator as [`super::status`] —
//! `TreeIndex` items for the staged section (HEAD-tree → index), `IndexWorktree`
//! items for the unstaged one (index → worktree) — so the file lists and the
//! diffs always agree. Each changed file's two blobs are fed to the `gix` blob
//! pipeline; its unified-diff sink hands us hunks, which we lower into the
//! [`DiffFile`] wire shape.

use std::path::Path;

use gix::bstr::ByteSlice;
use gix::diff::blob::pipeline::{Mode, WorktreeRoots};
use gix::diff::blob::platform::prepare_diff::Operation;
use gix::diff::blob::unified_diff::{ConsumeHunk, ContextSize, DiffLineKind as BlobLineKind, HunkHeader};
use gix::diff::blob::{Platform, ResourceKind, UnifiedDiff};
use gix::diff::index::Change;
use gix::object::tree::EntryKind;
use gix::status::{self, index_worktree::Item as WorktreeItem};
use gix::ObjectId;

use super::error::GitError;
use super::status::{path_string, staged_kind, status_iter, worktree_kind};
use super::{ChangeKind, DiffFile, DiffLineKind, Hunk, Line};

/// An index-entry file mode, as carried by both status sides.
type EntryMode = gix::index::entry::Mode;

/// One side of a file diff: its blob object id and mode.
type Blob = (ObjectId, EntryMode);

/// Reads the staged section's diff: for each file changed between the HEAD tree
/// and the index, the git-faithful hunks that unstaging it would revert.
pub fn diff_staged(path: &Path) -> Result<Vec<DiffFile>, GitError> {
    let repo = super::repo::discover(path)?;
    let null = ObjectId::null(repo.object_hash());
    let mut cache = repo
        .diff_resource_cache(Mode::ToGit, WorktreeRoots::default())
        .map_err(|e| GitError::Diff(e.to_string()))?;

    let mut out = Vec::new();
    for item in status_iter(&repo)? {
        if let status::Item::TreeIndex(change) = item? {
            out.push(staged_file(&repo, &mut cache, change, null)?);
        }
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

/// Reads the unstaged section's diff: for each file changed between the index
/// and the working tree, the git-faithful hunks that validating it would stage.
pub fn diff_unstaged(path: &Path) -> Result<Vec<DiffFile>, GitError> {
    let repo = super::repo::discover(path)?;
    let workdir = repo.workdir().ok_or(GitError::Bare)?.to_owned();
    let null = ObjectId::null(repo.object_hash());
    // The new side is read from the worktree (`new_root` + a null blob id);
    // `BinaryToText` lets gix decide the binary short-circuit faithfully.
    let mut cache = repo
        .diff_resource_cache(
            Mode::ToWorktreeAndBinaryToText,
            WorktreeRoots {
                old_root: None,
                new_root: Some(workdir),
            },
        )
        .map_err(|e| GitError::Diff(e.to_string()))?;

    let mut out = Vec::new();
    for item in status_iter(&repo)? {
        if let status::Item::IndexWorktree(item) = item? {
            if let Some(file) = unstaged_file(&repo, &mut cache, item, null)? {
                out.push(file);
            }
        }
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

/// Lowers one staged change (HEAD-tree → index) into a [`DiffFile`].
fn staged_file(
    repo: &gix::Repository,
    cache: &mut Platform,
    change: Change,
    null: ObjectId,
) -> Result<DiffFile, GitError> {
    let (path, kind, old, new) = staged_sides(change);
    assemble(repo, cache, path, kind, old, new, null)
}

/// Extracts a staged change's path, [`ChangeKind`] and old/new blob sides —
/// shared by [`staged_file`] and [`diff_one`], so the single-file path re-derives
/// the sides identically to the full-section walk.
fn staged_sides(change: Change) -> (String, ChangeKind, Option<Blob>, Option<Blob>) {
    let kind = staged_kind(&change);
    // The kind comes from the shared classifier above; this match only extracts
    // each variant's path and its old/new blob sides for the diff pipeline.
    let (path, old, new): (String, Option<Blob>, Option<Blob>) = match change {
        Change::Addition {
            location,
            entry_mode,
            id,
            ..
        } => (
            path_string(&location),
            None,
            Some((id.into_owned(), entry_mode)),
        ),
        Change::Deletion {
            location,
            entry_mode,
            id,
            ..
        } => (
            path_string(&location),
            Some((id.into_owned(), entry_mode)),
            None,
        ),
        Change::Modification {
            location,
            previous_entry_mode,
            previous_id,
            entry_mode,
            id,
            ..
        } => (
            path_string(&location),
            Some((previous_id.into_owned(), previous_entry_mode)),
            Some((id.into_owned(), entry_mode)),
        ),
        Change::Rewrite {
            source_entry_mode,
            source_id,
            location,
            entry_mode,
            id,
            ..
        } => (
            path_string(&location),
            Some((source_id.into_owned(), source_entry_mode)),
            Some((id.into_owned(), entry_mode)),
        ),
    };
    (path, kind, old, new)
}

/// Lowers one unstaged change (index → worktree) into a [`DiffFile`], or `None`
/// for an entry that is not a pending review item (a stat-only `NeedsUpdate`).
fn unstaged_file(
    repo: &gix::Repository,
    cache: &mut Platform,
    item: WorktreeItem,
    null: ObjectId,
) -> Result<Option<DiffFile>, GitError> {
    match item {
        WorktreeItem::Modification {
            entry,
            rela_path,
            status,
            ..
        } => {
            let Some(kind) = worktree_kind(status) else {
                return Ok(None);
            };
            let path = path_string(&rela_path);
            // A conflicted file, or a type change (blob ↔ symlink ↔ directory),
            // has no single meaningful index→worktree line diff in the review
            // model — and the new side of a type change may not even be a readable
            // blob. Surface either without hunks for a dedicated notice rather than
            // handing a non-blob worktree entry to the diff pipeline.
            if matches!(kind, ChangeKind::Conflict | ChangeKind::TypeChange) {
                return Ok(Some(notice(path, kind)));
            }
            // old = the index blob; new = the worktree (a null id read via the
            // cache's `new_root`). An intent-to-add entry already carries a null
            // id, so its old side reads as empty and the whole file is an add.
            let old = Some((entry.id, entry.mode));
            Ok(Some(assemble(repo, cache, path, kind, old, None, null)?))
        }
        WorktreeItem::DirectoryContents { entry, .. } => {
            if !matches!(entry.status, gix::dir::entry::Status::Untracked) {
                return Ok(None);
            }
            let path = path_string(&entry.rela_path);
            // Only a regular file has a blob the diff pipeline can open. The walk
            // recurses into untracked directories (so each contained file arrives
            // here as its own `File` entry), but a nested repository, a symlink, or
            // a non-regular file (FIFO, socket) still surfaces as one non-`File`
            // entry with no readable blob: reading it as text would fail and blank
            // the whole section, so list it without hunks instead.
            if !matches!(entry.disk_kind, Some(gix::dir::entry::Kind::File)) {
                return Ok(Some(notice(path, ChangeKind::Untracked)));
            }
            // old absent (empty), new = the untracked worktree file.
            Ok(Some(assemble(repo, cache, path, ChangeKind::Untracked, None, None, null)?))
        }
        WorktreeItem::Rewrite { dirwalk_entry, .. } => {
            // The rename is reflected in the file list; its content diff against
            // the renamed-from index blob is a later refinement (no hunks here).
            Ok(Some(notice(path_string(&dirwalk_entry.rela_path), ChangeKind::Renamed)))
        }
    }
}

/// A [`DiffFile`] with no hunks — for files we list but do not render
/// line-by-line (a conflict, or an unstaged rename pending content support).
fn notice(path: String, change_kind: ChangeKind) -> DiffFile {
    DiffFile {
        path,
        change_kind,
        old_mode: None,
        new_mode: None,
        is_binary: false,
        hunks: Vec::new(),
    }
}

/// Sets the two diff resources and runs the blob pipeline, assembling the
/// resulting hunks (or the binary flag) into a [`DiffFile`].
///
/// A `None` side is rendered as an absent (empty) resource via the null blob id;
/// in the unstaged cache that same null id on the new side instead reads the
/// working-tree file, which is how a worktree edit is diffed.
fn assemble(
    repo: &gix::Repository,
    cache: &mut Platform,
    path: String,
    change_kind: ChangeKind,
    old: Option<Blob>,
    new: Option<Blob>,
    null: ObjectId,
) -> Result<DiffFile, GitError> {
    let old_mode = old.and_then(|(_, m)| octal_mode(m));
    let new_mode = new.and_then(|(_, m)| octal_mode(m));
    // The resource mode is only used to pick filters; the present side wins.
    let kind = new
        .and_then(|(_, m)| entry_kind(m))
        .or_else(|| old.and_then(|(_, m)| entry_kind(m)))
        .unwrap_or(EntryKind::Blob);

    // A gitlink/submodule (`Commit`) or directory (`Tree`) entry has no blob the
    // diff pipeline can open — `set_resource` rejects those modes. List it with
    // its modes but no line-by-line hunks, alongside binaries and conflicts.
    if matches!(kind, EntryKind::Commit | EntryKind::Tree) {
        return Ok(DiffFile {
            path,
            change_kind,
            old_mode,
            new_mode,
            is_binary: false,
            hunks: Vec::new(),
        });
    }

    let rela = path.as_bytes().as_bstr();
    cache
        .set_resource(old.map_or(null, |(id, _)| id), kind, rela, ResourceKind::OldOrSource, &repo.objects)
        .map_err(|e| GitError::Diff(e.to_string()))?;
    cache
        .set_resource(new.map_or(null, |(id, _)| id), kind, rela, ResourceKind::NewOrDestination, &repo.objects)
        .map_err(|e| GitError::Diff(e.to_string()))?;

    let prep = cache.prepare_diff().map_err(|e| GitError::Diff(e.to_string()))?;
    let (is_binary, hunks) = match prep.operation {
        Operation::SourceOrDestinationIsBinary => (true, Vec::new()),
        // An external diff driver opts out of structured hunks; list it plainly.
        Operation::ExternalCommand { .. } => (false, Vec::new()),
        Operation::InternalDiff { algorithm } => {
            let input = prep.interned_input();
            let sink = UnifiedDiff::new(&input, HunkCollector::default(), ContextSize::symmetrical(3));
            let hunks = gix::diff::blob::diff(algorithm, &input, sink)
                .map_err(|e| GitError::Diff(e.to_string()))?;
            (false, hunks)
        }
    };

    Ok(DiffFile {
        path,
        change_kind,
        old_mode,
        new_mode,
        is_binary,
        hunks,
    })
}

/// A unified-diff sink that lowers `gix` hunk lines into our [`Hunk`]/[`Line`]
/// wire shape, deriving the 1-based per-side line numbers from the (already
/// 1-based) hunk header.
#[derive(Default)]
struct HunkCollector {
    hunks: Vec<Hunk>,
}

impl ConsumeHunk for HunkCollector {
    type Out = Vec<Hunk>;

    fn consume_hunk(&mut self, header: HunkHeader, lines: &[(BlobLineKind, &[u8])]) -> std::io::Result<()> {
        let mut old_no = header.before_hunk_start;
        let mut new_no = header.after_hunk_start;
        let mut out = Vec::with_capacity(lines.len());
        for &(kind, bytes) in lines {
            let content = bytes.to_str_lossy().into_owned();
            match kind {
                BlobLineKind::Context => {
                    out.push(Line { kind: DiffLineKind::Context, old_no: Some(old_no), new_no: Some(new_no), content });
                    old_no += 1;
                    new_no += 1;
                }
                BlobLineKind::Remove => {
                    out.push(Line { kind: DiffLineKind::Delete, old_no: Some(old_no), new_no: None, content });
                    old_no += 1;
                }
                BlobLineKind::Add => {
                    out.push(Line { kind: DiffLineKind::Add, old_no: None, new_no: Some(new_no), content });
                    new_no += 1;
                }
            }
        }
        self.hunks.push(Hunk {
            old_start: header.before_hunk_start,
            old_lines: header.before_hunk_len,
            new_start: header.after_hunk_start,
            new_lines: header.after_hunk_len,
            lines: out,
        });
        Ok(())
    }

    fn finish(self) -> Self::Out {
        self.hunks
    }
}

/// The `EntryKind` of an index mode, or `None` for a mode with no tree-entry
/// equivalent. A gitlink yields `Some(EntryKind::Commit)`, so callers must guard
/// non-blob kinds before handing the resource to the blob pipeline.
fn entry_kind(mode: EntryMode) -> Option<EntryKind> {
    mode.to_tree_entry_mode().map(|m| m.kind())
}

/// The octal mode string (e.g. `"100644"`) of an index mode, or `None` for a
/// mode that does not map to a tree entry.
fn octal_mode(mode: EntryMode) -> Option<String> {
    let octal = match entry_kind(mode)? {
        EntryKind::Tree => "40000",
        EntryKind::Blob => "100644",
        EntryKind::BlobExecutable => "100755",
        EntryKind::Link => "120000",
        EntryKind::Commit => "160000",
    };
    Some(octal.to_owned())
}

/// One file's fresh diff plus the object ids of its two sides — the input to
/// partial (hunk) staging. `new_id` is `None` in the unstaged section, where the
/// new side is the worktree file read from disk rather than a stored blob.
pub(super) struct FileSides {
    /// The fresh per-file diff, byte-identical to what the panel renders.
    pub file: DiffFile,
    /// Object id of the old side (index blob when staging, `HEAD` blob when
    /// unstaging), or `None` when that side is absent.
    pub old_id: Option<ObjectId>,
    /// Object id of the new side (the index blob when unstaging), or `None` in the
    /// unstaged section where the new side is the worktree file.
    pub new_id: Option<ObjectId>,
}

/// Re-diffs a single `file` in one section — the staged section (HEAD-tree →
/// index) when `staged`, else the unstaged one (index → worktree) — returning its
/// fresh [`DiffFile`] and the object ids of its two sides. The status walk
/// short-circuits once the file matches, so the expensive blob diff runs for that
/// one file only. `None` if the file is not currently changed in that section.
pub(super) fn diff_one(path: &Path, file: &str, staged: bool) -> Result<Option<FileSides>, GitError> {
    let repo = super::repo::discover(path)?;
    let null = ObjectId::null(repo.object_hash());

    if staged {
        let mut cache = repo
            .diff_resource_cache(Mode::ToGit, WorktreeRoots::default())
            .map_err(|e| GitError::Diff(e.to_string()))?;
        for item in status_iter(&repo)? {
            if let status::Item::TreeIndex(change) = item? {
                let (p, kind, old, new) = staged_sides(change);
                if p != file {
                    continue;
                }
                let df = assemble(&repo, &mut cache, p, kind, old, new, null)?;
                return Ok(Some(FileSides {
                    old_id: old.map(|(id, _)| id),
                    new_id: new.map(|(id, _)| id),
                    file: df,
                }));
            }
        }
        return Ok(None);
    }

    let workdir = repo.workdir().ok_or(GitError::Bare)?.to_owned();
    let mut cache = repo
        .diff_resource_cache(
            Mode::ToWorktreeAndBinaryToText,
            WorktreeRoots { old_root: None, new_root: Some(workdir) },
        )
        .map_err(|e| GitError::Diff(e.to_string()))?;
    for item in status_iter(&repo)? {
        let status::Item::IndexWorktree(wt) = item? else {
            continue;
        };
        match wt {
            WorktreeItem::Modification { entry, rela_path, status, .. } => {
                let p = path_string(&rela_path);
                if p != file {
                    continue;
                }
                let Some(kind) = worktree_kind(status) else {
                    return Ok(None);
                };
                // A conflict or type change has no line diff to stage partially;
                // carry it hunkless so the caller rejects it on `change_kind`.
                if matches!(kind, ChangeKind::Conflict | ChangeKind::TypeChange) {
                    return Ok(Some(FileSides { file: notice(p, kind), old_id: None, new_id: None }));
                }
                let old = Some((entry.id, entry.mode));
                let df = assemble(&repo, &mut cache, p, kind, old, None, null)?;
                return Ok(Some(FileSides { old_id: old.map(|(id, _)| id), new_id: None, file: df }));
            }
            WorktreeItem::DirectoryContents { entry, .. } => {
                let p = path_string(&entry.rela_path);
                if p != file {
                    continue;
                }
                if !matches!(entry.status, gix::dir::entry::Status::Untracked) {
                    return Ok(None);
                }
                // Only a regular untracked file has a blob the pipeline can open; a
                // directory/symlink/non-regular entry stays hunkless (the caller
                // then degrades it to whole-file staging).
                if !matches!(entry.disk_kind, Some(gix::dir::entry::Kind::File)) {
                    return Ok(Some(FileSides { file: notice(p, ChangeKind::Untracked), old_id: None, new_id: None }));
                }
                // old absent (empty → a creation patch); new = the worktree file.
                let df = assemble(&repo, &mut cache, p, ChangeKind::Untracked, None, None, null)?;
                return Ok(Some(FileSides { file: df, old_id: None, new_id: None }));
            }
            WorktreeItem::Rewrite { dirwalk_entry, .. } => {
                let p = path_string(&dirwalk_entry.rela_path);
                if p != file {
                    continue;
                }
                return Ok(Some(FileSides { file: notice(p, ChangeKind::Renamed), old_id: None, new_id: None }));
            }
        }
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::{diff_staged, diff_unstaged};
    use crate::git::test_support::TempRepo;
    use crate::git::{ChangeKind, DiffFile, DiffLineKind};

    /// A flat `(kind, old_no, new_no, content)` view across all hunks of a file.
    fn flat(file: &DiffFile) -> Vec<(DiffLineKind, Option<u32>, Option<u32>, &str)> {
        file.hunks
            .iter()
            .flat_map(|h| {
                h.lines
                    .iter()
                    .map(|l| (l.kind, l.old_no, l.new_no, l.content.as_str()))
            })
            .collect()
    }

    /// The single changed file, asserting there is exactly one.
    fn only(files: &[DiffFile]) -> &DiffFile {
        assert_eq!(files.len(), 1, "expected one changed file, got {}", files.len());
        &files[0]
    }

    #[test]
    fn unstaged_modification_has_faithful_lines_and_numbers() {
        let repo = TempRepo::init();
        repo.write("a.txt", "a\nb\nc\n");
        repo.stage("a.txt");
        repo.commit("add a.txt");

        repo.write("a.txt", "a\nB\nc\n");
        let files = diff_unstaged(repo.path()).expect("diff");
        let file = only(&files);
        assert_eq!(file.path, "a.txt");
        assert!(matches!(file.change_kind, ChangeKind::Modified));
        assert!(!file.is_binary);

        use DiffLineKind::{Add, Context, Delete};
        assert_eq!(
            flat(file),
            vec![
                (Context, Some(1), Some(1), "a"),
                (Delete, Some(2), None, "b"),
                (Add, None, Some(2), "B"),
                (Context, Some(3), Some(3), "c"),
            ],
        );
    }

    #[test]
    fn unstaged_multi_hunk_keeps_per_hunk_numbering() {
        let repo = TempRepo::init();
        let mut lines: Vec<String> = (1..=20).map(|n| format!("line{n}")).collect();
        let original = lines.join("\n") + "\n";
        repo.write("a.txt", &original);
        repo.stage("a.txt");
        repo.commit("add a.txt");

        // Two edits 16 unchanged lines apart (> 2*context) to force two hunks.
        lines[1] = "line2x".into();
        lines[18] = "line19x".into();
        repo.write("a.txt", &(lines.join("\n") + "\n"));

        let files = diff_unstaged(repo.path()).expect("diff");
        let file = only(&files);
        assert_eq!(file.hunks.len(), 2, "expected two separate hunks");

        // Second hunk must number from line 16, not continue from the first.
        let first_ctx = &file.hunks[1].lines[0];
        assert_eq!(first_ctx.old_no, Some(16));
        assert_eq!(first_ctx.new_no, Some(16));
        assert_eq!(first_ctx.content, "line16");

        // Fidelity: the only non-context lines are the two edits.
        use DiffLineKind::{Add, Delete};
        let changes: Vec<_> = file
            .hunks
            .iter()
            .flat_map(|h| &h.lines)
            .filter(|l| l.kind != DiffLineKind::Context)
            .map(|l| (l.kind, l.content.as_str()))
            .collect();
        assert_eq!(
            changes,
            vec![(Delete, "line2"), (Add, "line2x"), (Delete, "line19"), (Add, "line19x")],
        );
    }

    #[test]
    fn staged_mirrors_what_validation_applies() {
        let repo = TempRepo::init();
        repo.write("a.txt", "a\nb\nc\n");
        repo.stage("a.txt");
        repo.commit("add a.txt");

        repo.write("a.txt", "a\nB\nc\n");
        // Before staging: the change is unstaged, nothing staged.
        assert!(diff_staged(repo.path()).expect("diff").is_empty());

        // After staging, the exact same hunks move to the staged section.
        repo.stage("a.txt");
        let unstaged = diff_unstaged(repo.path()).expect("diff");
        assert!(unstaged.is_empty(), "nothing left to review once staged");
        let staged = diff_staged(repo.path()).expect("diff");
        let file = only(&staged);
        use DiffLineKind::{Add, Context, Delete};
        assert_eq!(
            flat(file),
            vec![
                (Context, Some(1), Some(1), "a"),
                (Delete, Some(2), None, "b"),
                (Add, None, Some(2), "B"),
                (Context, Some(3), Some(3), "c"),
            ],
        );
    }

    #[test]
    fn untracked_file_is_all_additions() {
        let repo = TempRepo::init();
        repo.write("seed.txt", "seed\n");
        repo.stage("seed.txt");
        repo.commit("seed");

        repo.write("new.txt", "x\ny\n");
        let files = diff_unstaged(repo.path()).expect("diff");
        let file = files.iter().find(|f| f.path == "new.txt").expect("new.txt");
        assert!(matches!(file.change_kind, ChangeKind::Untracked));
        use DiffLineKind::Add;
        assert_eq!(
            flat(file),
            vec![(Add, None, Some(1), "x"), (Add, None, Some(2), "y")],
        );
    }

    #[test]
    fn deleted_file_is_all_deletions() {
        let repo = TempRepo::init();
        repo.write("a.txt", "x\ny\n");
        repo.stage("a.txt");
        repo.commit("add a.txt");

        repo.remove("a.txt");
        let files = diff_unstaged(repo.path()).expect("diff");
        let file = only(&files);
        assert!(matches!(file.change_kind, ChangeKind::Deleted));
        use DiffLineKind::Delete;
        assert_eq!(
            flat(file),
            vec![(Delete, Some(1), None, "x"), (Delete, Some(2), None, "y")],
        );
    }

    #[test]
    fn unborn_head_stages_show_full_additions() {
        let repo = TempRepo::init();
        repo.write("a.txt", "one\ntwo\n");
        repo.stage("a.txt");
        // No commit: HEAD is unborn, so the staged side is the whole file added.
        let staged = diff_staged(repo.path()).expect("diff");
        let file = only(&staged);
        assert!(matches!(file.change_kind, ChangeKind::Added));
        use DiffLineKind::Add;
        assert_eq!(
            flat(file),
            vec![(Add, None, Some(1), "one"), (Add, None, Some(2), "two")],
        );
    }

    #[test]
    fn binary_file_is_flagged_without_hunks() {
        let repo = TempRepo::init();
        repo.write("data.bin", "before\0\x01\x02");
        repo.stage("data.bin");
        repo.commit("add binary");

        repo.write("data.bin", "after\0\x03\x04\x05");
        let files = diff_unstaged(repo.path()).expect("diff");
        let file = only(&files);
        assert!(file.is_binary, "binary content must be flagged");
        assert!(file.hunks.is_empty(), "no hunks for a binary file");
    }

    #[test]
    fn gitlink_is_listed_without_erroring_the_whole_section() {
        let repo = TempRepo::init();
        repo.write("a.txt", "x\n");
        repo.stage("a.txt");
        // A gitlink (submodule commit pointer) staged via a fake commit id. The
        // blob pipeline cannot open mode 160000, which must not blank the diff.
        repo.git(&[
            "update-index",
            "--add",
            "--cacheinfo",
            "160000,0000000000000000000000000000000000000001,sub",
        ]);

        let staged = diff_staged(repo.path()).expect("a gitlink must not error the diff");
        let sub = staged.iter().find(|f| f.path == "sub").expect("gitlink listed");
        assert!(matches!(sub.change_kind, ChangeKind::Added));
        assert_eq!(sub.new_mode.as_deref(), Some("160000"));
        assert!(sub.hunks.is_empty(), "no hunks for a gitlink");
        // The sibling file still carries its diff — the section was not abandoned.
        assert!(staged.iter().any(|f| f.path == "a.txt" && !f.hunks.is_empty()));
    }

    #[test]
    fn untracked_directory_lists_each_file_with_its_additions() {
        let repo = TempRepo::init();
        repo.write("a.txt", "x\n");
        repo.stage("a.txt");
        repo.commit("seed");

        // A reviewable worktree edit alongside a brand-new untracked directory. The
        // walk recurses into the directory, so each contained file is reviewable on
        // its own — a real additions-only diff under its full path, not a single
        // opaque folder row.
        repo.write("a.txt", "y\n");
        repo.write("newdir/nested.txt", "hello\nworld\n");

        let files = diff_unstaged(repo.path()).expect("an untracked dir must not error the diff");

        // The directory itself is never listed; its file is, with its full path.
        assert!(!files.iter().any(|f| f.path == "newdir"), "the bare folder must not be listed");
        let nested =
            files.iter().find(|f| f.path == "newdir/nested.txt").expect("nested file listed");
        assert!(matches!(nested.change_kind, ChangeKind::Untracked));
        use DiffLineKind::Add;
        assert_eq!(
            flat(nested),
            vec![(Add, None, Some(1), "hello"), (Add, None, Some(2), "world")],
        );

        // The sibling file still carries its real diff — the section was not abandoned.
        let edited = files.iter().find(|f| f.path == "a.txt").expect("a.txt listed");
        assert!(!edited.hunks.is_empty(), "the reviewable file keeps its hunks");
    }

    #[cfg(unix)]
    #[test]
    fn untracked_symlink_is_listed_without_erroring_the_section() {
        let repo = TempRepo::init();
        repo.write("a.txt", "x\n");
        repo.stage("a.txt");
        repo.commit("seed");

        // A brand-new untracked symlink: a non-`File` disk kind that also has no
        // blob the diff pipeline can open. Like the directory case, it must be
        // surfaced as a hunkless notice rather than failing the whole section.
        repo.write("a.txt", "y\n");
        std::os::unix::fs::symlink("a.txt", repo.path().join("link")).expect("create symlink");

        let files = diff_unstaged(repo.path()).expect("an untracked symlink must not error the diff");

        let link = files.iter().find(|f| f.path == "link").expect("untracked symlink listed");
        assert!(matches!(link.change_kind, ChangeKind::Untracked));
        assert!(link.hunks.is_empty(), "no hunks for a symlink entry");
        assert!(!link.is_binary);

        // The sibling file still carries its real diff — the section was not abandoned.
        let edited = files.iter().find(|f| f.path == "a.txt").expect("a.txt listed");
        assert!(!edited.hunks.is_empty(), "the reviewable file keeps its hunks");
    }
}

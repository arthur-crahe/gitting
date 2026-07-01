//! Orchestration of partial (hunk) staging — the review cursor moving one hunk
//! at a time instead of a whole file.
//!
//! Each operation re-diffs the target file **fresh** (so its hunks match what the
//! panel showed), verifies every selected hunk against its header tuple *and* a
//! content [`fingerprint`](super::hunk_patch::hunk_fingerprint) — rejecting a
//! selection whose on-screen content has since drifted — then synthesizes a
//! byte-faithful patch from the raw blob/worktree bytes (never the lossy rendered
//! `content`) and applies it in a single atomic `git apply --cached [--reverse]`.
//!
//! v1 stages **whole hunks of modified files** only; every other change kind
//! (binary, submodule, conflict, type change, rename, untracked, added, deleted)
//! is rejected here so the caller degrades to whole-file staging.

use std::path::Path;

use super::diff::diff_one;
use super::hunk_patch::{file_header, hunk_block, hunk_fingerprint, raw_lines, PatchShape};
use super::index_write::{apply_partial_patch, reject_unsafe_str};
use super::{ChangeKind, GitError, Hunk, HunkSelection};

/// Stages the selected whole hunks of `file` — À reviewer → Validé.
pub fn stage_partial(path: &Path, file: &str, selection: &[HunkSelection]) -> Result<(), GitError> {
    apply_selection(path, file, selection, false)
}

/// Unstages the selected whole hunks of `file` — Validé → À reviewer.
pub fn unstage_partial(path: &Path, file: &str, selection: &[HunkSelection]) -> Result<(), GitError> {
    apply_selection(path, file, selection, true)
}

/// The stale-diff error: the on-screen hunk no longer matches the repository, so
/// the store must reload before the user retries.
fn stale() -> GitError {
    GitError::Index("le diff a changé, rechargez".into())
}

/// Re-diffs `file`, validates `selection` against the fresh hunks, and applies a
/// single patch carrying every selected hunk. `reverse` picks the direction: the
/// staged section (HEAD → index, unstage) when `true`, else the unstaged one
/// (index → worktree, stage).
fn apply_selection(path: &Path, file: &str, selection: &[HunkSelection], reverse: bool) -> Result<(), GitError> {
    reject_unsafe_str(file)?;
    if selection.is_empty() {
        return Ok(());
    }

    let sides = diff_one(path, file, reverse)?
        .ok_or_else(|| GitError::Index(format!("fichier absent du diff : {file}")))?;
    // A modified file is patched in place; a new (untracked) file is created in the
    // index from `/dev/null` with just its selected lines. Everything else
    // (binary, submodule, conflict, type-change, rename, added, deleted) stays
    // whole-file — the caller degrades to `stage_file`/`unstage_file`.
    let shape = match sides.file.change_kind {
        ChangeKind::Modified => PatchShape::Modify,
        ChangeKind::Untracked if !reverse => PatchShape::Create,
        _ => {
            return Err(GitError::Index(
                "staging partiel réservé aux fichiers modifiés ou nouveaux — le reste se valide en entier".into(),
            ))
        }
    };

    let repo = super::repo::discover(path)?;
    let workdir = repo.workdir().ok_or(GitError::Bare)?.to_owned();

    // Raw byte streams for the two sides: staging reads new from the worktree,
    // unstaging from the index blob; the old side is always a stored blob.
    let old_bytes = read_blob(&repo, sides.old_id)?;
    let new_bytes = if reverse {
        read_blob(&repo, sides.new_id)?
    } else {
        std::fs::read(workdir.join(file)).map_err(|e| GitError::Index(e.to_string()))?
    };
    let raw_old = raw_lines(&old_bytes);
    let raw_new = raw_lines(&new_bytes);
    let old_hex = sides.old_id.map(|id| id.to_string());
    let new_hex = sides.new_id.map(|id| id.to_string());

    // One patch carrying every selected hunk in file order, applied once so a
    // multi-hunk selection stays consistent against a single pre-image index.
    let mut order: Vec<&HunkSelection> = selection.iter().collect();
    order.sort_by_key(|s| s.hunk);
    order.dedup_by_key(|s| s.hunk);

    let mut patch = file_header(&sides.file, old_hex.as_deref(), new_hex.as_deref(), shape);
    for sel in order {
        let hunk = sides.file.hunks.get(sel.hunk as usize).ok_or_else(stale)?;
        verify(hunk, sel)?;
        // `lines: None` stages the whole hunk (v1); a subset selects those lines (v2).
        let block = hunk_block(hunk, &raw_old, &raw_new, reverse, sel.lines.as_deref()).ok_or_else(stale)?;
        patch.extend(block);
    }
    apply_partial_patch(path, &patch, reverse)
}

/// Rejects a hunk whose fresh header tuple or content fingerprint no longer
/// matches the selection the user acted on — the WYSIWYG guard that a mere
/// header-tuple check (blind to a same-count re-edit) cannot provide.
fn verify(hunk: &Hunk, sel: &HunkSelection) -> Result<(), GitError> {
    let tuple_ok = hunk.old_start == sel.old_start
        && hunk.old_lines == sel.old_lines
        && hunk.new_start == sel.new_start
        && hunk.new_lines == sel.new_lines;
    if !tuple_ok || hunk_fingerprint(hunk) != sel.fingerprint {
        return Err(stale());
    }
    Ok(())
}

/// Reads a blob's raw bytes, or an empty vec for an absent side (a `None` id).
fn read_blob(repo: &gix::Repository, id: Option<gix::ObjectId>) -> Result<Vec<u8>, GitError> {
    match id {
        Some(id) => Ok(repo.find_object(id).map_err(|e| GitError::Diff(e.to_string()))?.data.clone()),
        None => Ok(Vec::new()),
    }
}

#[cfg(test)]
mod tests {
    use super::{hunk_fingerprint, stage_partial, unstage_partial};
    use crate::git::test_support::TempRepo;
    use crate::git::{
        diff_staged, diff_unstaged, read_status, DiffFile, DiffLineKind, GitError, Hunk, HunkSelection,
    };

    /// A twenty-line file whose lines 2 and 19 are edited, forcing two separate
    /// hunks (the edits are more than `2 * context` lines apart).
    fn two_hunk_repo() -> TempRepo {
        let repo = TempRepo::init();
        let base: Vec<String> = (1..=20).map(|n| format!("line{n}")).collect();
        repo.write("f.txt", &(base.join("\n") + "\n"));
        repo.stage("f.txt");
        repo.commit("seed");

        let mut edited = base;
        edited[1] = "line2x".into();
        edited[18] = "line19x".into();
        repo.write("f.txt", &(edited.join("\n") + "\n"));
        repo
    }

    /// A whole-hunk selection built from a fresh diff's hunk `idx`.
    fn selection_for(file: &DiffFile, idx: usize) -> HunkSelection {
        let h = &file.hunks[idx];
        HunkSelection {
            hunk: idx as u32,
            old_start: h.old_start,
            old_lines: h.old_lines,
            new_start: h.new_start,
            new_lines: h.new_lines,
            fingerprint: hunk_fingerprint(h),
            lines: None,
        }
    }

    /// A five-line file with two changes (b→B, d→D) that share a single hunk, so a
    /// line-subset selection can keep one and leave the other.
    fn two_change_repo() -> TempRepo {
        let repo = TempRepo::init();
        repo.write("f.txt", "a\nb\nc\nd\ne\n");
        repo.stage("f.txt");
        repo.commit("seed");
        repo.write("f.txt", "a\nB\nc\nD\ne\n");
        repo
    }

    /// The line indices of the first change (its delete + its add) within a hunk.
    fn first_change_lines(hunk: &Hunk) -> Vec<u32> {
        let del = hunk.lines.iter().position(|l| matches!(l.kind, DiffLineKind::Delete)).expect("a delete");
        let add = hunk.lines.iter().position(|l| matches!(l.kind, DiffLineKind::Add)).expect("an add");
        vec![del as u32, add as u32]
    }

    #[test]
    fn staging_one_hunk_puts_the_file_in_both_sections() {
        let repo = two_hunk_repo();
        let unstaged = diff_unstaged(repo.path()).expect("diff");
        let file = unstaged.iter().find(|f| f.path == "f.txt").expect("f.txt");
        assert_eq!(file.hunks.len(), 2, "the fixture must have two hunks");

        // Stage only the first hunk (the line-2 edit).
        stage_partial(repo.path(), "f.txt", &[selection_for(file, 0)]).expect("stage hunk 0");

        // The file is now BOTH staged (line-2 change) and unstaged (line-19 change).
        let status = read_status(repo.path()).expect("status");
        assert!(status.staged.iter().any(|e| e.path == "f.txt"), "staged side has the file");
        assert!(status.unstaged.iter().any(|e| e.path == "f.txt"), "unstaged side keeps the file");

        // The staged blob carries only the first edit, not the second.
        let blob = repo.index_blob("f.txt");
        let text = String::from_utf8(blob).unwrap();
        assert!(text.contains("line2x"), "line-2 edit is staged");
        assert!(text.contains("line19\n"), "line-19 edit is NOT staged");
        assert!(!text.contains("line19x"), "line-19 edit must stay unstaged");
    }

    #[test]
    fn staging_both_hunks_in_one_call_applies_atomically() {
        let repo = two_hunk_repo();
        let unstaged = diff_unstaged(repo.path()).expect("diff");
        let file = unstaged.iter().find(|f| f.path == "f.txt").expect("f.txt");
        assert_eq!(file.hunks.len(), 2);

        // One call, both hunks: a single multi-hunk patch applied atomically.
        stage_partial(repo.path(), "f.txt", &[selection_for(file, 0), selection_for(file, 1)])
            .expect("stage both hunks");

        // Nothing left to review; the index holds the whole edited file.
        let status = read_status(repo.path()).expect("status");
        assert!(status.unstaged.is_empty(), "both hunks staged, À reviewer empty");
        assert!(status.staged.iter().any(|e| e.path == "f.txt"));
        let text = String::from_utf8(repo.index_blob("f.txt")).unwrap();
        assert!(text.contains("line2x") && text.contains("line19x"), "both edits staged");
    }

    #[test]
    fn staging_selected_lines_stages_only_those_changes() {
        let repo = two_change_repo();
        let unstaged = diff_unstaged(repo.path()).expect("diff");
        let file = unstaged.iter().find(|f| f.path == "f.txt").expect("f.txt");
        assert_eq!(file.hunks.len(), 1, "the two changes share one hunk");

        let mut sel = selection_for(file, 0);
        sel.lines = Some(first_change_lines(&file.hunks[0]));
        stage_partial(repo.path(), "f.txt", &[sel]).expect("stage selected lines");

        // Only b→B is staged; d stays unchanged in the index.
        assert_eq!(repo.index_blob("f.txt"), b"a\nB\nc\nd\ne\n");
        let status = read_status(repo.path()).expect("status");
        assert!(status.staged.iter().any(|e| e.path == "f.txt"));
        assert!(status.unstaged.iter().any(|e| e.path == "f.txt"), "d→D remains to review");
    }

    #[test]
    fn unstaging_selected_lines_reverts_only_those_changes() {
        let repo = two_change_repo();
        repo.stage("f.txt"); // stage the whole file: index = a B c D e
        let staged = diff_staged(repo.path()).expect("diff");
        let file = staged.iter().find(|f| f.path == "f.txt").expect("f.txt");

        let mut sel = selection_for(file, 0);
        sel.lines = Some(first_change_lines(&file.hunks[0]));
        unstage_partial(repo.path(), "f.txt", &[sel]).expect("unstage selected lines");

        // Only b→B is reverted in the index; d→D stays staged.
        assert_eq!(repo.index_blob("f.txt"), b"a\nb\nc\nD\ne\n");
    }

    #[test]
    fn a_content_reedit_with_the_same_tuple_is_rejected() {
        let repo = two_hunk_repo();
        let unstaged = diff_unstaged(repo.path()).expect("diff");
        let file = unstaged.iter().find(|f| f.path == "f.txt").expect("f.txt").clone();
        // A selection whose header tuple is correct but whose fingerprint does not
        // match the fresh hunk — the class the 4-int tuple alone cannot catch.
        let mut sel = selection_for(&file, 0);
        sel.fingerprint = "0000000000000000".into();

        let err = stage_partial(repo.path(), "f.txt", &[sel]).expect_err("must reject");
        let GitError::Index(message) = err else { panic!("expected Index error") };
        assert!(message.contains("le diff a changé"), "got: {message}");
        // Nothing was staged.
        assert!(read_status(repo.path()).expect("status").staged.is_empty());
    }

    /// A committed seed plus a brand-new untracked `new.txt` of three lines.
    fn untracked_repo() -> TempRepo {
        let repo = TempRepo::init();
        repo.write("seed.txt", "s\n");
        repo.stage("seed.txt");
        repo.commit("seed");
        repo.write("new.txt", "x\ny\nz\n");
        repo
    }

    #[test]
    fn staging_a_whole_untracked_hunk_creates_the_file_in_the_index() {
        let repo = untracked_repo();
        let unstaged = diff_unstaged(repo.path()).expect("diff");
        let file = unstaged.iter().find(|f| f.path == "new.txt").expect("new.txt");
        assert!(matches!(file.change_kind, crate::git::ChangeKind::Untracked));

        stage_partial(repo.path(), "new.txt", &[selection_for(file, 0)]).expect("stage untracked");
        assert_eq!(repo.index_blob("new.txt"), b"x\ny\nz\n");
    }

    #[test]
    fn staging_selected_lines_of_an_untracked_file_creates_a_partial_blob() {
        let repo = untracked_repo();
        let unstaged = diff_unstaged(repo.path()).expect("diff");
        let file = unstaged.iter().find(|f| f.path == "new.txt").expect("new.txt");

        // Select only the first added line: the index gets a new file with just it.
        let mut sel = selection_for(file, 0);
        sel.lines = Some(vec![0]);
        stage_partial(repo.path(), "new.txt", &[sel]).expect("stage first line");

        assert_eq!(repo.index_blob("new.txt"), b"x\n");
        let status = read_status(repo.path()).expect("status");
        assert!(status.staged.iter().any(|e| e.path == "new.txt"), "x is staged");
        assert!(status.unstaged.iter().any(|e| e.path == "new.txt"), "y and z remain to review");
    }

    #[test]
    fn a_deleted_file_is_rejected_for_partial_staging() {
        let repo = TempRepo::init();
        repo.write("f.txt", "a\nb\n");
        repo.stage("f.txt");
        repo.commit("seed");
        repo.remove("f.txt");

        let unstaged = diff_unstaged(repo.path()).expect("diff");
        let file = unstaged.iter().find(|f| f.path == "f.txt").expect("f.txt");
        let err = stage_partial(repo.path(), "f.txt", &[selection_for(file, 0)]).expect_err("reject");
        let GitError::Index(message) = err else { panic!("expected Index error") };
        assert!(message.contains("réservé aux fichiers modifiés ou nouveaux"), "got: {message}");
    }

    #[test]
    fn unstaging_one_hunk_sends_it_back_to_review() {
        let repo = two_hunk_repo();
        // Stage the whole file first, so both hunks are in Validé.
        repo.stage("f.txt");
        let staged = diff_staged(repo.path()).expect("diff");
        let file = staged.iter().find(|f| f.path == "f.txt").expect("f.txt");
        assert_eq!(file.hunks.len(), 2);

        // Unstage only the first hunk.
        unstage_partial(repo.path(), "f.txt", &[selection_for(file, 0)]).expect("unstage hunk 0");

        // The file is back in BOTH sections; the index reverted the line-2 edit
        // only (line-19 edit stays staged).
        let status = read_status(repo.path()).expect("status");
        assert!(status.unstaged.iter().any(|e| e.path == "f.txt"), "line-2 edit returned to review");
        assert!(status.staged.iter().any(|e| e.path == "f.txt"), "line-19 edit stays staged");
        let text = String::from_utf8(repo.index_blob("f.txt")).unwrap();
        assert!(text.contains("line2\n"), "line-2 reverted in the index");
        assert!(text.contains("line19x"), "line-19 edit still staged");
    }

    #[test]
    fn an_empty_selection_is_a_noop() {
        let repo = two_hunk_repo();
        stage_partial(repo.path(), "f.txt", &[]).expect("no-op");
        assert!(read_status(repo.path()).expect("status").staged.is_empty());
    }

    #[test]
    fn an_escaping_path_is_rejected_before_any_diff() {
        let repo = two_hunk_repo();
        let err = stage_partial(repo.path(), "../evil.txt", &[]).expect_err("must reject");
        assert!(matches!(err, GitError::Index(_)));
    }
}

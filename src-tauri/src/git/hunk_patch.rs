//! Pure synthesis of a unified-diff patch for **partial (hunk) staging**.
//!
//! The bytes of every emitted patch line are copied from the **raw** blob /
//! worktree streams, never from the rendered [`super::Line::content`]: that field
//! is `to_str_lossy` of `gix`'s newline-interned tokens (see `diff.rs`), so it has
//! already lost the trailing-newline status, any `\r`, and any non-UTF-8 byte.
//! Sourcing from raw bytes is what lets a staged hunk round-trip CRLF,
//! no-newline-at-EOF and binary-adjacent content to the index exactly.
//!
//! v1 emits one whole hunk per patch and reproduces `gix`'s original `@@` header
//! verbatim — correct for both a forward (`git apply --cached`) and a reverse
//! (`--reverse`, unstaging) apply, because `gix`'s hunk starts are already the
//! index-side positions. `git apply --recount` is the only backstop; no header
//! arithmetic runs. Line-level selection and the count-recomputing transform are
//! a later step.

use std::collections::HashSet;

use super::{DiffFile, DiffLineKind, Hunk};

/// FNV-1a (64-bit) offset basis.
const FNV_OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
/// FNV-1a (64-bit) prime.
const FNV_PRIME: u64 = 0x0000_0100_0000_01b3;

/// Folds `bytes` into a running FNV-1a hash.
fn fnv1a(mut hash: u64, bytes: &[u8]) -> u64 {
    for &b in bytes {
        hash ^= u64::from(b);
        hash = hash.wrapping_mul(FNV_PRIME);
    }
    hash
}

/// Splits `bytes` into lines, **keeping each line's terminator** so segment `n`
/// is the raw bytes of the diff's 1-based line `n + 1`. A line runs up to and
/// including its `\n`; a final segment without a trailing `\n` is the file's last
/// line lacking a newline. Empty input yields no lines — matching how `gix`
/// counts lines, so a 1-based line number indexes directly (`raw[no - 1]`).
pub(super) fn raw_lines(bytes: &[u8]) -> Vec<&[u8]> {
    let mut out = Vec::new();
    let mut start = 0;
    for (i, &b) in bytes.iter().enumerate() {
        if b == b'\n' {
            out.push(&bytes[start..=i]);
            start = i + 1;
        }
    }
    if start < bytes.len() {
        out.push(&bytes[start..]);
    }
    out
}

/// A stable content hash of a hunk — the WYSIWYG staleness guard carried in a
/// `HunkSelection`. Computed over each line's canonical `"{sign}{content}\n"`
/// (sign ∈ `{' ', '+', '-'}`) so the frontend can reproduce it byte-for-byte
/// before a click and the backend can reject a selection whose content drifted
/// even when the `@@` header tuple is unchanged.
pub(super) fn hunk_fingerprint(hunk: &Hunk) -> String {
    let mut hash = FNV_OFFSET;
    for line in &hunk.lines {
        let sign = sign_of(line.kind);
        hash = fnv1a(hash, &[sign]);
        hash = fnv1a(hash, line.content.as_bytes());
        hash = fnv1a(hash, b"\n");
    }
    format!("{hash:016x}")
}

/// The unified-diff sign byte for a line kind.
fn sign_of(kind: DiffLineKind) -> u8 {
    match kind {
        DiffLineKind::Context => b' ',
        DiffLineKind::Add => b'+',
        DiffLineKind::Delete => b'-',
    }
}

/// Whether a path holds a byte `git` would c-quote (control, `"`, `\`, DEL, or
/// non-ASCII). A plain space or ordinary ASCII does not force quoting.
fn needs_quote(path: &str) -> bool {
    path.bytes()
        .any(|b| b < 0x20 || b == 0x7f || b == b'"' || b == b'\\' || b >= 0x80)
}

/// Renders `<prefix><path>` for a diff header (`prefix` is `"a/"` or `"b/"`),
/// c-quoting the whole `"<prefix><path>"` the way `git` does when the path holds
/// a byte that requires it — so `git apply` parses the filename back exactly.
pub(super) fn quoted_path(prefix: &str, path: &str) -> String {
    if !needs_quote(path) {
        return format!("{prefix}{path}");
    }
    let mut out = String::from("\"");
    out.push_str(prefix);
    for &b in path.as_bytes() {
        match b {
            b'"' => out.push_str("\\\""),
            b'\\' => out.push_str("\\\\"),
            b'\t' => out.push_str("\\t"),
            b'\n' => out.push_str("\\n"),
            b'\r' => out.push_str("\\r"),
            0x20..=0x7e => out.push(b as char),
            _ => out.push_str(&format!("\\{b:03o}")),
        }
    }
    out.push('"');
    out
}

/// The shape of the file-level patch preamble.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum PatchShape {
    /// Both sides exist — a content and/or mode change.
    Modify,
    /// The old side is `/dev/null` — a new file, whose lines are all additions
    /// (staging a subset still creates the file in the index with just those lines).
    Create,
}

/// Emits the per-file patch preamble shared by every hunk of `file`. For
/// [`PatchShape::Modify`]: `diff --git`, `old mode`/`new mode` when the mode
/// changed (so the mode stages with the first hunk, never orphaned), an `index
/// <old>..<new>[ <mode>]` line when both object ids are known, and `---`/`+++`.
/// For [`PatchShape::Create`]: `new file mode <mode>` and a `--- /dev/null` old
/// side, so `git apply --cached` creates the index entry. Paths are c-quoted like
/// `git`'s own output so `git apply` parses them back exactly.
pub(super) fn file_header(
    file: &DiffFile,
    old_oid: Option<&str>,
    new_oid: Option<&str>,
    shape: PatchShape,
) -> Vec<u8> {
    let a = quoted_path("a/", &file.path);
    let b = quoted_path("b/", &file.path);
    let mut buf: Vec<u8> = Vec::new();
    extend(&mut buf, &format!("diff --git {a} {b}\n"));

    if shape == PatchShape::Create {
        let mode = file.new_mode.as_deref().unwrap_or("100644");
        extend(&mut buf, &format!("new file mode {mode}\n"));
        extend(&mut buf, "--- /dev/null\n");
        extend(&mut buf, &format!("+++ {b}\n"));
        return buf;
    }

    match (file.old_mode.as_deref(), file.new_mode.as_deref()) {
        (Some(om), Some(nm)) if om != nm => {
            extend(&mut buf, &format!("old mode {om}\nnew mode {nm}\n"));
            if let (Some(oo), Some(no)) = (old_oid, new_oid) {
                extend(&mut buf, &format!("index {oo}..{no}\n"));
            }
        }
        _ => {
            if let (Some(oo), Some(no)) = (old_oid, new_oid) {
                let mode = file.new_mode.as_deref().or(file.old_mode.as_deref()).unwrap_or("100644");
                extend(&mut buf, &format!("index {oo}..{no} {mode}\n"));
            }
        }
    }

    extend(&mut buf, &format!("--- {a}\n"));
    extend(&mut buf, &format!("+++ {b}\n"));
    buf
}

/// Emits one hunk's `@@` header and body for a stage (or, with `reverse`,
/// unstage) apply. `selected` is `None` for the whole hunk (v1) or the indices
/// (into `hunk.lines`) of the changed lines to include (v2 line-level); context
/// lines are always kept.
///
/// Each kept line copies its **raw** bytes — a deleted line from `raw_old`, an
/// added line from `raw_new`, a context line from whichever side is the **index**
/// (old when forward, new when reverse) so the apply pre-image always matches. A
/// line the user did NOT select is neutralized in a direction-aware way so only
/// the chosen change lands:
/// - forward: an unselected `+` is **dropped** (stays in the worktree only); an
///   unselected `-` becomes **context** (the line is not removed from the index);
/// - reverse: mirrored — an unselected `-` is **dropped** (stays removed in the
///   index); an unselected `+` becomes **context** (the line stays staged).
///
/// The `@@` counts are recomputed from the emitted body (a zero-length side gets
/// start `0`); a `\ No newline at end of file` marker follows any line whose raw
/// bytes lack a trailing `\n`. Returns `None` when the effective selection carries
/// no change (all context), the hunk is empty, or a line number falls outside its
/// raw stream (a stale selection) — so no malformed or no-op patch reaches `git`.
pub(super) fn hunk_block(
    hunk: &Hunk,
    raw_old: &[&[u8]],
    raw_new: &[&[u8]],
    reverse: bool,
    selected: Option<&[u32]>,
) -> Option<Vec<u8>> {
    if hunk.lines.is_empty() {
        return None;
    }
    let chosen: Option<HashSet<u32>> = selected.map(|s| s.iter().copied().collect());
    let is_selected = |index: usize| chosen.as_ref().is_none_or(|s| s.contains(&(index as u32)));

    // (sign, raw-bytes) per emitted body line, then the recomputed counts.
    let mut body: Vec<(u8, &[u8])> = Vec::new();
    let mut old_count = 0u32;
    let mut new_count = 0u32;
    let mut has_change = false;

    for (index, line) in hunk.lines.iter().enumerate() {
        match line.kind {
            DiffLineKind::Context => {
                let no = if reverse { line.new_no } else { line.old_no }?;
                let raw = *(if reverse { raw_new } else { raw_old }).get((no as usize).checked_sub(1)?)?;
                body.push((b' ', raw));
                old_count += 1;
                new_count += 1;
            }
            DiffLineKind::Delete => {
                let raw = *raw_old.get((line.old_no? as usize).checked_sub(1)?)?;
                if is_selected(index) {
                    body.push((b'-', raw));
                    old_count += 1;
                    has_change = true;
                } else if !reverse {
                    // Keep the line: not removed from the index this time.
                    body.push((b' ', raw));
                    old_count += 1;
                    new_count += 1;
                }
                // reverse + unselected delete → drop (stays removed in the index).
            }
            DiffLineKind::Add => {
                let raw = *raw_new.get((line.new_no? as usize).checked_sub(1)?)?;
                if is_selected(index) {
                    body.push((b'+', raw));
                    new_count += 1;
                    has_change = true;
                } else if reverse {
                    // Keep the line staged: it stays in the index.
                    body.push((b' ', raw));
                    old_count += 1;
                    new_count += 1;
                }
                // forward + unselected add → drop (stays in the worktree only).
            }
        }
    }

    if !has_change {
        return None;
    }

    let old_start = if old_count == 0 { 0 } else { hunk.old_start };
    let new_start = if new_count == 0 { 0 } else { hunk.new_start };
    let mut buf: Vec<u8> = Vec::new();
    extend(&mut buf, &format!("@@ -{old_start},{old_count} +{new_start},{new_count} @@\n"));
    for (sign, raw) in body {
        buf.push(sign);
        buf.extend_from_slice(raw);
        if !raw.ends_with(b"\n") {
            buf.push(b'\n');
            buf.extend_from_slice(b"\\ No newline at end of file\n");
        }
    }
    Some(buf)
}

/// Appends a UTF-8 string's bytes to a byte buffer.
fn extend(buf: &mut Vec<u8>, s: &str) {
    buf.extend_from_slice(s.as_bytes());
}

#[cfg(test)]
mod tests {
    use super::{file_header, hunk_block, hunk_fingerprint, quoted_path, raw_lines, PatchShape};
    use crate::git::index_write::apply_partial_patch;
    use crate::git::test_support::TempRepo;
    use crate::git::{ChangeKind, DiffFile, DiffLineKind, Hunk, Line};

    /// A single-hunk patch — the file preamble plus one hunk block. Production
    /// partial staging composes `file_header` with several `hunk_block`s instead
    /// (one atomic multi-hunk patch); this wrapper keeps the single-hunk tests terse.
    fn build_patch(
        file: &DiffFile,
        old_oid: Option<&str>,
        new_oid: Option<&str>,
        hunk: &Hunk,
        raw_old: &[&[u8]],
        raw_new: &[&[u8]],
        reverse: bool,
    ) -> Option<Vec<u8>> {
        let mut buf = file_header(file, old_oid, new_oid, PatchShape::Modify);
        buf.extend(hunk_block(hunk, raw_old, raw_new, reverse, None)?);
        Some(buf)
    }

    /// A modified-file `DiffFile` shell (modes present, hunks unused by the patch).
    fn modified(path: &str) -> DiffFile {
        DiffFile {
            path: path.into(),
            change_kind: ChangeKind::Modified,
            old_mode: Some("100644".into()),
            new_mode: Some("100644".into()),
            is_binary: false,
            hunks: Vec::new(),
        }
    }

    /// A hunk over a five-line file with TWO changes (b→B at index 1/2, d→D at
    /// index 4/5), so a line-subset selection can keep one and neutralize the other.
    fn two_change_hunk() -> Hunk {
        use DiffLineKind::{Add, Context, Delete};
        Hunk {
            old_start: 1,
            old_lines: 5,
            new_start: 1,
            new_lines: 5,
            lines: vec![
                Line { kind: Context, old_no: Some(1), new_no: Some(1), content: "a".into() },
                Line { kind: Delete, old_no: Some(2), new_no: None, content: "b".into() },
                Line { kind: Add, old_no: None, new_no: Some(2), content: "B".into() },
                Line { kind: Context, old_no: Some(3), new_no: Some(3), content: "c".into() },
                Line { kind: Delete, old_no: Some(4), new_no: None, content: "d".into() },
                Line { kind: Add, old_no: None, new_no: Some(4), content: "D".into() },
                Line { kind: Context, old_no: Some(5), new_no: Some(5), content: "e".into() },
            ],
        }
    }

    /// A single-line-changed hunk (`old[idx]` → `new[idx]`, both 0-based within a
    /// three-line file) with correct per-side numbering.
    fn one_change_hunk(old_mid: &str, new_mid: &str) -> Hunk {
        use DiffLineKind::{Add, Context, Delete};
        Hunk {
            old_start: 1,
            old_lines: 3,
            new_start: 1,
            new_lines: 3,
            lines: vec![
                Line { kind: Context, old_no: Some(1), new_no: Some(1), content: "a".into() },
                Line { kind: Delete, old_no: Some(2), new_no: None, content: old_mid.into() },
                Line { kind: Add, old_no: None, new_no: Some(2), content: new_mid.into() },
                Line { kind: Context, old_no: Some(3), new_no: Some(3), content: "c".into() },
            ],
        }
    }

    #[test]
    fn raw_lines_keeps_terminators_and_the_no_newline_tail() {
        assert_eq!(raw_lines(b"a\nb\nc\n"), vec![&b"a\n"[..], b"b\n", b"c\n"]);
        assert_eq!(raw_lines(b"a\nb\nc"), vec![&b"a\n"[..], b"b\n", b"c"]);
        assert_eq!(raw_lines(b"a\r\nb\r\n"), vec![&b"a\r\n"[..], b"b\r\n"]);
        assert_eq!(raw_lines(b""), Vec::<&[u8]>::new());
        assert_eq!(raw_lines(b"\n"), vec![&b"\n"[..]]);
    }

    #[test]
    fn quoted_path_quotes_only_when_git_would() {
        assert_eq!(quoted_path("a/", "src/x.rs"), "a/src/x.rs");
        assert_eq!(quoted_path("a/", "my file.txt"), "a/my file.txt"); // space: unquoted
        assert_eq!(quoted_path("a/", "tab\there"), "\"a/tab\\there\""); // tab: quoted
        assert_eq!(quoted_path("b/", "caf\u{e9}.txt"), "\"b/caf\\303\\251.txt\""); // é → UTF-8 octal
    }

    #[test]
    fn fingerprint_is_stable_and_content_sensitive() {
        let base = one_change_hunk("b", "B");
        assert_eq!(hunk_fingerprint(&base), hunk_fingerprint(&one_change_hunk("b", "B")));
        // Same header tuple, different content → different fingerprint (the guard
        // the 4-int tuple cannot provide).
        assert_ne!(hunk_fingerprint(&base), hunk_fingerprint(&one_change_hunk("b", "Bx")));
    }

    #[test]
    fn fingerprint_matches_the_cross_language_reference() {
        // Pinned so the Rust and TS (`lib/hunk-fingerprint.ts`) hashes can never
        // drift: the canonical serialization is " a\n-b\n+B\n c\n". The SAME hex is
        // asserted in `hunk-fingerprint.test.ts`.
        assert_eq!(hunk_fingerprint(&one_change_hunk("b", "B")), "485c57cbfeae1b69");
    }

    #[test]
    fn build_patch_forward_reproduces_verbatim_header_and_bytes() {
        let file = modified("f.txt");
        let hunk = one_change_hunk("b", "B");
        let raw_old = raw_lines(b"a\nb\nc\n");
        let raw_new = raw_lines(b"a\nB\nc\n");
        let patch = build_patch(&file, None, None, &hunk, &raw_old, &raw_new, false).expect("patch");
        assert_eq!(
            String::from_utf8(patch).unwrap(),
            "diff --git a/f.txt b/f.txt\n--- a/f.txt\n+++ b/f.txt\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n",
        );
    }

    #[test]
    fn build_patch_emits_no_newline_marker_from_the_raw_tail() {
        let file = modified("f.txt");
        let hunk = one_change_hunk("b", "B");
        let raw_old = raw_lines(b"a\nb\nc"); // last line has no newline
        let raw_new = raw_lines(b"a\nB\nc");
        let patch = build_patch(&file, None, None, &hunk, &raw_old, &raw_new, false).expect("patch");
        assert_eq!(
            String::from_utf8(patch).unwrap(),
            "diff --git a/f.txt b/f.txt\n--- a/f.txt\n+++ b/f.txt\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n\\ No newline at end of file\n",
        );
    }

    #[test]
    fn hunk_block_forward_stages_only_selected_lines() {
        let hunk = two_change_hunk();
        let raw_old = raw_lines(b"a\nb\nc\nd\ne\n");
        let raw_new = raw_lines(b"a\nB\nc\nD\ne\n");
        // Keep the first change (indices 1,2); the second (d→D) is neutralized:
        // its delete becomes context, its add is dropped.
        let block = hunk_block(&hunk, &raw_old, &raw_new, false, Some(&[1, 2])).expect("block");
        assert_eq!(
            String::from_utf8(block).unwrap(),
            "@@ -1,5 +1,5 @@\n a\n-b\n+B\n c\n d\n e\n",
        );
    }

    #[test]
    fn hunk_block_reverse_unstages_only_selected_lines() {
        let hunk = two_change_hunk();
        let raw_old = raw_lines(b"a\nb\nc\nd\ne\n"); // HEAD
        let raw_new = raw_lines(b"a\nB\nc\nD\ne\n"); // index
        // Reverse: the unselected add (d→D) becomes context so it stays staged;
        // the unselected delete would be dropped (none here).
        let block = hunk_block(&hunk, &raw_old, &raw_new, true, Some(&[1, 2])).expect("block");
        assert_eq!(
            String::from_utf8(block).unwrap(),
            "@@ -1,5 +1,5 @@\n a\n-b\n+B\n c\n D\n e\n",
        );
    }

    #[test]
    fn creation_patch_uses_dev_null_and_new_file_mode() {
        let file = DiffFile {
            path: "new.txt".into(),
            change_kind: ChangeKind::Untracked,
            old_mode: None,
            new_mode: Some("100644".into()),
            is_binary: false,
            hunks: Vec::new(),
        };
        let hunk = Hunk {
            old_start: 0,
            old_lines: 0,
            new_start: 1,
            new_lines: 2,
            lines: vec![
                Line { kind: DiffLineKind::Add, old_no: None, new_no: Some(1), content: "x".into() },
                Line { kind: DiffLineKind::Add, old_no: None, new_no: Some(2), content: "y".into() },
            ],
        };
        let raw_new = raw_lines(b"x\ny\n");
        let mut patch = file_header(&file, None, None, PatchShape::Create);
        patch.extend(hunk_block(&hunk, &[], &raw_new, false, None).expect("block"));
        assert_eq!(
            String::from_utf8(patch).unwrap(),
            "diff --git a/new.txt b/new.txt\nnew file mode 100644\n--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1,2 @@\n+x\n+y\n",
        );
    }

    #[test]
    fn hunk_block_returns_none_when_no_change_is_selected() {
        let hunk = two_change_hunk();
        let raw_old = raw_lines(b"a\nb\nc\nd\ne\n");
        let raw_new = raw_lines(b"a\nB\nc\nD\ne\n");
        assert!(hunk_block(&hunk, &raw_old, &raw_new, false, Some(&[])).is_none());
        assert!(hunk_block(&hunk, &raw_old, &raw_new, false, Some(&[0, 3, 6])).is_none());
    }

    #[test]
    fn build_patch_returns_none_for_a_stale_line_number() {
        let file = modified("f.txt");
        let hunk = one_change_hunk("b", "B");
        // raw_old too short for the delete at old_no 2.
        assert!(build_patch(&file, None, None, &hunk, &raw_lines(b"a\n"), &raw_lines(b"a\nB\nc\n"), false).is_none());
    }

    #[test]
    fn staging_a_hunk_writes_the_exact_index_blob() {
        let repo = TempRepo::init();
        repo.write("f.txt", "a\nb\nc\n");
        repo.stage("f.txt");
        repo.commit("seed");

        let file = modified("f.txt");
        let hunk = one_change_hunk("b", "B");
        let patch = build_patch(&file, None, None, &hunk, &raw_lines(b"a\nb\nc\n"), &raw_lines(b"a\nB\nc\n"), false)
            .expect("patch");
        apply_partial_patch(repo.path(), &patch, false).expect("apply");

        assert_eq!(repo.index_blob("f.txt"), b"a\nB\nc\n");
    }

    #[test]
    fn staging_preserves_crlf_byte_for_byte() {
        let repo = TempRepo::init();
        repo.write("f.txt", "a\r\nb\r\nc\r\n");
        repo.stage("f.txt");
        repo.commit("seed");

        let file = modified("f.txt");
        let hunk = one_change_hunk("b", "B");
        let patch = build_patch(&file, None, None, &hunk, &raw_lines(b"a\r\nb\r\nc\r\n"), &raw_lines(b"a\r\nB\r\nc\r\n"), false)
            .expect("patch");
        apply_partial_patch(repo.path(), &patch, false).expect("apply");

        // The staged blob keeps every \r\n — the Windows path the naive
        // diff-sourced patch would have flattened to LF.
        assert_eq!(repo.index_blob("f.txt"), b"a\r\nB\r\nc\r\n");
    }

    #[test]
    fn staging_preserves_a_missing_final_newline() {
        let repo = TempRepo::init();
        repo.write("f.txt", "a\nb\nc"); // no trailing newline
        repo.stage("f.txt");
        repo.commit("seed");

        let file = modified("f.txt");
        let hunk = one_change_hunk("b", "B");
        let patch = build_patch(&file, None, None, &hunk, &raw_lines(b"a\nb\nc"), &raw_lines(b"a\nB\nc"), false)
            .expect("patch");
        apply_partial_patch(repo.path(), &patch, false).expect("apply");

        assert_eq!(repo.index_blob("f.txt"), b"a\nB\nc");
    }

    #[test]
    fn reverse_apply_unstages_the_hunk_back_to_head() {
        let repo = TempRepo::init();
        repo.write("f.txt", "a\nb\nc\n");
        repo.stage("f.txt");
        repo.commit("seed");
        // Stage a change so the index differs from HEAD.
        repo.write("f.txt", "a\nB\nc\n");
        repo.stage("f.txt");
        assert_eq!(repo.index_blob("f.txt"), b"a\nB\nc\n");

        // Build the HEAD→index patch and reverse-apply it: index returns to HEAD.
        let file = modified("f.txt");
        let hunk = one_change_hunk("b", "B");
        let patch = build_patch(&file, None, None, &hunk, &raw_lines(b"a\nb\nc\n"), &raw_lines(b"a\nB\nc\n"), true)
            .expect("patch");
        apply_partial_patch(repo.path(), &patch, true).expect("reverse apply");

        assert_eq!(repo.index_blob("f.txt"), b"a\nb\nc\n");
    }
}

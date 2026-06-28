//! Index writes — the one place this app shells out to the system `git` binary.
//!
//! `gix` has no stable index add/remove API yet, so validating a file (`git
//! add`) and sending it back to review (`git restore --staged`) run the `git`
//! CLI. The shell-out is isolated here behind the [`IndexWriter`] trait so it
//! can be swapped for a native `gix` implementation once that lands, without
//! touching the commands or the rest of the git layer.

use std::ffi::OsString;
use std::io::ErrorKind;
use std::path::Path;
use std::process::Command;

use super::error::GitError;

/// Stages a file into the index — accepting it into the "Validé" section.
pub fn stage_file(path: &Path, file: &str) -> Result<(), GitError> {
    GitCli::default().stage(&workdir(path)?, file)
}

/// Unstages a file — sending it back to the "À reviewer" section.
pub fn unstage_file(path: &Path, file: &str) -> Result<(), GitError> {
    GitCli::default().unstage(&workdir(path)?, file)
}

/// Stages many files at once — "tout valider" for the "À reviewer" section (or a
/// filtered subset). A no-op for an empty list.
pub fn stage_files(path: &Path, files: &[String]) -> Result<(), GitError> {
    GitCli::default().stage_many(&workdir(path)?, files)
}

/// Unstages many files at once — "tout dévalider" for the "Validé" section (or a
/// filtered subset). A no-op for an empty list.
pub fn unstage_files(path: &Path, files: &[String]) -> Result<(), GitError> {
    GitCli::default().unstage_many(&workdir(path)?, files)
}

/// The working-tree root of the repository enclosing `path`.
fn workdir(path: &Path) -> Result<std::path::PathBuf, GitError> {
    Ok(super::repo::discover(path)?
        .workdir()
        .ok_or(GitError::Bare)?
        .to_owned())
}

/// An index mutation, isolated so the backend can swap to native `gix`.
trait IndexWriter {
    /// Adds `file` (repo-relative) to the index.
    fn stage(&self, root: &Path, file: &str) -> Result<(), GitError>;
    /// Restores `file` (repo-relative) in the index from `HEAD`.
    fn unstage(&self, root: &Path, file: &str) -> Result<(), GitError>;
    /// Adds every `files` entry (repo-relative) to the index.
    fn stage_many(&self, root: &Path, files: &[String]) -> Result<(), GitError>;
    /// Restores every `files` entry (repo-relative) in the index from `HEAD`.
    fn unstage_many(&self, root: &Path, files: &[String]) -> Result<(), GitError>;
}

/// Maximum number of paths passed to a single `git` invocation. Large change sets
/// are split into several calls so the command line stays well under the platform
/// limit (Windows caps it near 32 KiB).
const PATHS_PER_CALL: usize = 100;

/// Drives index writes through the `git` CLI.
struct GitCli {
    /// The program to run; overridable in tests, `git` in production.
    program: OsString,
}

impl Default for GitCli {
    fn default() -> Self {
        Self { program: "git".into() }
    }
}

impl IndexWriter for GitCli {
    fn stage(&self, root: &Path, file: &str) -> Result<(), GitError> {
        self.run(root, &["add", "--", file])
    }

    fn unstage(&self, root: &Path, file: &str) -> Result<(), GitError> {
        self.run(root, &["restore", "--staged", "--", file])
    }

    fn stage_many(&self, root: &Path, files: &[String]) -> Result<(), GitError> {
        self.run_many(root, &["add", "--"], files)
    }

    fn unstage_many(&self, root: &Path, files: &[String]) -> Result<(), GitError> {
        self.run_many(root, &["restore", "--staged", "--"], files)
    }
}

impl GitCli {
    /// Runs `git -C <root> <args…>` for a command ending in a single in-tree path,
    /// after the [`reject_unsafe_path`] guard.
    fn run(&self, root: &Path, args: &[&str]) -> Result<(), GitError> {
        reject_unsafe_path(args)?;
        self.exec(root, args)
    }

    /// Runs `prefix` over `files` in [`PATHS_PER_CALL`]-sized batches (each a
    /// `git <prefix…> -- <paths…>` call), so one click validates the whole section
    /// no matter how large. Every path is validated up front; an empty list is a
    /// no-op (no `git` invocation), and the first failing batch aborts the rest.
    fn run_many(&self, root: &Path, prefix: &[&str], files: &[String]) -> Result<(), GitError> {
        for file in files {
            reject_unsafe_str(file)?;
        }
        for batch in files.chunks(PATHS_PER_CALL) {
            let mut args: Vec<&str> = prefix.to_vec();
            args.extend(batch.iter().map(String::as_str));
            self.exec(root, &args)?;
        }
        Ok(())
    }

    /// Runs `git -C <root> <args…>`, mapping a missing binary, a spawn failure
    /// or a non-zero exit to a [`GitError::Index`] carrying a usable message.
    fn exec(&self, root: &Path, args: &[&str]) -> Result<(), GitError> {
        let output = Command::new(&self.program).arg("-C").arg(root).args(args).output();
        let output = match output {
            Ok(output) => output,
            // The only place the app needs an installed `git`; say so plainly.
            Err(e) if e.kind() == ErrorKind::NotFound => {
                return Err(GitError::Index(
                    "git introuvable : la validation nécessite git installé".into(),
                ))
            }
            Err(e) => return Err(GitError::Index(e.to_string())),
        };
        if output.status.success() {
            Ok(())
        } else {
            Err(GitError::Index(
                String::from_utf8_lossy(&output.stderr).trim().to_owned(),
            ))
        }
    }
}

/// Rejects the last argument (the path, after the `--` separator) when it is not
/// a single in-tree path. See [`reject_unsafe_str`].
fn reject_unsafe_path(args: &[&str]) -> Result<(), GitError> {
    reject_unsafe_str(args.last().copied().unwrap_or_default())
}

/// Rejects anything that is not a single in-tree path: an empty argument, an
/// absolute path, a `.` (which would target the whole worktree), or a `..`
/// escape. The paths always come from our own status list, so this only guards
/// against a malformed IPC argument.
fn reject_unsafe_str(raw: &str) -> Result<(), GitError> {
    let file = Path::new(raw);
    let unsafe_path = raw.is_empty()
        || file.is_absolute()
        || file.components().any(|c| {
            matches!(c, std::path::Component::ParentDir | std::path::Component::CurDir)
        });
    if unsafe_path {
        return Err(GitError::Index(format!(
            "chemin de fichier invalide : {}",
            file.display()
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{stage_file, stage_files, unstage_file, unstage_files, GitCli, IndexWriter};
    use crate::git::test_support::TempRepo;
    use crate::git::{read_status, ChangeKind, GitError};

    #[test]
    fn stage_then_unstage_moves_a_file_between_sections() {
        let repo = TempRepo::init();
        repo.write("a.txt", "x\n");
        repo.stage("a.txt");
        repo.commit("add a.txt");
        repo.write("a.txt", "y\n");

        // The edit starts unstaged.
        let status = read_status(repo.path()).expect("status");
        assert_eq!(status.unstaged.len(), 1);
        assert!(status.staged.is_empty());

        // Validating it stages it.
        stage_file(repo.path(), "a.txt").expect("stage");
        let status = read_status(repo.path()).expect("status");
        assert!(status.unstaged.is_empty());
        assert_eq!(status.staged.len(), 1);
        assert!(matches!(status.staged[0].kind, ChangeKind::Modified));

        // Un-validating it sends it back to review.
        unstage_file(repo.path(), "a.txt").expect("unstage");
        let status = read_status(repo.path()).expect("status");
        assert_eq!(status.unstaged.len(), 1);
        assert!(status.staged.is_empty());
    }

    #[test]
    fn bulk_stage_then_unstage_moves_every_listed_file() {
        let repo = TempRepo::init();
        repo.write("seed.txt", "s\n");
        repo.stage("seed.txt");
        repo.commit("seed");
        repo.write("a.txt", "a\n");
        repo.write("b.txt", "b\n");
        repo.write("c.txt", "c\n");

        let files: Vec<String> = vec!["a.txt".into(), "b.txt".into(), "c.txt".into()];

        // Tout valider: every listed file lands in "Validé".
        stage_files(repo.path(), &files).expect("stage all");
        let status = read_status(repo.path()).expect("status");
        assert!(status.unstaged.is_empty(), "every file moved out of À reviewer");
        assert_eq!(status.staged.len(), 3);

        // Tout dévalider: every listed file returns to "À reviewer".
        unstage_files(repo.path(), &files).expect("unstage all");
        let status = read_status(repo.path()).expect("status");
        assert_eq!(status.unstaged.len(), 3);
        assert!(status.staged.is_empty());
    }

    #[test]
    fn bulk_stage_of_an_empty_list_is_a_noop() {
        let repo = TempRepo::init();
        repo.write("a.txt", "a\n");
        // No paths: nothing is staged, the worktree change is left untouched.
        stage_files(repo.path(), &[]).expect("no-op");
        let status = read_status(repo.path()).expect("status");
        assert_eq!(status.unstaged.len(), 1);
        assert!(status.staged.is_empty());
    }

    #[test]
    fn bulk_stage_rejects_an_escaping_path_before_touching_the_index() {
        let repo = TempRepo::init();
        repo.write("ok.txt", "x\n");
        let files: Vec<String> = vec!["ok.txt".into(), "../evil.txt".into()];
        let err = stage_files(repo.path(), &files).expect_err("should reject");
        assert!(matches!(err, GitError::Index(_)));
        // The whole batch is refused: even the valid sibling stays unstaged.
        let status = read_status(repo.path()).expect("status");
        assert!(status.staged.is_empty(), "nothing staged when any path is rejected");
    }

    #[test]
    fn missing_git_binary_yields_a_clear_message() {
        let repo = TempRepo::init();
        let cli = GitCli { program: "gitting-no-such-binary".into() };
        let err = cli.stage(repo.path(), "a.txt").expect_err("should fail");
        let GitError::Index(message) = err else {
            panic!("expected Index error, got {err:?}");
        };
        assert!(message.contains("git introuvable"), "got: {message}");
    }

    #[test]
    fn an_escaping_path_is_rejected() {
        let repo = TempRepo::init();
        let err = stage_file(repo.path(), "../outside.txt").expect_err("should reject");
        assert!(matches!(err, GitError::Index(_)));
    }

    #[test]
    fn an_absolute_path_is_rejected() {
        let repo = TempRepo::init();
        let absolute = if cfg!(windows) { "C:\\etc\\passwd" } else { "/etc/passwd" };
        let err = stage_file(repo.path(), absolute).expect_err("should reject");
        assert!(matches!(err, GitError::Index(_)));
    }

    #[test]
    fn a_dot_path_is_rejected_so_one_call_cannot_stage_everything() {
        let repo = TempRepo::init();
        let err = stage_file(repo.path(), ".").expect_err("should reject");
        assert!(matches!(err, GitError::Index(_)));
    }
}

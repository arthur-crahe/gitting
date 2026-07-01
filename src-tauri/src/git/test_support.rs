//! Test-only scaffolding: throwaway on-disk git repositories so the `gix` read
//! layer can be exercised against real index, worktree and HEAD states.
//!
//! Fixtures are built by shelling out to the `git` CLI — the same tool the
//! `index_write` layer relies on — with global and system configuration
//! neutralised and a fixed identity injected, so a fixture's outcome never
//! depends on the host's git configuration.

use std::path::Path;
use std::process::Command;

use tempfile::TempDir;

/// A temporary git repository, removed from disk when dropped.
pub struct TempRepo {
    dir: TempDir,
}

impl TempRepo {
    /// Initialises an empty repository with `main` as the default branch.
    pub fn init() -> Self {
        let dir = tempfile::tempdir().expect("create tempdir");
        let repo = Self { dir };
        repo.git(&["init", "-b", "main"]);
        repo
    }

    /// The working-tree root; pass this to the functions under test.
    pub fn path(&self) -> &Path {
        self.dir.path()
    }

    /// Writes `contents` to `rel` (relative to the root), creating parent
    /// directories as needed.
    pub fn write(&self, rel: &str, contents: &str) {
        let full = self.dir.path().join(rel);
        if let Some(parent) = full.parent() {
            std::fs::create_dir_all(parent).expect("create parent dirs");
        }
        std::fs::write(full, contents).expect("write file");
    }

    /// Deletes `rel` from the working tree.
    pub fn remove(&self, rel: &str) {
        std::fs::remove_file(self.dir.path().join(rel)).expect("remove file");
    }

    /// Stages `rel` into the index (`git add`).
    pub fn stage(&self, rel: &str) {
        self.git(&["add", "--", rel]);
    }

    /// Commits the current index with `message`.
    pub fn commit(&self, message: &str) {
        self.git(&["commit", "-m", message]);
    }

    /// The staged (index) blob bytes for `rel` — `git cat-file blob :rel`. Used
    /// to assert byte-for-byte what partial staging wrote to the index.
    pub fn index_blob(&self, rel: &str) -> Vec<u8> {
        let output = Command::new("git")
            .arg("-C")
            .arg(self.dir.path())
            .args(["cat-file", "blob", &format!(":{rel}")])
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .env("GIT_CONFIG_SYSTEM", "/dev/null")
            .output()
            .expect("spawn git cat-file");
        assert!(
            output.status.success(),
            "git cat-file blob :{rel} failed: {}",
            String::from_utf8_lossy(&output.stderr),
        );
        output.stdout
    }

    /// Runs a `git` subcommand in the repository, asserting it succeeds.
    pub fn git(&self, args: &[&str]) {
        let output = Command::new("git")
            .arg("-C")
            .arg(self.dir.path())
            .args([
                "-c",
                "user.name=Gitting Test",
                "-c",
                "user.email=test@gitting.local",
                "-c",
                "commit.gpgsign=false",
            ])
            .args(args)
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .env("GIT_CONFIG_SYSTEM", "/dev/null")
            .output()
            .expect("spawn git");
        assert!(
            output.status.success(),
            "git {args:?} failed: {}",
            String::from_utf8_lossy(&output.stderr),
        );
    }
}

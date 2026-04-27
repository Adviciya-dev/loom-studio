package git

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// initRepo creates a temporary git repo configured for testing.
func initRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()

	run := func(args ...string) {
		t.Helper()
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v — %s", args, err, out)
		}
	}

	run("init")
	run("config", "user.email", "test@loom.dev")
	run("config", "user.name", "Loom Test")
	return dir
}

func TestStageAndCommit_Success(t *testing.T) {
	dir := initRepo(t)

	if err := os.WriteFile(filepath.Join(dir, "main.go"), []byte("package main\n"), 0644); err != nil {
		t.Fatal(err)
	}

	hash, err := StageAndCommit(dir, "TASK-016", "Add main entry point")
	if err != nil {
		t.Fatalf("StageAndCommit: %v", err)
	}
	if len(hash) < 7 {
		t.Errorf("expected full SHA, got %q", hash)
	}

	// Verify the commit message format.
	cmd := exec.Command("git", "log", "--oneline", "-1")
	cmd.Dir = dir
	out, _ := cmd.Output()
	msg := string(out)

	if !strings.Contains(msg, "TASK-016") {
		t.Errorf("commit message missing task ID: %q", msg)
	}
	if !strings.Contains(msg, "Add main entry point") {
		t.Errorf("commit message missing task title: %q", msg)
	}
	if !strings.Contains(msg, "feat(loom):") {
		t.Errorf("commit message missing prefix: %q", msg)
	}
}

func TestStageAndCommit_NothingToCommit(t *testing.T) {
	dir := initRepo(t)
	// Create an initial commit so the repo is valid, then nothing more to stage.
	os.WriteFile(filepath.Join(dir, "init.txt"), []byte("init\n"), 0644)
	exec.Command("git", "-C", dir, "add", "-A").Run()
	exec.Command("git", "-C", dir, "commit", "-m", "init").Run()

	// No new changes — commit should fail.
	_, err := StageAndCommit(dir, "TASK-016", "Nothing new")
	if err == nil {
		t.Error("expected error for nothing-to-commit, got nil")
	}
}

func TestStageAll_NoRepo(t *testing.T) {
	dir := t.TempDir() // plain directory, not a git repo
	if err := StageAll(dir); err == nil {
		t.Error("expected error for non-git directory, got nil")
	}
}

func TestCommitMessage_Format(t *testing.T) {
	msg := CommitMessage("TASK-016", "Git commit module")
	want := "feat(loom): [TASK-016] Git commit module"
	if msg != want {
		t.Errorf("got %q, want %q", msg, want)
	}
}

func TestHeadHash_NoCommits(t *testing.T) {
	dir := initRepo(t)
	_, err := HeadHash(dir)
	if err == nil {
		t.Error("expected error for repo with no commits, got nil")
	}
}

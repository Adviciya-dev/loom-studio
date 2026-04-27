package git

import (
	"fmt"
	"os/exec"
	"strings"
)

// CommitMessage returns the standard Loom commit message for a task.
func CommitMessage(taskID, taskTitle string) string {
	return fmt.Sprintf("feat(loom): [%s] %s", taskID, taskTitle)
}

// StageAll runs `git add -A` in projectPath.
func StageAll(projectPath string) error {
	cmd := exec.Command("git", "add", "-A")
	cmd.Dir = projectPath
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("git add -A: %w — %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}

// Commit runs `git commit -m <message>` in projectPath.
func Commit(projectPath, message string) error {
	cmd := exec.Command("git", "commit", "-m", message)
	cmd.Dir = projectPath
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("git commit: %w — %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}

// HeadHash returns the abbreviated SHA of the current HEAD commit.
func HeadHash(projectPath string) (string, error) {
	cmd := exec.Command("git", "rev-parse", "HEAD")
	cmd.Dir = projectPath
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("git rev-parse HEAD: %w", err)
	}
	return strings.TrimSpace(string(out)), nil
}

// CommitWithMessage stages all changes and commits with a user-provided message.
func CommitWithMessage(projectPath, message string) (string, error) {
	if err := StageAll(projectPath); err != nil {
		return "", err
	}
	if err := Commit(projectPath, message); err != nil {
		return "", err
	}
	return HeadHash(projectPath)
}

// StageAndCommit stages all changes, creates a commit with the Loom message
// format, and returns the resulting HEAD commit hash.
func StageAndCommit(projectPath, taskID, taskTitle string) (string, error) {
	if err := StageAll(projectPath); err != nil {
		return "", err
	}
	if err := Commit(projectPath, CommitMessage(taskID, taskTitle)); err != nil {
		return "", err
	}
	return HeadHash(projectPath)
}

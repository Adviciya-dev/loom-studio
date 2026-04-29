package diff

import (
	"errors"
	"os/exec"
	"strings"
)

// ErrNoDiff is returned when git diff produces no output (working tree is clean).
var ErrNoDiff = errors.New("no changes in working tree")

// Extract returns the unified diff of all uncommitted changes in projectPath.
// It checks unstaged changes, staged changes, and untracked files in that order.
// Returns ErrNoDiff when nothing has changed relative to HEAD.
func Extract(projectPath string) (string, error) {
	// Stage everything so `git diff HEAD` captures new files too.
	stageCmd := exec.Command("git", "add", "-A")
	stageCmd.Dir = projectPath
	_ = stageCmd.Run() // best-effort; ignore errors

	cmd := exec.Command("git", "diff", "HEAD")
	cmd.Dir = projectPath
	out, err := cmd.Output()
	if err != nil {
		return "", err
	}
	raw := strings.TrimSpace(string(out))
	if raw == "" {
		return "", ErrNoDiff
	}
	return raw, nil
}

// ExtractFile returns the diff for a single file relative to HEAD.
// It stages the file first so newly created files are captured.
// Returns ErrNoDiff when the file has no changes relative to HEAD.
func ExtractFile(projectPath, filePath string) (string, error) {
	// Stage the specific file so new/untracked files show in the diff.
	stageCmd := exec.Command("git", "add", "--", filePath)
	stageCmd.Dir = projectPath
	_ = stageCmd.Run()

	cmd := exec.Command("git", "diff", "HEAD", "--", filePath)
	cmd.Dir = projectPath
	out, err := cmd.Output()
	if err != nil {
		return "", err
	}
	raw := strings.TrimSpace(string(out))
	if raw == "" {
		return "", ErrNoDiff
	}
	return raw, nil
}

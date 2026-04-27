package diff

import (
	"errors"
	"os/exec"
	"strings"
)

// ErrNoDiff is returned when git diff produces no output (working tree is clean).
var ErrNoDiff = errors.New("no changes in working tree")

// Extract runs `git diff` in projectPath and returns the raw unified diff.
// Returns ErrNoDiff when the output is empty (nothing to show).
func Extract(projectPath string) (string, error) {
	cmd := exec.Command("git", "diff")
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

// ExtractFile runs `git diff -- <filePath>` and returns the diff for that file only.
// Returns ErrNoDiff when the file has no unstaged changes.
func ExtractFile(projectPath, filePath string) (string, error) {
	cmd := exec.Command("git", "diff", "--", filePath)
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

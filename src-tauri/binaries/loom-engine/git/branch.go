package git

import (
	"fmt"
	"os/exec"
	"strings"
)

// TaskBranchName converts a task ID into a git-safe branch name under "loom/".
// e.g. "TASK-001" → "loom/task-001", "PUBLIC-APP-FOO" → "loom/public-app-foo"
func TaskBranchName(taskID string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(taskID) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		} else {
			b.WriteByte('-')
		}
	}
	s := strings.Trim(b.String(), "-")
	for strings.Contains(s, "--") {
		s = strings.ReplaceAll(s, "--", "-")
	}
	if s == "" {
		return "loom/task"
	}
	return "loom/" + s
}

// GetCurrentBranch returns the name of the currently checked-out branch.
func GetCurrentBranch(projectPath string) (string, error) {
	cmd := exec.Command("git", "rev-parse", "--abbrev-ref", "HEAD")
	cmd.Dir = projectPath
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("git rev-parse --abbrev-ref HEAD: %w", err)
	}
	return strings.TrimSpace(string(out)), nil
}

// ListBranches returns all local branch names.
func ListBranches(projectPath string) ([]string, error) {
	cmd := exec.Command("git", "branch", "--format=%(refname:short)")
	cmd.Dir = projectPath
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("git branch: %w", err)
	}
	var branches []string
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if b := strings.TrimSpace(line); b != "" {
			branches = append(branches, b)
		}
	}
	return branches, nil
}

// CreateBranch creates a new branch and checks it out (`git checkout -b <branch>`).
func CreateBranch(projectPath, branch string) error {
	cmd := exec.Command("git", "checkout", "-b", branch)
	cmd.Dir = projectPath
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("cannot create branch %q: %s", branch, strings.TrimSpace(string(out)))
	}
	return nil
}

// CheckoutBranch runs `git checkout <branch>` in projectPath.
func CheckoutBranch(projectPath, branch string) error {
	cmd := exec.Command("git", "checkout", branch)
	cmd.Dir = projectPath
	out, err := cmd.CombinedOutput()
	if err != nil {
		msg := strings.TrimSpace(string(out))
		if strings.Contains(msg, "would be overwritten by checkout") {
			return fmt.Errorf("cannot switch to %q — you have uncommitted changes. Commit them first, then switch.", branch)
		}
		return fmt.Errorf("git checkout %s: %w — %s", branch, err, msg)
	}
	return nil
}

package git

import (
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
)

// GetRemoteURL returns the fetch URL of the "origin" remote.
func GetRemoteURL(projectPath string) (string, error) {
	cmd := exec.Command("git", "remote", "get-url", "origin")
	cmd.Dir = projectPath
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("no remote origin configured")
	}
	return strings.TrimSpace(string(out)), nil
}

// GetAheadBehind returns how many commits HEAD is ahead/behind origin/<branch>.
// Returns (0, 0) silently when tracking info is unavailable.
func GetAheadBehind(projectPath, branch string) (ahead, behind int) {
	cmd := exec.Command("git", "rev-list", "--left-right", "--count",
		"origin/"+branch+"...HEAD")
	cmd.Dir = projectPath
	out, err := cmd.Output()
	if err != nil {
		return 0, 0
	}
	parts := strings.Fields(strings.TrimSpace(string(out)))
	if len(parts) != 2 {
		return 0, 0
	}
	behind, _ = strconv.Atoi(parts[0])
	ahead, _ = strconv.Atoi(parts[1])
	return ahead, behind
}

// gitCmd builds a git remote command with GIT_TERMINAL_PROMPT=0 so it
// fails fast instead of hanging waiting for credentials.
func gitCmd(projectPath string, args ...string) *exec.Cmd {
	cmd := exec.Command("git", args...)
	cmd.Dir = projectPath
	cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0")
	return cmd
}

// Fetch runs `git fetch origin`, using whatever credentials the system has configured.
func Fetch(projectPath string) error {
	out, err := gitCmd(projectPath, "fetch", "origin").CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s", strings.TrimSpace(string(out)))
	}
	return nil
}

// ErrDivergentBranches is returned when git pull detects divergent histories
// and no reconcile strategy has been configured.
var ErrDivergentBranches = fmt.Errorf("divergent_branches")

// Pull runs `git pull origin <branch>`. strategy may be "merge", "rebase",
// "ff-only", or "" (let git use its default, which may error on divergence).
func Pull(projectPath, branch, strategy string) error {
	args := []string{"pull"}
	switch strategy {
	case "merge":
		args = append(args, "--no-rebase")
	case "rebase":
		args = append(args, "--rebase")
	case "ff-only":
		args = append(args, "--ff-only")
	}
	args = append(args, "origin", branch)
	out, err := gitCmd(projectPath, args...).CombinedOutput()
	msg := strings.TrimSpace(string(out))
	if err != nil {
		if strings.Contains(msg, "divergent") || strings.Contains(msg, "reconcile") {
			return ErrDivergentBranches
		}
		return fmt.Errorf("%s", msg)
	}
	return nil
}

// Push runs `git push origin <branch>`.
func Push(projectPath, branch string) error {
	out, err := gitCmd(projectPath, "push", "origin", branch).CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s", strings.TrimSpace(string(out)))
	}
	return nil
}

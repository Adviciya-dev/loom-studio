package git

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
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

// MergeConflictError holds the list of files that have merge conflicts.
type MergeConflictError struct {
	Files []string
}

func (e *MergeConflictError) Error() string { return "merge_conflicts" }

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
		// Parse conflict file list from output lines like "CONFLICT (...): path"
		var conflicts []string
		for _, line := range strings.Split(msg, "\n") {
			if strings.HasPrefix(line, "CONFLICT") {
				// "CONFLICT (content): Merge conflict in path/to/file"
				if idx := strings.LastIndex(line, " in "); idx != -1 {
					conflicts = append(conflicts, strings.TrimSpace(line[idx+4:]))
				}
			}
		}
		if len(conflicts) > 0 {
			return &MergeConflictError{Files: conflicts}
		}
		// Already in a conflicted state (unmerged files)
		if strings.Contains(msg, "unmerged files") || strings.Contains(msg, "Merge conflict") {
			return &MergeConflictError{Files: []string{}}
		}
		return fmt.Errorf("%s", msg)
	}
	return nil
}

// UnmergedFiles returns paths that have unresolved merge conflicts.
// It checks for .git/MERGE_HEAD (active merge) or .git/rebase-merge/
// (active rebase), then lists unmerged paths from the index via
// `git ls-files -u`, which is reliable even after lint-staged stash/revert.
func UnmergedFiles(projectPath string) []string {
	// Detect an in-progress merge or rebase.
	mergeHead := filepath.Join(projectPath, ".git", "MERGE_HEAD")
	rebaseMerge := filepath.Join(projectPath, ".git", "rebase-merge")
	rebaseApply := filepath.Join(projectPath, ".git", "rebase-apply")

	_, hasMerge := os.Stat(mergeHead)
	_, hasRebaseMerge := os.Stat(rebaseMerge)
	_, hasRebaseApply := os.Stat(rebaseApply)

	if hasMerge != nil && hasRebaseMerge != nil && hasRebaseApply != nil {
		return nil // no merge/rebase in progress
	}

	// List unmerged index entries — format: "mode hash stage\tpath"
	cmd := exec.Command("git", "ls-files", "-u")
	cmd.Dir = projectPath
	out, err := cmd.Output()
	if err != nil || strings.TrimSpace(string(out)) == "" {
		// Fallback: git diff --diff-filter=U
		cmd2 := exec.Command("git", "diff", "--name-only", "--diff-filter=U")
		cmd2.Dir = projectPath
		out2, _ := cmd2.Output()
		var files []string
		for _, line := range strings.Split(strings.TrimSpace(string(out2)), "\n") {
			if line = strings.TrimSpace(line); line != "" {
				files = append(files, line)
			}
		}
		return files
	}

	seen := map[string]bool{}
	var files []string
	for _, line := range strings.Split(string(out), "\n") {
		parts := strings.SplitN(line, "\t", 2)
		if len(parts) == 2 {
			path := strings.TrimSpace(parts[1])
			if path != "" && !seen[path] {
				seen[path] = true
				files = append(files, path)
			}
		}
	}
	return files
}

// ConflictMarkerFiles returns files that contain leftover conflict markers
// (<<<<<<< / ======= / >>>>>>>) even when no active merge is in progress.
// Uses `git diff --check` which specifically reports conflict markers.
func ConflictMarkerFiles(projectPath string) []string {
	cmd := exec.Command("git", "diff", "--check")
	cmd.Dir = projectPath
	out, _ := cmd.CombinedOutput() // non-zero exit when markers found; that's expected
	seen := map[string]bool{}
	var files []string
	for _, line := range strings.Split(string(out), "\n") {
		// Format: "path/to/file:N: leftover conflict marker"
		if colon := strings.Index(line, ":"); colon > 0 {
			path := strings.TrimSpace(line[:colon])
			if path != "" && !strings.HasPrefix(path, "warning") && !seen[path] {
				seen[path] = true
				files = append(files, path)
			}
		}
	}
	return files
}

// MergeAbort runs `git merge --abort` to undo a failed merge.
// Falls back to `git rebase --abort` when a rebase strategy was used.
func MergeAbort(projectPath string) error {
	cmd := exec.Command("git", "merge", "--abort")
	cmd.Dir = projectPath
	if out, err := cmd.CombinedOutput(); err != nil {
		cmd2 := exec.Command("git", "rebase", "--abort")
		cmd2.Dir = projectPath
		if out2, err2 := cmd2.CombinedOutput(); err2 != nil {
			_ = out
			return fmt.Errorf("%s", strings.TrimSpace(string(out2)))
		}
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

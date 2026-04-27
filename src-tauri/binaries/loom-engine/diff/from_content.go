package diff

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// FromContent computes a unified diff between the current file on disk and
// proposedContent (what Claude intends to write). Works for new files too.
// Returns ErrNoDiff if the content is identical.
func FromContent(filePath, proposedContent, sessionID string) (DiffPayload, error) {
	// Write proposed content to a temp file.
	tmp, err := os.CreateTemp("", "loom-diff-*.tmp")
	if err != nil {
		return DiffPayload{}, err
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.WriteString(proposedContent); err != nil {
		tmp.Close()
		return DiffPayload{}, err
	}
	tmp.Close()

	// Current file path — use /dev/null if the file doesn't exist yet.
	current := filePath
	if _, statErr := os.Stat(filePath); os.IsNotExist(statErr) {
		current = os.DevNull
	}

	// git diff --no-index -- current proposed
	cmd := exec.Command("git", "diff", "--no-index", "--", current, tmp.Name())
	out, _ := cmd.Output() // exit 1 = differences exist, that's expected
	raw := strings.TrimSpace(string(out))
	if raw == "" {
		return DiffPayload{}, ErrNoDiff
	}

	// Replace the temp filename in the diff header with the real path so the
	// frontend shows a meaningful file name.
	shortName := filepath.Base(filePath)
	raw = strings.ReplaceAll(raw, tmp.Name(), filePath)
	raw = strings.ReplaceAll(raw, os.DevNull, shortName)

	return Parse(raw, sessionID)
}

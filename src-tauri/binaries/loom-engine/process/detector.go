package process

import "strings"

// defaultPatterns are the known Claude CLI confirmation prompt substrings.
var defaultPatterns = []string{
	"Do you want to proceed?",
	"Apply this change?",
	"Continue with",
	"[y/n]",
	"[Y/n]",
}

// Detector watches lines for Claude confirmation prompts.
// Patterns are configurable so users can extend the default set.
type Detector struct {
	patterns []string
}

func NewDetector() *Detector {
	p := make([]string, len(defaultPatterns))
	copy(p, defaultPatterns)
	return &Detector{patterns: p}
}

// AddPattern appends a custom confirmation pattern.
func (d *Detector) AddPattern(pattern string) {
	d.patterns = append(d.patterns, pattern)
}

// Patterns returns a copy of the current pattern list.
func (d *Detector) Patterns() []string {
	out := make([]string, len(d.patterns))
	copy(out, d.patterns)
	return out
}

// IsConfirmation returns true if line contains any registered pattern.
func (d *Detector) IsConfirmation(line string) bool {
	for _, p := range d.patterns {
		if strings.Contains(line, p) {
			return true
		}
	}
	return false
}

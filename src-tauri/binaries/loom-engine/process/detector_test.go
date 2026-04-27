package process

import "testing"

func TestIsConfirmation_TruePositives(t *testing.T) {
	d := NewDetector()

	cases := []string{
		"Do you want to proceed?",
		"  Do you want to proceed?  ",
		"Apply this change?",
		"Apply this change? (1 file)",
		"Continue with the following changes:",
		"Press [y/n] to confirm",
		"Enter [Y/n]:",
	}

	for _, line := range cases {
		if !d.IsConfirmation(line) {
			t.Errorf("expected true for %q", line)
		}
	}
}

func TestIsConfirmation_FalsePositives(t *testing.T) {
	d := NewDetector()

	cases := []string{
		"Writing file src/main.go",
		"Running tests...",
		"✓ All tests passed",
		"error: compilation failed",
		"warn: unused variable",
		"",
		"INFO task started",
		"Claude is thinking...",
		"Applying diff to 3 files",
	}

	for _, line := range cases {
		if d.IsConfirmation(line) {
			t.Errorf("expected false for %q", line)
		}
	}
}

func TestAddPattern(t *testing.T) {
	d := NewDetector()
	d.AddPattern("Are you sure?")

	if !d.IsConfirmation("Are you sure? (this cannot be undone)") {
		t.Error("custom pattern not detected")
	}

	// Default patterns still work
	if !d.IsConfirmation("Do you want to proceed?") {
		t.Error("default pattern broken after AddPattern")
	}
}

func TestPatterns_ReturnsCopy(t *testing.T) {
	d := NewDetector()
	p1 := d.Patterns()
	p1[0] = "mutated"
	p2 := d.Patterns()
	if p2[0] == "mutated" {
		t.Error("Patterns() must return a copy, not a reference")
	}
}

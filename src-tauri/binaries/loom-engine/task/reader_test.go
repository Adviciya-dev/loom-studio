package task

import (
	"os"
	"path/filepath"
	"testing"
)

// Uses the real project task format: # TASK-XXX: Title + ## Meta table
const validMD = `# TASK-001: Build Feature X

## Meta
| Field | Value |
|-------|-------|
| **Assignee** | dev |
| **Status** | 📋 To Do |
| **Priority** | P0 |
| **Due Date** | 2026-05-01 |

---

## Description
This is the description.

---

## Sub Tasks
- [x] Step one done
- [ ] Step two pending

## Claude Code Context
` + "```" + `
harness/claude.md
` + "```" + `
`

const noHeadingMD = `Just some markdown content without a heading.

Some content here.
`

const doneMD = `# TASK-002: Done Task

## Meta
| Field | Value |
|-------|-------|
| **Status** | ✅ Done |
| **Due Date** | — |

## Sub Tasks
- [x] Only step
`

func TestReadAll_EmptyFolder(t *testing.T) {
	tasks, err := ReadAll("/nonexistent/path/that/does/not/exist")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(tasks) != 0 {
		t.Fatalf("expected empty slice, got %d tasks", len(tasks))
	}
}

func TestReadAll_ValidTask(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "task.md"), []byte(validMD), 0644); err != nil {
		t.Fatal(err)
	}

	tasks, err := ReadAll(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(tasks) != 1 {
		t.Fatalf("expected 1 task, got %d", len(tasks))
	}

	task := tasks[0]
	if task.ID != "TASK-001" {
		t.Errorf("ID: want TASK-001, got %q", task.ID)
	}
	if task.Title != "Build Feature X" {
		t.Errorf("Title: want 'Build Feature X', got %q", task.Title)
	}
	if task.Status != StatusPending {
		t.Errorf("Status: want pending, got %q", task.Status)
	}
	if task.Due != "2026-05-01" {
		t.Errorf("Due: want 2026-05-01, got %q", task.Due)
	}
	if len(task.Steps) != 2 {
		t.Fatalf("Steps: want 2, got %d", len(task.Steps))
	}
	if !task.Steps[0].Done {
		t.Error("Step[0] should be done")
	}
	if task.Steps[1].Done {
		t.Error("Step[1] should not be done")
	}
	if task.Prompt == "" {
		t.Error("Prompt should not be empty")
	}
}

func TestReadAll_NoHeading_Skipped(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "bad.md"), []byte(noHeadingMD), 0644); err != nil {
		t.Fatal(err)
	}

	tasks, err := ReadAll(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(tasks) != 0 {
		t.Errorf("expected 0 tasks (skipped), got %d", len(tasks))
	}
}

func TestReadAll_StatusDone(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "done.md"), []byte(doneMD), 0644); err != nil {
		t.Fatal(err)
	}

	tasks, err := ReadAll(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(tasks) != 1 {
		t.Fatalf("expected 1 task, got %d", len(tasks))
	}
	if tasks[0].Status != StatusCompleted {
		t.Errorf("Status: want completed, got %q", tasks[0].Status)
	}
}

func TestReadAll_MixedFiles(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "valid.md"), []byte(validMD), 0644)
	os.WriteFile(filepath.Join(dir, "bad.md"), []byte(noHeadingMD), 0644)
	os.WriteFile(filepath.Join(dir, "readme.txt"), []byte("not markdown"), 0644)

	tasks, err := ReadAll(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(tasks) != 1 {
		t.Errorf("expected 1 valid task, got %d", len(tasks))
	}
}

func TestReadAll_NestedFolders(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "direct.md"), []byte(validMD), 0644)
	subDir := filepath.Join(dir, "tasks", "Phase 1")
	os.MkdirAll(subDir, 0755)
	os.WriteFile(filepath.Join(subDir, "nested.md"), []byte(doneMD), 0644)

	tasks, err := ReadAll(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(tasks) != 2 {
		t.Errorf("expected 2 tasks (1 direct + 1 nested), got %d", len(tasks))
	}
}

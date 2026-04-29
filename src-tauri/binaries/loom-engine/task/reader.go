package task

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

var timeNow = time.Now

var (
	reH1      = regexp.MustCompile(`^#\s+(.+)`)
	reTaskID  = regexp.MustCompile(`^(TASK-\d+)`)
	reMetaRow = regexp.MustCompile(`^\|\s*\*\*(.+?)\*\*\s*\|\s*(.+?)\s*\|`)
)

var reTaskNum = regexp.MustCompile(`TASK-(\d+)`)

// taskNumber extracts the numeric part of a task ID (e.g. "TASK-007" → 7).
func taskNumber(id string) int {
	m := reTaskNum.FindStringSubmatch(id)
	if m == nil {
		return 999999
	}
	n, _ := strconv.Atoi(m[1])
	return n
}

// ReadAll walks harnessPath/tasks/ recursively and parses every .md file whose
// filename starts with "TASK-" into a Task. Results are sorted by task number.
// Returns an empty slice if the folder does not exist.
func ReadAll(harnessPath string) ([]Task, error) {
	tasksDir := filepath.Join(harnessPath, "tasks")
	info, err := os.Stat(tasksDir)
	if err != nil || !info.IsDir() {
		return []Task{}, nil
	}

	tasks := make([]Task, 0)
	err = filepath.WalkDir(tasksDir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		name := d.Name()
		if d.IsDir() || !strings.HasSuffix(name, ".md") || !strings.HasPrefix(name, "TASK-") {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			fmt.Fprintf(os.Stderr, "task: skipping %s: %v\n", path, err)
			return nil
		}
		// Compute path relative to the project root (parent of harnessPath).
		projectRoot := filepath.Dir(harnessPath)
		relPath, relErr := filepath.Rel(projectRoot, path)
		if relErr != nil {
			relPath = path
		}
		t, err := parseTask(string(data), name, relPath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "task: skipping %s: %v\n", path, err)
			return nil
		}
		tasks = append(tasks, t)
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("task.ReadAll: %w", err)
	}

	sort.Slice(tasks, func(i, j int) bool {
		return taskNumber(tasks[i].ID) < taskNumber(tasks[j].ID)
	})
	return tasks, nil
}

// parseTask parses a task markdown file. filePath is the path relative to the
// project root, used to build a predefined prompt when no explicit prompt exists.
func parseTask(content, filename, filePath string) (Task, error) {
	lines := strings.Split(content, "\n")
	t := Task{Filename: filename, FilePath: filePath, Steps: make([]Step, 0)}

	// Extract ID and title from the first # heading
	for _, l := range lines {
		if m := reH1.FindStringSubmatch(strings.TrimSpace(l)); m != nil {
			heading := m[1] // e.g. "TASK-007: Task System · Go Task File Reader"
			colon := strings.Index(heading, ":")
			if colon != -1 {
				t.ID = strings.TrimSpace(heading[:colon])
				t.Title = strings.TrimSpace(heading[colon+1:])
			} else {
				t.Title = heading
				if idm := reTaskID.FindString(heading); idm != "" {
					t.ID = idm
				}
			}
			break
		}
	}

	if t.Title == "" {
		return Task{}, fmt.Errorf("no heading found")
	}

	// Parse sections
	type section struct {
		name  string
		lines []string
	}
	var sections []section
	var cur *section

	for _, l := range lines {
		trimmed := strings.TrimSpace(l)
		if strings.HasPrefix(trimmed, "## ") {
			sections = append(sections, section{name: strings.TrimPrefix(trimmed, "## ")})
			cur = &sections[len(sections)-1]
			continue
		}
		if cur != nil {
			cur.lines = append(cur.lines, l)
		}
	}

	for _, sec := range sections {
		switch {
		case sec.name == "Meta":
			for _, l := range sec.lines {
				m := reMetaRow.FindStringSubmatch(l)
				if m == nil {
					continue
				}
				key := strings.ToLower(strings.TrimSpace(m[1]))
				val := strings.TrimSpace(m[2])
				switch key {
				case "status":
					t.Status = normaliseStatus(val)
				case "due date":
					if val != "—" && val != "-" {
						t.Due = val
					}
				case "type":
					t.Type = TaskType(strings.ToLower(val))
				}
			}

		case sec.name == "Description":
			var dl []string
			for _, l := range sec.lines {
				trimmed := strings.TrimSpace(l)
				if trimmed == "---" {
					break
				}
				dl = append(dl, l)
			}
			t.Description = strings.TrimSpace(strings.Join(dl, "\n"))

		case sec.name == "Sub Tasks":
			for _, l := range sec.lines {
				trimmed := strings.TrimSpace(l)
				if strings.HasPrefix(trimmed, "- [x] ") {
					t.Steps = append(t.Steps, Step{Text: trimmed[6:], Done: true})
				} else if strings.HasPrefix(trimmed, "- [ ] ") {
					t.Steps = append(t.Steps, Step{Text: trimmed[6:], Done: false})
				}
			}

		case sec.name == "Claude Code Context":
			t.Prompt = strings.TrimSpace(strings.Join(sec.lines, "\n"))
		}
	}

	if t.Status == "" {
		t.Status = StatusPending
	}

	// If no explicit prompt (or only placeholder content like "—", "---", "N/A",
	// or empty code fences), build a predefined prompt that points Claude at the
	// task file so it reads and implements it directly.
	stripped := t.Prompt
	for _, r := range []string{"```", "—", "-", "N/A", "n/a", " ", "\t", "\n", "\r"} {
		stripped = strings.ReplaceAll(stripped, r, "")
	}
	if strings.TrimSpace(stripped) == "" {
		t.Prompt = "Read the task file at `" + filePath + "` and implement everything described in it. " +
			"Follow all sub-tasks, acceptance criteria, and technical notes exactly as specified. " +
			"Do not ask for clarification — implement the full task as written."
	}

	return t, nil
}

var reStatusRow = regexp.MustCompile(`(?i)^\|\s*\*\*Status\*\*\s*\|`)
var reStartDateRow = regexp.MustCompile(`(?i)^\|\s*\*\*Start\s+Date\*\*\s*\|`)
var reCompletedRow = regexp.MustCompile(`(?i)^\|\s*\*\*Completed\*\*\s*\|`)

// findTaskFile walks projectPath/harness/tasks/ and returns the absolute path
// of the first .md file whose parsed ID matches taskID.
func findTaskFile(projectPath, taskID string) string {
	tasksDir := filepath.Join(projectPath, "harness", "tasks")
	var found string
	_ = filepath.WalkDir(tasksDir, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		name := d.Name()
		if !strings.HasSuffix(name, ".md") || !strings.HasPrefix(name, "TASK-") {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return nil
		}
		t, err := parseTask(string(data), name, path)
		if err != nil {
			return nil
		}
		if t.ID == taskID {
			found = path
			return filepath.SkipAll
		}
		return nil
	})
	return found
}

// patchRow replaces the value cell of the first matching Meta table row.
func patchRow(lines []string, re *regexp.Regexp, value string) {
	for i, line := range lines {
		if re.MatchString(line) {
			parts := strings.Split(line, "|")
			if len(parts) >= 4 {
				parts[2] = " " + value + " "
				lines[i] = strings.Join(parts, "|")
			}
			break
		}
	}
}

// MarkTaskStarted sets Status → "🔄 In Progress" and Start Date → today in the
// task file, then returns the path relative to projectPath so it can be
// embedded in the Claude prompt for the completion instruction.
func MarkTaskStarted(projectPath, taskID string) (relPath string, err error) {
	absPath := findTaskFile(projectPath, taskID)
	if absPath == "" {
		return "", fmt.Errorf("task file for %s not found", taskID)
	}

	data, err := os.ReadFile(absPath)
	if err != nil {
		return "", err
	}

	now := timeNow()
	today := fmt.Sprintf("%d-%02d-%02d", now.Year(), int(now.Month()), now.Day())

	lines := strings.Split(string(data), "\n")
	patchRow(lines, reStatusRow, "🔄 In Progress")
	patchRow(lines, reStartDateRow, today)

	if err := os.WriteFile(absPath, []byte(strings.Join(lines, "\n")), 0o644); err != nil {
		return "", err
	}

	rel, err := filepath.Rel(projectPath, absPath)
	if err != nil {
		rel = absPath
	}
	return filepath.ToSlash(rel), nil
}

// normaliseStatus maps emoji/text status values to canonical Status constants.
func normaliseStatus(raw string) Status {
	lower := strings.ToLower(raw)
	switch {
	case strings.Contains(lower, "done") || strings.Contains(lower, "✅") || strings.Contains(lower, "completed"):
		return StatusCompleted
	case strings.Contains(lower, "progress") || strings.Contains(lower, "🔄") || strings.Contains(lower, "in progress"):
		return StatusInProgress
	default:
		return StatusPending
	}
}

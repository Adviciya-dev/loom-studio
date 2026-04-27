# TASK-007: Task System · Go Task File Reader

## Meta
| Field | Value |
|-------|-------|
| **Assignee** | akshay-ksd |
| **Status** | ✅ Done |
| **Priority** | P0 |
| **Sprint** | Sprint 2 |
| **Story Points** | 3 |
| **PRD Reference** | prd.md §5 |
| **Architecture Ref** | architecture.md §3.4 |
| **Start Date** | — |
| **Due Date** | — |
| **Created** | 2026-04-20 |
| **Completed** | 2026-04-20 |

---

## Description
Implement the Go task file reader (`task/reader.go`) that scans the `harness/` folder of a project, reads all `.md` files, and parses each into a structured `Task` struct. The reader must handle YAML frontmatter (id, title, type, status, due), description body, step list with completion states, and the `## Prompt` section used when invoking Claude Code CLI.

---

## Sub Tasks
- [ ] Define Go `Task` struct: `ID`, `Title`, `Type`, `Status`, `Due`, `Description`, `Steps []Step`, `Prompt`
- [ ] Define `Step` struct: `Text string`, `Done bool`
- [ ] Implement `task.ReadAll(harnessPath string) ([]Task, error)` — scans folder, reads all `.md` files
- [ ] Implement frontmatter parser — extract YAML block between `---` delimiters
- [ ] Implement step list parser — parse `- [x]` (done) and `- [ ]` (pending) lines
- [ ] Implement prompt extractor — capture text under `## Prompt` section
- [ ] Return empty slice (not error) if `harness/` folder does not exist
- [ ] Skip files that fail to parse; log a warning with filename
- [ ] Expose `read_harness_tasks` via IPC to Tauri shell (delegate to this reader)
- [ ] Write unit tests for all parse cases: valid task, missing frontmatter, missing prompt, empty folder

---

## Acceptance Criteria
- [ ] `task.ReadAll()` returns correct `Task` structs for all valid `.md` files in `harness/`
- [ ] Frontmatter fields (`id`, `title`, `type`, `status`, `due`) parsed correctly
- [ ] Step list parsed: `- [x]` → `Done: true`, `- [ ]` → `Done: false`
- [ ] `## Prompt` section content extracted into `Task.Prompt`
- [ ] Missing frontmatter or missing prompt: file is skipped with a warning, not a crash
- [ ] Missing `harness/` folder returns empty slice, no error
- [ ] Unit tests cover valid, malformed, and edge-case files

---

## Technical Notes
- Do not use a third-party YAML library for the simple frontmatter — parse manually with `strings.Split` and a loop to avoid unnecessary dependencies.
- Task type values: `feature`, `perf`, `security`, `test`, `design`.
- Task status values: `pending`, `in-progress`, `completed`.

---

## Files to Create/Modify
```
CREATE:
src-tauri/binaries/loom-engine/task/reader.go
src-tauri/binaries/loom-engine/task/reader_test.go
src-tauri/binaries/loom-engine/task/types.go
```

---

## API Endpoints
N/A — no API endpoints in this task

---

## UI Screens
- **—**

---

## Related Test Cases
- `task/reader_test.go` — valid task, missing frontmatter, missing prompt, empty folder, malformed file

## Dependencies
- **Blocked by:** TASK-003
- **Blocks:** TASK-008

---

## Claude Code Context
```
harness/claude.md
harness/tasks/Phase 2 — Task System/TASK-007 — Task System · Go Task File Reader.md
harness/architecture.md §3.4
harness/prd.md §5
```

---

## Progress Log
| Date | Update |
|------|--------|
| — | No updates yet |

---

## Time Log
| Date | Hours | Note |
|------|-------|------|
| — | — | No time logged |

---

## Review Notes
- **—**

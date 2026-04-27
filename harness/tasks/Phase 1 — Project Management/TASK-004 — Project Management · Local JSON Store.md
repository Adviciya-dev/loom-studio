# TASK-004: Project Management · Local JSON Store

## Meta
| Field | Value |
|-------|-------|
| **Assignee** | akshay-ksd |
| **Status** | ✅ Done |
| **Priority** | P0 |
| **Sprint** | Sprint 1 |
| **Story Points** | 3 |
| **PRD Reference** | prd.md §6.1 |
| **Architecture Ref** | architecture.md §3.5 |
| **Start Date** | 2026-04-20 |
| **Due Date** | — |
| **Created** | 2026-04-20 |
| **Completed** | 2026-04-20 |

---

## Description
Implement the local JSON store in the Go engine (`store/json.go`). This is the single persistence layer for all Loom state: saved projects, active project ID, task history, and user preferences. The store must read/write atomically to prevent corruption on crash, and must initialize from defaults if the file is missing or malformed.

---

## Sub Tasks
- [x] Define Go structs: `State`, `Project`, `TaskHistory`, `Preferences`
- [x] Implement `store.Load()` — read and unmarshal `state.json` from OS user data directory
- [x] Implement `store.Save()` — marshal and write atomically (write to `.tmp`, then rename)
- [x] Implement `store.Reset()` — overwrite with default state, log warning
- [x] Resolve OS user data directory path: `~/Library/Application Support/loom/` (macOS), `~/.config/loom/` (Linux), `%APPDATA%\loom\` (Windows)
- [x] Handle missing file: initialize with default state, write to disk
- [x] Handle malformed JSON: log warning, reset to defaults
- [x] Expose store methods via IPC commands: `get_projects`, `save_project`, `get_preferences`, `save_preferences`
- [x] Write unit tests for Load, Save, Reset, and corruption recovery

---

## Acceptance Criteria
- [ ] `store.Load()` returns the correct state from an existing `state.json`
- [ ] `store.Save()` writes atomically — partial writes do not corrupt the file
- [ ] Missing `state.json` results in default state being written on first run
- [ ] Malformed JSON resets to defaults and logs a warning — does not crash
- [ ] State file path resolves correctly on macOS, Linux, and Windows
- [ ] Unit tests pass for all store operations including corruption recovery
- [ ] IPC commands `get_projects` and `save_project` call through to the store correctly

---

## Technical Notes
- Atomic write pattern: write to `state.tmp`, then `os.Rename` to `state.json`. Rename is atomic on all target platforms.
- Use `os/user` or `os.UserConfigDir()` for the platform-correct config directory.
- Default state: empty projects array, no active project, preferences `{theme: "dark", log_autoscroll: true, default_diff_view: "split"}`.

---

## Files to Create/Modify
```
CREATE:
src-tauri/binaries/loom-engine/store/json.go
src-tauri/binaries/loom-engine/store/json_test.go
src-tauri/binaries/loom-engine/store/types.go
```

---

## API Endpoints
N/A — no API endpoints in this task

---

## UI Screens
- **—**

---

## Related Test Cases
- `store/json_test.go` — Load, Save, Reset, corruption recovery

## Dependencies
- **Blocked by:** TASK-003
- **Blocks:** TASK-005, TASK-006

---

## Claude Code Context
```
harness/claude.md
harness/tasks/Phase 1 — Project Management/TASK-004 — Project Management · Local JSON Store.md
harness/architecture.md §3.5
```

---

## Progress Log
| Date | Update |
|------|--------|
| 2026-04-20 | Implemented store/types.go (State, Project, TaskHistory, Preferences), store/json.go (Load, Save atomic, Reset, SaveProject upsert, SetActiveProject, SavePreferences, AddTaskHistory). Wired get_projects, save_project, set_active_project, get_preferences, save_preferences IPC commands in main.go. All 8 unit tests pass. go build ./... clean. |

---

## Time Log
| Date | Hours | Note |
|------|-------|------|
| — | — | No time logged |

---

## Review Notes
- **—**

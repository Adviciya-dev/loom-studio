# TASK-005: Project Management · Tauri IPC Commands

## Meta
| Field | Value |
|-------|-------|
| **Assignee** | akshay-ksd |
| **Status** | ✅ Done |
| **Priority** | P0 |
| **Sprint** | Sprint 1 |
| **Story Points** | 3 |
| **PRD Reference** | prd.md §6.1 |
| **Architecture Ref** | architecture.md §3.1 |
| **Start Date** | 2026-04-20 |
| **Due Date** | — |
| **Created** | 2026-04-20 |
| **Completed** | 2026-04-20 |

---

## Description
Implement the Tauri IPC commands that expose project management to the React frontend: `open_folder_picker`, `get_projects`, `save_project`, and `read_harness_tasks`. These are Rust-side Tauri commands that bridge the frontend to the OS (folder dialog) and the Go engine (project persistence via JSON store).

---

## Sub Tasks
- [x] Implement `open_folder_picker()` Tauri command — opens native OS folder dialog, returns selected path as `String`
- [x] Implement `get_projects()` Tauri command — calls Go engine via IPC, returns `Vec<Project>` serialized as JSON
- [x] Implement `save_project(project: Project)` Tauri command — sends project to Go engine for persistence
- [x] Implement `read_harness_tasks(path: String)` Tauri command — reads all `.md` files from `{path}/harness/`, returns raw file contents
- [x] Define shared TypeScript types: `Project`, `Task` in `src/types/index.ts`
- [x] Wire all commands into Tauri command registry (`src-tauri/src/main.rs`)
- [x] Handle errors: missing folder, permission denied, harness folder not found — return typed error responses

---

## Acceptance Criteria
- [ ] `open_folder_picker()` opens the native OS folder picker dialog and returns the selected path
- [ ] `open_folder_picker()` returns `null` if the user cancels the dialog
- [ ] `get_projects()` returns the correct project list from the Go engine store
- [ ] `save_project(project)` persists the project and is readable back via `get_projects()`
- [ ] `read_harness_tasks(path)` returns an array of raw `.md` file contents from `{path}/harness/`
- [ ] `read_harness_tasks(path)` returns an empty array (not an error) if `harness/` folder does not exist
- [ ] All commands are typed correctly in TypeScript — no `any`

---

## Technical Notes
- Tauri v2 command syntax: `#[tauri::command]` functions registered via `.invoke_handler(tauri::generate_handler![...])`.
- Use `tauri_plugin_dialog` for the native folder picker (Tauri v2 plugins replace old v1 APIs).
- TypeScript `invoke` calls should use the generic: `invoke<Project[]>('get_projects')`.

---

## Files to Create/Modify
```
CREATE:
src/types/index.ts
src/lib/ipc.ts

MODIFY:
src-tauri/src/main.rs
src-tauri/src/commands/mod.rs (new file for command handlers)
src-tauri/Cargo.toml
```

---

## API Endpoints
N/A — no API endpoints in this task

---

## UI Screens
- **—**

---

## Related Test Cases
—

## Dependencies
- **Blocked by:** TASK-004
- **Blocks:** TASK-006

---

## Claude Code Context
```
harness/claude.md
harness/tasks/Phase 1 — Project Management/TASK-005 — Project Management · Tauri IPC Commands.md
harness/architecture.md §3.1
```

---

## Progress Log
| Date | Update |
|------|--------|
| 2026-04-20 | Implemented src-tauri/src/commands.rs: open_folder_picker (tauri_plugin_dialog), read_harness_tasks (reads .md files, empty array if harness/ missing), engine_command (writes JSON to engine stdin). Updated lib.rs to hold CommandChild in EngineState managed state. Created src/lib/ipc.ts with fully typed wrappers and event listeners for all engine events. Added Preferences type to types/index.ts. tsc + eslint clean. cargo build 0.62s incremental. |

---

## Time Log
| Date | Hours | Note |
|------|-------|------|
| — | — | No time logged |

---

## Review Notes
- **—**

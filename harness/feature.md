# Loom — Modules

## 1. Tauri Shell (Rust)
Native OS layer. Owns window management, IPC bridge, file system access, process spawning, and system tray.

**IPC Commands:**
- `open_folder_picker()` — folder selection dialog
- `read_harness_tasks(path)` — read task `.md` files from harness/
- `get_projects()` — load saved projects from JSON store
- `save_project(project)` — persist project to JSON store
- `invoke_engine(command, args)` — dispatch commands to Go engine

---

## 2. React Frontend (TypeScript)

Single-page app rendered inside Tauri webview. No direct filesystem/process access — all operations via Tauri IPC.

### Components
| Component | Responsibility |
|-----------|----------------|
| `<App>` | Root component, global state provider |
| `<Sidebar>` | Nav icons: Dashboard, Tasks, Git, Settings |
| `<TopBar>` | Project selector, task tabs, Run/Pause, Create PR |
| `<ProjectSelector>` | Dropdown for saved projects + add new |
| `<TaskTabs>` | Active task tabs, add task button |
| `<RunControls>` | Run/Pause button, Create PR button |
| `<Workspace>` | Two-panel layout: task detail + log |
| `<TaskDetailPanel>` | Task ID, title, meta, description, step list |
| `<LogPanel>` | Streaming terminal output (read-only) |
| `<BottomBar>` | Custom prompt input, send button, status pills |
| `<TaskSelectModal>` | Task picker from harness/ folder |
| `<ProjectDropdown>` | Project list and add new project |
| `<DiffOverlay>` | Code diff review: file list + diff view + approve/reject |

### State (AppState)
- `projects` — saved project list
- `activeProject` — currently selected project
- `activeTasks` — open task tabs
- `activeTaskIndex` — focused tab
- `engineStatus` — `idle | running | paused | awaiting_approval`
- `logLines` — streamed terminal output
- `pendingDiff` — current diff waiting for user decision

---

## 3. Go CLI Core Engine

Runs as a Tauri sidecar. Manages Claude Code CLI child process and all Git operations.

### Sub-modules
| Package | File | Responsibility |
|---------|------|----------------|
| `process` | `manager.go` | Spawn, monitor, kill Claude CLI process |
| `process` | `streamer.go` | Line-by-line stdout/stderr streaming |
| `process` | `detector.go` | Confirmation prompt pattern detection |
| `diff` | `extractor.go` | Run `git diff`, parse output into DiffPayload |
| `diff` | `parser.go` | Parse unified diff into structured lines |
| `git` | `commit.go` | Stage and commit approved changes |
| `task` | `reader.go` | Parse `.md` task files from harness/ folder |
| `store` | `json.go` | Read/write local JSON state |
| `ipc` | `emitter.go` | Emit events to Tauri frontend |

### Events Emitted
| Event | Payload | Trigger |
|-------|---------|---------|
| `log_line` | `LogLine` | Every streamed stdout/stderr line |
| `diff_ready` | `DiffPayload` | Confirmation prompt detected |
| `task_complete` | task ID | Claude process exits 0 |
| `engine_error` | error string | Process exits non-zero |

---

## 4. Diff Interception Module

Core feature — intercepts Claude's confirmation prompt in real time, extracts `git diff`, and surfaces the diff panel before any changes are written to disk.

**Flow:**
1. Detector identifies confirmation pattern in output stream
2. Engine pauses stdin passthrough
3. `git diff` is run and parsed into `DiffPayload`
4. `diff_ready` event emitted to frontend
5. Engine blocks on decision channel
6. User approves → `y\n` written to stdin / User rejects → `n\n` + `git checkout .`

---

## 5. Approval System

Controls whether Claude's proposed changes are applied or discarded.

| Action | Behaviour |
|--------|-----------|
| **Approve** | Write changes, auto-commit, mark task steps done, resume Claude |
| **Reject** | Discard changes, `git checkout .`, log rejection, stop Claude |

---

## 6. Task System

Tasks are `.md` files in `{project_root}/harness/`. Loom reads these at task selection time.

**Task file fields:** `id`, `title`, `type`, `status`, `due`, description, step list, `## Prompt` section.

**Task types:** `feature`, `perf`, `security`, `test`, `design`  
**Task statuses:** `pending`, `in-progress`, `completed`

---

## 7. Local JSON Store

Persistent state stored at the OS user data directory.

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/loom/state.json` |
| Linux | `~/.config/loom/state.json` |
| Windows | `%APPDATA%\loom\state.json` |

**Stored data:** projects, active_project_id, task_history, preferences (theme, log_autoscroll, default_diff_view)

---

## 8. Execution Log Panel

Real-time terminal-style log view (read-only).

- Auto-scrolling output
- Timestamped lines with level labels: `INFO`, `SUCCESS`, `WARN`, `ERROR`, `PASS`
- Color coding: green (success), red (error), amber (warning)
- Live indicator when task is running

---

## 9. Project Management Module

Handles project selection, storage, and switching.

- Folder picker to select project root
- Stores project path in local JSON
- Displays active project name with status indicator
- Supports multiple saved projects

---

## Phase 2 Modules (Planned)

| Module | Description |
|--------|-------------|
| GitHub PR Integration | `gh` CLI wrapper in Go engine; `create_pr` IPC command |
| Test Automation | Post-approval hook; run test command, emit results |
| Multi-task Queue | Engine task queue; serial confirmation handling |
| AI Explanation Panel | Claude explains each change; displayed alongside diff |
| Risk Detection | Diff analyzer scores changes; score shown in diff footer |
| Team Shared Harness | `harness/` synced via Git or shared network path |

# TASK-011: Engine Integration · Log Panel & Run Controls

## Meta
| Field | Value |
|-------|-------|
| **Assignee** | — |
| **Status** | ✅ Done |
| **Priority** | P0 |
| **Sprint** | Sprint 2 |
| **Story Points** | 5 |
| **PRD Reference** | prd.md §6.3, §6.4, §7 |
| **Architecture Ref** | architecture.md §3.2 |
| **Start Date** | — |
| **Due Date** | — |
| **Created** | 2026-04-20 |
| **Completed** | 2026-04-21 |

---

## Description
Build the `<LogPanel>` real-time terminal output component and the `<RunControls>` Run/Pause button. Wire them to the Go engine via Tauri IPC. The log panel must auto-scroll, display timestamped color-coded lines, and show a live indicator when a task is running. The Run button dispatches the start command to the engine using the active task's prompt.

---

## Sub Tasks
- [x] Build `<LogPanel>` — scrollable container, monospace font, renders `LogLine[]` from `AppContext`
- [x] Color coding: `SUCCESS` → green, `ERROR` → red, `WARN` → amber, `INFO` → default, `PASS` → cyan
- [x] Auto-scroll: scroll to bottom on new line; stop auto-scroll if user scrolls up manually
- [x] Live indicator: animated dot shown in log panel header when `engineStatus === 'running'`
- [x] Add `LOG_APPEND`, `LOG_CLEAR` actions to `AppContext` reducer
- [x] Listen for `log_line` Tauri events → dispatch `LOG_APPEND`
- [x] Listen for `task_complete` event → dispatch task status update, set `engineStatus` to `idle`
- [x] Listen for `engine_error` event → append error line to log, set `engineStatus` to `idle`
- [x] Build `<RunControls>` — Run button (idle state) and Pause button (running state)
- [x] Run: `invoke('engine_command', { action: 'start', taskId, prompt, projectPath })` → set `engineStatus` to `running`
- [x] Pause: `invoke('engine_command', { action: 'pause' })` → set `engineStatus` to `paused`
- [x] Resume: `invoke('engine_command', { action: 'resume' })` → set `engineStatus` to `running`
- [x] Disable Run button if no active task selected

---

## Acceptance Criteria
- [x] Clicking Run dispatches start command and begins streaming log output
- [x] Each streamed line appears in the log panel with correct color for its level
- [x] Log auto-scrolls to the latest line while running
- [x] Auto-scroll stops when the user scrolls up; resumes on Run of next task
- [x] Live indicator dot is visible and animated while `engineStatus === 'running'`
- [x] Pause button suspends streaming; Resume resumes it
- [x] Task complete: log shows success line, Run button re-enables
- [x] Engine error: error line shown in red, Run button re-enables
- [x] Run button is disabled when no task is active

---

## Technical Notes
- Log lines must be appended to state (not replaced) — the log is append-only during a run.
- Do not virtualize in this task — implement virtualization in TASK-018 if performance is needed.
- `<LogPanel>` is read-only. Do not add text selection or copy-to-clipboard in this task.

---

## Files to Create/Modify
```
CREATE:
src/components/Workspace/LogPanel.tsx
src/components/Workspace/LogPanel.module.css
src/components/TopBar/RunControls.tsx
src/components/TopBar/RunControls.module.css

MODIFY:
src/context/AppContext.tsx
src/context/reducer.ts
src/context/types.ts
src/components/Workspace/Workspace.tsx
src/components/TopBar/TopBar.tsx
src/App.tsx
```

---

## API Endpoints
N/A — no API endpoints in this task

---

## UI Screens
- **Log Panel** — right workspace panel, scrollable terminal output with colored lines and live dot
- **Run Controls** — Run/Pause button in top bar, state-driven

---

## Related Test Cases
—

## Dependencies
- **Blocked by:** TASK-008, TASK-009, TASK-010
- **Blocks:** TASK-012, TASK-014

---

## Claude Code Context
```
harness/claude.md
harness/tasks/Phase 3 — Engine Integration/TASK-011 — Engine Integration · Log Panel & Run Controls.md
harness/architecture.md §3.2, §4.1
harness/prd.md §6.3, §6.4, §7
```

---

## Progress Log
| Date | Update |
|------|--------|
| 2026-04-21 | Created LogPanel (auto-scroll, live dot, level colour-coding), RunControls (Run/Pause/Resume), wired log_line/task_complete/engine_error events in App.tsx, replaced Workspace placeholder and TopBar hardcoded button. |

---

## Time Log
| Date | Hours | Note |
|------|-------|------|
| — | — | No time logged |

---

## Review Notes
- **—**

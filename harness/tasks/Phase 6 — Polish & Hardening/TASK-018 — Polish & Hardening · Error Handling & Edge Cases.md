# TASK-018: Polish & Hardening · Error Handling & Edge Cases

## Meta
| Field | Value |
|-------|-------|
| **Assignee** | — |
| **Status** | ✅ Done |
| **Priority** | P1 |
| **Sprint** | Sprint 4 |
| **Story Points** | 5 |
| **PRD Reference** | prd.md §8 |
| **Architecture Ref** | architecture.md §7, §8 |
| **Start Date** | — |
| **Due Date** | — |
| **Created** | 2026-04-20 |
| **Completed** | 2026-04-22 |

---

## Description
Implement all error states and edge case handling defined in the architecture. Every failure path must surface a clear, actionable message in the UI. No silent failures, no unhandled panics. This task covers missing dependencies, missing folders, process failures, diff failures, and JSON store corruption.

---

## Sub Tasks
- [x] **Claude CLI not installed:** engine startup check → emit `engine_error` with install guide link; UI shows error banner with "Install Claude Code CLI" button
- [x] **Git not installed:** engine startup check → emit `engine_error` with install guide; UI shows error banner
- [x] **`harness/` folder missing:** task reader returns empty, UI shows "Add a harness/ folder" setup instructions in `<TaskSelectModal>`
- [x] **Claude exits non-zero:** log error lines in red, set engine to `idle`, re-enable Run button
- [x] **Diff extraction fails:** show error state in `<DiffOverlay>` with "Retry" and "Reject" options; "Retry" re-runs `git diff`
- [x] **JSON store corruption:** reset to defaults on load, show one-time warning toast "Settings reset — previous state could not be read"
- [x] **Engine process fails to start:** surface error in `<BottomBar>` status pill (red), log error to panel
- [x] **Log panel performance:** if line count exceeds 2000, virtualize with a windowed list (only render visible lines)
- [x] **Diff overlay performance:** if total diff lines exceed 500 per file, virtualize the diff code view

---

## Acceptance Criteria
- [x] Missing Claude CLI: clear install-guide error shown, app does not crash
- [x] Missing Git: clear install-guide error shown, app does not crash
- [x] Missing `harness/` folder: setup instructions shown in task modal
- [x] Claude non-zero exit: error lines shown in red log, Run button re-enables
- [x] Diff extraction failure: retry and reject options shown in overlay
- [x] JSON corruption: default state loaded, warning toast shown once
- [x] Engine startup failure: error state visible in status pill and log
- [x] Log panel handles 2000+ lines without freezing
- [x] Diff overlay handles 500+ diff lines without freezing

---

## Technical Notes
- Startup checks: run `which claude` and `which git` (or `where` on Windows) in Go engine `main.go` before accepting any commands.
- Virtualize log panel: use `react-window` or a manual implementation with a fixed-height scroll container and calculated offsets.
- "Retry" for diff extraction: emit `diff_retry` command from frontend → engine re-runs `git diff` without touching Claude's stdin.

---

## Files to Create/Modify
```
MODIFY:
src-tauri/binaries/loom-engine/main.go
src-tauri/binaries/loom-engine/diff/extractor.go
src-tauri/binaries/loom-engine/store/json.go
src/components/Workspace/LogPanel.tsx
src/components/DiffOverlay/DiffCodeView.tsx
src/components/DiffOverlay/DiffOverlay.tsx
src/components/BottomBar/BottomBar.tsx
src/components/TaskSelectModal/TaskSelectModal.tsx
src/App.tsx
```

---

## API Endpoints
N/A — no API endpoints in this task

---

## UI Screens
- **Error banner** — missing Claude CLI / Git install guide
- **Task Modal empty state** — harness folder setup instructions
- **Diff Overlay error state** — retry / reject options when diff fails
- **Bottom Bar status pill** — red error state
- **Toast** — JSON store reset warning

---

## Related Test Cases
—

## Dependencies
- **Blocked by:** TASK-017
- **Blocks:** TASK-019

---

## Claude Code Context
```
harness/claude.md
harness/tasks/Phase 6 — Polish & Hardening/TASK-018 — Polish & Hardening · Error Handling & Edge Cases.md
harness/architecture.md §7, §8
harness/prd.md §8
```

---

## Progress Log
| Date | Update |
|------|--------|
| 2026-04-22 | All error handling and virtualization implemented. ErrorBanner, BottomBar dynamic pill, DiffOverlay error/retry state, LogPanel windowed rendering (>2000 lines), DiffCodeView windowed rendering (>500 lines), store WasReset flag + toast, startup dep checks for claude+git. |

---

## Time Log
| Date | Hours | Note |
|------|-------|------|
| — | — | No time logged |

---

## Review Notes
- **—**

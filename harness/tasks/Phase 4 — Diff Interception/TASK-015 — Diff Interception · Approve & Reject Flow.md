# TASK-015: Diff Interception · Approve & Reject Flow

## Meta
| Field | Value |
|-------|-------|
| **Assignee** | — |
| **Status** | ✅ Done |
| **Priority** | P0 |
| **Sprint** | Sprint 3 |
| **Story Points** | 5 |
| **PRD Reference** | prd.md §6.6, §4 |
| **Architecture Ref** | architecture.md §3.2, §3.3, §4.1 |
| **Start Date** | — |
| **Due Date** | — |
| **Created** | 2026-04-20 |
| **Completed** | 2026-04-21 |

---

## Description
Wire the Approve and Reject buttons in `<DiffOverlay>` to the Go engine and implement the full decision flow on the engine side. Approve writes `y\n` to Claude's stdin and unblocks the engine. Reject writes `n\n` and runs `git checkout .` to revert all working tree changes. Both paths close the overlay and return the engine to the appropriate state.

---

## Sub Tasks
- [x] **Approve path (frontend):** "Apply Changes" click → `invoke('engine_command', { action: 'approve' })` → dispatch `CLEAR_PENDING_DIFF` → set `engineStatus` to `running`
- [x] **Reject path (frontend):** "Reject" click → `invoke('engine_command', { action: 'reject' })` → dispatch `CLEAR_PENDING_DIFF` → set `engineStatus` to `idle`
- [x] **Approve path (engine):** receive `approve` command → write `y\n` to Claude's stdin → unblock decision channel → resume streaming
- [x] **Reject path (engine):** receive `reject` command → write `n\n` to Claude's stdin → run `git checkout .` in project directory → emit `log_line` "Changes rejected. Working tree reverted." → set state to `idle`
- [x] Handle multiple confirmation rounds: after approve, engine resumes streaming; if another confirmation appears, the same diff cycle repeats
- [x] Keyboard shortcut: `Enter` triggers Approve, `Escape` is intentionally blocked (user must click Reject)
- [x] Loading state: buttons show spinner after click; disabled until engine acknowledges the command
- [x] Engine: if `git checkout .` fails after reject, emit `engine_error` — do not silently ignore

---

## Acceptance Criteria
- [x] Clicking "Apply Changes" sends `approve` to engine, writes `y\n` to Claude stdin, closes overlay
- [x] Clicking "Reject" sends `reject` to engine, writes `n\n` to Claude stdin, runs `git checkout .`, closes overlay
- [x] After approve: engine continues streaming to log panel
- [x] After reject: log shows "Changes rejected. Working tree reverted.", engine state is `idle`
- [x] Second confirmation round triggers a new diff cycle correctly (overlay opens again)
- [x] `Enter` key triggers Approve while overlay is open
- [x] Buttons are disabled and show loading state after click until engine responds
- [x] `git checkout .` failure after reject emits `engine_error` to frontend

---

## Technical Notes
- Decision channel in Go: `decisionCh chan bool` — `true` for approve, `false` for reject. `Manager.Approve()` and `Manager.Reject()` send on this channel.
- The `awaiting_approval` state blocks the streamer loop until the decision channel receives a value.
- `git checkout .` is the revert command — it discards all unstaged changes in the working tree. Run with `exec.Command("git", "checkout", ".")` with `Dir` set to `projectPath`.

---

## Files to Create/Modify
```
MODIFY:
src-tauri/binaries/loom-engine/process/manager.go
src-tauri/binaries/loom-engine/main.go
src/components/DiffOverlay/DiffFooter.tsx
src/context/reducer.ts
src/App.tsx
```

---

## API Endpoints
N/A — no API endpoints in this task

---

## UI Screens
- **Diff Footer** — approve/reject buttons with loading state

---

## Related Test Cases
—

## Dependencies
- **Blocked by:** TASK-014
- **Blocks:** TASK-016

---

## Claude Code Context
```
harness/claude.md
harness/tasks/Phase 4 — Diff Interception/TASK-015 — Diff Interception · Approve & Reject Flow.md
harness/architecture.md §3.2, §3.3, §4.1
harness/prd.md §6.6, §4
```

---

## Progress Log
| Date | Update |
|------|--------|
| 2026-04-21 | Fixed Reject() in manager.go: git checkout . revert + kill process + idle status + EmitEngineError on revert failure; DiffFooter: pending prop + disabled/loading button text; DiffOverlay: pending state, command-first handlers, Enter=approve keydown listener, Escape blocked. |

---

## Time Log
| Date | Hours | Note |
|------|-------|------|
| — | — | No time logged |

---

## Review Notes
- **—**

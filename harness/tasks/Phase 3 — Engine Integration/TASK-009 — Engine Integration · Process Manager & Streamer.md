# TASK-009: Engine Integration · Process Manager & Streamer

## Meta
| Field | Value |
|-------|-------|
| **Assignee** | — |
| **Status** | ✅ Done |
| **Priority** | P0 |
| **Sprint** | Sprint 2 |
| **Story Points** | 5 |
| **PRD Reference** | prd.md §6.3, §8 |
| **Architecture Ref** | architecture.md §3.3, §5 |
| **Start Date** | — |
| **Due Date** | — |
| **Created** | 2026-04-20 |
| **Completed** | 2026-04-20 |

---

## Description
Implement the Go process manager (`process/manager.go`) and streamer (`process/streamer.go`). The manager spawns and controls the Claude Code CLI child process. The streamer reads stdout/stderr line by line and forwards each line to the IPC emitter. The full engine state machine (`idle → running → completed`) must be implemented here.

---

## Sub Tasks
- [x] Implement `process.Manager` struct with state field: `idle | running | paused | awaiting_approval | completed`
- [x] Implement `Manager.Start(taskPrompt string, projectPath string)` — builds CLI args, spawns Claude Code CLI via `exec.Command`
- [x] Implement `process.Streamer` — reads stdout and stderr line by line using `bufio.Scanner`
- [x] Each line read: call `ipc.Emitter.EmitLogLine(line)` to forward to frontend
- [x] Implement `Manager.Pause()` — send SIGSTOP to process (Unix) / suspend on Windows
- [x] Implement `Manager.Resume()` — send SIGCONT to process (Unix) / resume on Windows
- [x] Implement `Manager.Kill()` — send SIGKILL, clean up state
- [x] On process exit 0: emit `task_complete` event, set state to `completed`
- [x] On process exit non-zero: emit `engine_error` event with stderr tail, set state to `idle`
- [x] Receive `start`, `pause`, `resume`, `kill` commands from Tauri via stdin IPC router in `main.go`

---

## Acceptance Criteria
- [x] `Manager.Start()` spawns the Claude Code CLI process successfully
- [x] All stdout/stderr lines streamed to frontend via `log_line` events in real time
- [x] `Manager.Pause()` suspends the process (no more output lines until resumed)
- [x] `Manager.Resume()` resumes the process (output continues)
- [x] Process exit 0 → `task_complete` event emitted, manager state → `completed`
- [x] Process exit non-zero → `engine_error` event emitted, manager state → `idle`
- [x] Only one process can run at a time — `Start()` returns an error if already running
- [x] No goroutine leaks on process exit or kill

---

## Technical Notes
- Claude Code CLI invocation: `claude --dangerously-skip-permissions --print "<prompt>"` with the project path set as the working directory.
- Use `cmd.Process.Signal(syscall.SIGSTOP)` for pause on Unix. Windows requires `NtSuspendProcess` via `golang.org/x/sys/windows` — implement a build-tag stub for MVP if Windows support is deferred.
- Streamer must use separate goroutines for stdout and stderr to avoid blocking.

---

## Files to Create/Modify
```
CREATE/MODIFY:
src-tauri/binaries/loom-engine/process/manager.go
src-tauri/binaries/loom-engine/process/streamer.go
src-tauri/binaries/loom-engine/main.go
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
- **Blocked by:** TASK-003, TASK-010
- **Blocks:** TASK-011

---

## Claude Code Context
```
harness/claude.md
harness/tasks/Phase 3 — Engine Integration/TASK-009 — Engine Integration · Process Manager & Streamer.md
harness/architecture.md §3.3, §5
harness/prd.md §6.3, §8
```

---

## Progress Log
| Date | Update |
|------|--------|
| 2026-04-20 | Implemented Manager, Streamer, signal stubs (Unix/Windows), and wired start/pause/resume/kill into main.go. Build passes. |

---

## Time Log
| Date | Hours | Note |
|------|-------|------|
| — | — | No time logged |

---

## Review Notes
- **—**

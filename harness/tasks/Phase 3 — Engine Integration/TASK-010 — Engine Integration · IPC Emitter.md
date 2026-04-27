# TASK-010: Engine Integration · IPC Emitter

## Meta
| Field | Value |
|-------|-------|
| **Assignee** | — |
| **Status** | ✅ Done |
| **Priority** | P0 |
| **Sprint** | Sprint 2 |
| **Story Points** | 2 |
| **PRD Reference** | prd.md §8 |
| **Architecture Ref** | architecture.md §3.3 |
| **Start Date** | — |
| **Due Date** | — |
| **Created** | 2026-04-20 |
| **Completed** | 2026-04-21 |

---

## Description
Implement the IPC emitter (`ipc/emitter.go`) in the Go engine. The emitter is the single point responsible for serializing structured events as JSON and writing them to stdout, where Tauri reads and forwards them to the React frontend via Tauri's event system.

---

## Sub Tasks
- [x] Define `Event` struct: `EventType string`, `Payload interface{}`
- [x] Implement `Emitter.Emit(eventType string, payload interface{})` — marshal to JSON, write to stdout with newline
- [x] Implement convenience methods: `EmitLogLine(line LogLine)`, `EmitDiffReady(diff DiffPayload)`, `EmitTaskComplete(taskID string)`, `EmitEngineError(message string)`
- [x] Define `LogLine` struct: `Timestamp string`, `Level string` (`INFO|SUCCESS|WARN|ERROR|PASS`), `Content string`
- [x] Implement level detection: scan line content for known prefixes/patterns to assign level
- [x] Tauri shell (Rust): read each stdout JSON line from engine, parse event type, forward to frontend via `app.emit(event_type, payload)`
- [x] Frontend: typed event listeners for `log_line`, `diff_ready`, `task_complete`, `engine_error`

---

## Acceptance Criteria
- [x] Every engine event arrives at the React frontend as a properly typed Tauri event
- [x] `log_line` events include timestamp, level, and content
- [x] `engine_error` events include a human-readable message string
- [x] Malformed JSON from the engine is caught by Tauri shell — does not crash the app
- [x] Frontend event listeners are typed — no `any` in event handler payloads

---

## Technical Notes
- All engine output to stdout must be JSON — one object per line. Non-JSON lines must not appear on stdout (use stderr for internal engine debug output).
- Tauri shell reads engine stdout via the sidecar's stdout pipe. Each line is `trim`-ed, then `serde_json::from_str` parsed.
- Level detection heuristics: lines starting with `✓` or `success` → `SUCCESS`; `error` / `Error` → `ERROR`; `warn` → `WARN`; else → `INFO`.

---

## Files to Create/Modify
```
CREATE/MODIFY:
src-tauri/binaries/loom-engine/ipc/emitter.go
src-tauri/binaries/loom-engine/ipc/types.go
src-tauri/src/main.rs
src/lib/events.ts
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
- **Blocked by:** TASK-003
- **Blocks:** TASK-009, TASK-011, TASK-012

---

## Claude Code Context
```
harness/claude.md
harness/tasks/Phase 3 — Engine Integration/TASK-010 — Engine Integration · IPC Emitter.md
harness/architecture.md §3.3
```

---

## Progress Log
| Date | Update |
|------|--------|
| 2026-04-21 | Implemented ipc/types.go (Event, LogLine, DetectLevel), updated emitter.go (auto level detection), updated streamer.go, created src/lib/events.ts with typed listeners, updated ipc.ts to re-export from events.ts. |

---

## Time Log
| Date | Hours | Note |
|------|-------|------|
| — | — | No time logged |

---

## Review Notes
- **—**

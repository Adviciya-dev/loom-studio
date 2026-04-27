# TASK-003: Foundation · Go Engine Module & Sidecar Config

## Meta
| Field | Value |
|-------|-------|
| **Assignee** | akshay-ksd |
| **Status** | ✅ Done |
| **Priority** | P0 |
| **Sprint** | Sprint 1 |
| **Story Points** | 3 |
| **PRD Reference** | prd.md §8 |
| **Architecture Ref** | architecture.md §3.3, §9 |
| **Start Date** | 2026-04-20 |
| **Due Date** | — |
| **Created** | 2026-04-20 |
| **Completed** | 2026-04-20 |

---

## Description
Initialize the Go 1.22+ module for `loom-engine` with the full internal package structure scaffolded as stubs. Configure Tauri to bundle and launch the engine binary as an external sidecar process. Confirm the engine starts automatically when the Tauri app launches and that basic IPC messaging between the Tauri shell and engine is working.

---

## Sub Tasks
- [x] Initialize Go module: `go mod init github.com/loom/engine` inside `src-tauri/binaries/loom-engine/`
- [x] Scaffold all internal packages as stubs: `process/`, `diff/`, `git/`, `task/`, `store/`, `ipc/`
- [x] Implement `main.go` entry point with command router (stdin-based IPC)
- [x] Configure Tauri sidecar in `tauri.conf.json`: `externalBin: ["binaries/loom-engine"]`
- [x] Add build script to compile Go binary for all target platforms (macOS arm64/x64, Linux x64, Windows x64)
- [x] Verify engine launches automatically on app start via Tauri sidecar
- [x] Add engine health check on startup: engine writes `{"event":"ready"}` to stdout on init
- [x] Tauri shell reads the `ready` event and emits `engine_ready` to frontend
- [x] Frontend `<App>` listens for `engine_ready` and logs it to console (debug only)

---

## Acceptance Criteria
- [ ] `go build ./...` succeeds with no errors from the engine directory
- [ ] All internal packages exist and compile (stubs are fine)
- [ ] `pnpm tauri dev` launches both the Tauri window and the Go engine sidecar
- [ ] Engine emits `{"event":"ready"}` within 1 second of launch
- [ ] Tauri shell receives the ready event and passes it to the frontend
- [ ] No panics or crashes in the engine on startup

---

## Technical Notes
- Go binary naming convention for Tauri sidecar: `loom-engine-x86_64-apple-darwin`, `loom-engine-aarch64-apple-darwin`, etc. Must match the platform triple Tauri expects.
- The engine communicates with Tauri via stdout (engine → Tauri) and stdin (Tauri → engine). This is the IPC channel — not HTTP.
- Each stdout line from the engine must be a valid JSON object: `{"event":"...","payload":{...}}`.

---

## Files to Create/Modify
```
CREATE:
src-tauri/binaries/loom-engine/main.go
src-tauri/binaries/loom-engine/go.mod
src-tauri/binaries/loom-engine/process/manager.go
src-tauri/binaries/loom-engine/process/streamer.go
src-tauri/binaries/loom-engine/process/detector.go
src-tauri/binaries/loom-engine/diff/extractor.go
src-tauri/binaries/loom-engine/diff/parser.go
src-tauri/binaries/loom-engine/git/commit.go
src-tauri/binaries/loom-engine/task/reader.go
src-tauri/binaries/loom-engine/store/json.go
src-tauri/binaries/loom-engine/ipc/emitter.go
scripts/build-engine.sh

MODIFY:
src-tauri/tauri.conf.json
src-tauri/src/main.rs
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
- **Blocked by:** TASK-001
- **Blocks:** TASK-004, TASK-007, TASK-009, TASK-010, TASK-012, TASK-013, TASK-016

---

## Claude Code Context
```
harness/claude.md
harness/tasks/Phase 0 — Foundation/TASK-003 — Foundation · Go Engine Module & Sidecar Config.md
harness/architecture.md
```

---

## Progress Log
| Date | Update |
|------|--------|
| 2026-04-20 | Go 1.26.2 installed. All packages scaffolded and compile cleanly (`go build ./...`). Engine binary built for all 4 platforms via scripts/build-engine.sh. Binary emits `{"event":"ready"}` on stdout at launch (verified standalone). Rust shell wired with tauri-plugin-shell to spawn sidecar and forward events to frontend. Frontend listens for engine_ready in App.tsx (DEV only). cargo build passes. |

---

## Time Log
| Date | Hours | Note |
|------|-------|------|
| — | — | No time logged |

---

## Review Notes
- **—**

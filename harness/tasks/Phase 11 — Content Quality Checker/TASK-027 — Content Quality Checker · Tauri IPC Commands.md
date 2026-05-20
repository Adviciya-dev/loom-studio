# TASK-027: Content Quality Checker · Tauri IPC Commands

## Meta
| Field | Value |
|-------|-------|
| **Assignee** | — |
| **Status** | ✅ Done |
| **Priority** | P1 |
| **Sprint** | Sprint 8 |
| **Story Points** | 5 |
| **PRD Reference** | harness/content-review-prd.md |
| **Architecture Ref** | architecture.md |
| **Start Date** | — |
| **Due Date** | — |
| **Created** | 2026-05-11 |
| **Completed** | — |

---

## Description

Add Tauri (Rust) IPC commands that bridge the React frontend to the Go engine for all CQC operations. This follows the exact same thin-wrapper pattern as the existing `invoke_engine` command — Rust simply serialises the action + payload and forwards it to the running Go engine process, then relays the response.

Also wire up the `cqc:progress` streaming events so the frontend can display step-by-step progress during a quality check run.

---

## Sub Tasks

### Layer 1 — CQC Tauri Commands

Add to `src-tauri/src/commands.rs` (or a new `src-tauri/src/cqc_commands.rs` if the file is close to the size limit).

Each command serialises its arguments into the engine action payload and calls the shared `invoke_engine` helper.

- [ ] `cqc_list_clients(path: String) -> Result<Vec<HashMap<String, Value>>, String>`
  - Engine action: `{ "action": "cqc_list_clients", "project_path": path }`

- [ ] `cqc_save_client(path: String, client: HashMap<String, Value>) -> Result<HashMap<String, Value>, String>`
  - Engine action: `{ "action": "cqc_save_client", "project_path": path, "client": client }`

- [ ] `cqc_delete_client(path: String, id: String) -> Result<(), String>`
  - Engine action: `{ "action": "cqc_delete_client", "project_path": path, "id": id }`

- [ ] `cqc_run_text_check(path: String, client_id: String, text: String, user: String) -> Result<HashMap<String, Value>, String>`
  - Engine action: `{ "action": "cqc_run_text_check", "project_path": path, "client_id": client_id, "text": text, "user": user }`

- [ ] `cqc_run_image_check(path: String, client_id: String, image_path: String, user: String) -> Result<HashMap<String, Value>, String>`
  - Engine action: `{ "action": "cqc_run_image_check", ... }`

- [ ] `cqc_list_log(path: String, client_id: Option<String>, user: Option<String>, since: Option<String>, limit: Option<u32>) -> Result<Vec<HashMap<String, Value>>, String>`
  - Engine action: `{ "action": "cqc_list_log", ... (omit None fields) }`

- [ ] `cqc_get_log_entry(path: String, id: String) -> Result<HashMap<String, Value>, String>`
  - Engine action: `{ "action": "cqc_get_log_entry", "project_path": path, "id": id }`

---

### Layer 2 — Register Commands in invoke_handler

- [ ] Register all 7 new commands in `src-tauri/src/lib.rs` inside the `invoke_handler!(...)` macro list

---

### Layer 3 — Progress Event Forwarding

The Go engine emits `cqc:progress` events during a check run. Ensure the Tauri event forwarding layer passes these through to the frontend webview (same mechanism as the existing `engine_status` event).

- [ ] Verify the existing event relay in `src-tauri/src/main.rs` (or `lib.rs`) handles arbitrary event names from the engine stdout — if it filters by event name, add `"cqc:progress"` to the allowlist
- [ ] If the relay is already generic (emits all engine events), document this with a comment and mark the sub-task done

---

## Acceptance Criteria
- [ ] `invoke('cqc_list_clients', { path })` returns array of client objects from Go engine
- [ ] `invoke('cqc_save_client', { path, client })` round-trips a new client with generated ID
- [ ] `invoke('cqc_delete_client', { path, id })` soft-deletes the client (no longer in list)
- [ ] `invoke('cqc_run_text_check', { path, client_id, text, user })` returns `CheckResult` JSON
- [ ] `invoke('cqc_list_log', { path })` returns array of log entries
- [ ] `cqc:progress` events arrive in the frontend during a check run (verify in browser DevTools)
- [ ] All commands registered in `invoke_handler` — no "command not found" errors

---

## Technical Notes
- Use `serde_json::Value` / `HashMap<String, Value>` for flexible JSON pass-through — do NOT define rigid Rust structs for CQC types, as the Go engine owns the schema.
- Error handling: wrap engine errors as `Err(String)` so the frontend `invoke()` promise rejects with the message.
- The Tauri commands are thin wrappers — no business logic in Rust.

---

## Files to Create
```
CREATE:
(none — add to existing files unless commands.rs is near size limit)
```

## Files to Modify
```
MODIFY:
src-tauri/src/commands.rs   ← add 7 cqc_* commands
src-tauri/src/lib.rs        ← register in invoke_handler
src-tauri/src/main.rs       ← verify/update cqc:progress event forwarding
```

---

## Dependencies
- **Blocked by:** TASK-026 (Go CLI & SQLite Schema)
- **Blocks:** TASK-028 (Frontend Types, State & Events)

---

## Claude Code Context
```
harness/claude.md
harness/tasks/Phase 11 — Content Quality Checker/TASK-027 — Content Quality Checker · Tauri IPC Commands.md
harness/content-review-prd.md
src-tauri/src/commands.rs
src-tauri/src/lib.rs
src-tauri/src/main.rs
src-tauri/binaries/loom-engine/main.go   ← reference for engine action format
```

---

## Progress Log
| Date | Update |
|------|--------|
| 2026-05-11 | Task created — CQC Phase 11 Tauri IPC layer |

---

## Time Log
| Date | Hours | Note |
|------|-------|------|
| — | — | — |

---

## Review Notes
- **—**

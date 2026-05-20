# TASK-035: Site Audit · Tauri IPC Commands (Intake)

## Meta
| Field | Value |
|-------|-------|
| **Assignee** | — |
| **Status** | 🔲 To Do |
| **Priority** | P0 |
| **Sprint** | Sprint 9 |
| **Story Points** | 5 |
| **PRD Reference** | harness/site-audit-prd.md §10.4 §10.5 |
| **Architecture Ref** | harness/site-audit-prd.md §10.1 |
| **Start Date** | — |
| **Due Date** | — |
| **Created** | 2026-05-17 |
| **Completed** | — |

---

## Description

Implement the Rust Tauri commands and the React-side `invoke` wrappers for Phase 1 (Intake) operations only. This covers saving intake data, listing/loading sessions, and the OS folder picker.

All commands follow the existing pattern in `src-tauri/src/commands.rs` — they receive JSON parameters from the frontend, forward them to the Go engine via `engineCommand(payload)`, and return the result. File reads (session list, session load) may be handled directly in Rust using Tauri's FS API rather than routing through the engine, as they are read-only operations with no subprocess spawning required.

Phase 2–4 commands (`audit_start`, `audit_generate_report`, etc.) are out of scope for this task.

---

## Sub Tasks

### Layer 1 — Rust command signatures in `src-tauri/src/commands.rs`

Add the following four Tauri commands. Follow the exact naming, parameter names, and return types shown.

```rust
/// Write intake JSON to {project_path}/audits/{session_id}/intake.json.
/// Creates the audits/{session_id}/ directory if it does not exist.
/// Also removes intake.draft.json from the same directory on success.
#[tauri::command]
pub async fn audit_save_intake(
    project_path: String,
    session_id: String,
    intake: serde_json::Value,   // AuditIntake JSON passed through as-is
) -> Result<(), String>

/// Glob {project_path}/audits/*/intake.json and return AuditSession structs.
/// Each intake.json is read and deserialized; the session ID is the directory name.
/// Results sorted by createdAt descending.
#[tauri::command]
pub async fn audit_list_sessions(
    project_path: String,
) -> Result<Vec<serde_json::Value>, String>

/// Read a single intake.json and return it as AuditSession.
#[tauri::command]
pub async fn audit_load_session(
    project_path: String,
    session_id: String,
) -> Result<serde_json::Value, String>

/// Open OS native folder picker dialog.
/// Returns the selected path, or None if the user cancelled.
/// Validates after selection: path must exist and directory must be non-empty.
/// Returns Err("INVALID_REPO_PATH") if validation fails.
#[tauri::command]
pub async fn audit_open_folder(
    app_handle: tauri::AppHandle,
) -> Result<Option<String>, String>
```

- [ ] Add all four command functions to `src-tauri/src/commands.rs`
- [ ] Register all four in `src-tauri/src/lib.rs` `tauri::generate_handler![…]` list

---

### Layer 2 — `audit_save_intake` implementation detail

The intake payload is stored verbatim in `intake.json`. The envelope fields (`sessionId`, `version`, `createdAt`, `updatedAt`, `phase`) are added by the Rust command before writing:

```rust
// Envelope written to intake.json:
{
  "sessionId": session_id,
  "version": 1,
  "projectId": "",          // empty in v1 — project tracking via project_path
  "siteName": intake["siteName"],   // mirror for fast session listing
  "siteUrl":  intake["siteUrl"],
  "phase": "intake",
  "createdAt": <current ISO timestamp>,   // written once on first save; preserved on re-save
  "updatedAt": <current ISO timestamp>,   // always overwritten
  "reportPath": null,
  "taskCount": 0,           // updated only by task_writer.go, not here
  "intake": { ...full AuditIntake fields... }
}
```

Implementation steps:
1. Build path: `{project_path}/audits/{session_id}/`
2. `std::fs::create_dir_all` the directory
3. Check if `intake.json` already exists → if yes, read `createdAt` from it to preserve it
4. Construct the envelope JSON, merge with the incoming `intake` value
5. Write atomically (write to `.tmp` then rename)
6. Delete `intake.draft.json` from the same directory (ignore error if not present)

- [ ] Implement the envelope construction and write logic
- [ ] Atomic write: write to `intake.json.tmp`, then `std::fs::rename` to `intake.json`
- [ ] Preserve `createdAt` across re-saves

---

### Layer 3 — `audit_list_sessions` implementation detail

```rust
// Pseudo-code:
let audits_dir = format!("{}/audits", project_path);
let mut sessions = vec![];
for entry in glob("{audits_dir}/*/intake.json") {
    let content = fs::read_to_string(entry)?;
    let session: serde_json::Value = serde_json::from_str(&content)?;
    sessions.push(session);
}
sessions.sort_by(|a, b| b["createdAt"].cmp(a["createdAt"]));  // newest first
return Ok(sessions);
```

- [ ] Read and parse every `intake.json` found under `audits/`
- [ ] Sort by `createdAt` descending (string comparison of ISO timestamps is safe)
- [ ] Return empty Vec without error if `audits/` directory does not exist yet

---

### Layer 4 — `audit_open_folder` implementation detail

Use Tauri's dialog API:

```rust
use tauri_plugin_dialog::DialogExt;

let path = app_handle
    .dialog()
    .file()
    .pick_folder()
    .blocking_pick_folder();

match path {
    None => return Ok(None),          // user cancelled
    Some(p) => {
        let path_str = p.to_string_lossy().to_string();
        // Validate: directory must exist and be non-empty
        let entries: Vec<_> = std::fs::read_dir(&path_str)
            .map_err(|_| "INVALID_REPO_PATH".to_string())?
            .collect();
        if entries.is_empty() {
            return Err("INVALID_REPO_PATH".to_string());
        }
        Ok(Some(path_str))
    }
}
```

- [ ] Use `tauri_plugin_dialog` (already a project dependency — verify in `Cargo.toml`)
- [ ] Return `Ok(None)` when user cancels (do not treat cancel as error)
- [ ] Return `Err("INVALID_REPO_PATH")` when path is empty or unreadable

---

### Layer 5 — Frontend `invoke` wrappers in `src/lib/events.ts` (or a new `src/lib/audit.ts`)

Add typed wrapper functions so components never call `invoke` directly with raw strings:

```typescript
import { invoke } from '@tauri-apps/api/core'
import type { AuditIntake, AuditSession } from '../types'

export async function auditSaveIntake(
  projectPath: string,
  sessionId: string,
  intake: AuditIntake,
): Promise<void> {
  return invoke('audit_save_intake', { projectPath, sessionId, intake })
}

export async function auditListSessions(
  projectPath: string,
): Promise<AuditSession[]> {
  return invoke('audit_list_sessions', { projectPath })
}

export async function auditLoadSession(
  projectPath: string,
  sessionId: string,
): Promise<AuditSession> {
  return invoke('audit_load_session', { projectPath, sessionId })
}

export async function auditOpenFolder(): Promise<string | null> {
  return invoke('audit_open_folder')
}
```

- [ ] Add the four wrapper functions to `src/lib/events.ts` (or create `src/lib/audit.ts` if events.ts is already large)

---

## Acceptance Criteria

- [ ] `audit_save_intake` creates `audits/{session_id}/` and writes `intake.json` with correct envelope fields
- [ ] Re-saving preserves the original `createdAt` timestamp
- [ ] Successful `audit_save_intake` deletes `intake.draft.json` if it exists
- [ ] `audit_list_sessions` returns an empty array (not an error) when `audits/` does not exist
- [ ] `audit_list_sessions` returns sessions sorted newest-first
- [ ] `audit_open_folder` opens a native OS folder dialog
- [ ] `audit_open_folder` returns `null` (not an error) when the user cancels
- [ ] `audit_open_folder` returns `Err("INVALID_REPO_PATH")` for an empty directory
- [ ] All four commands are registered in `tauri::generate_handler!`
- [ ] Frontend wrapper functions are typed and compile without errors
- [ ] `cargo build` completes without warnings on the new code

---

## Technical Notes

- The `intake.json` file is written by Rust directly — it does NOT go through the Go engine. The Go engine only reads `intake.json` (in `store.go`) to load session context when running an audit.
- Use `std::time::SystemTime` for the ISO timestamp: `chrono` crate is already a dependency; use `chrono::Utc::now().to_rfc3339()`.
- The atomic rename (`write .tmp → rename to final`) prevents a partial write from corrupting the session if the app is force-quit during save.
- `audit_open_folder` must be `async` even though `blocking_pick_folder` is synchronous — Tauri requires all commands to be async.

---

## Files to Create

```
CREATE (if events.ts is too large):
src/lib/audit.ts    ← typed invoke wrappers
```

## Files to Modify

```
MODIFY:
src-tauri/src/commands.rs   ← add 4 command functions
src-tauri/src/lib.rs        ← register commands in generate_handler!
src/lib/events.ts           ← add invoke wrappers (or create audit.ts)
```

---

## Dependencies

- **Blocked by:** TASK-034 (types must exist before wrapper functions are typed)
- **Blocks:** TASK-038 (SessionList needs `auditListSessions`), TASK-039 (IntakeForm needs `auditSaveIntake`, `auditOpenFolder`)

---

## Claude Code Context

```
harness/claude.md
harness/tasks/Phase 12 — Site Audit/TASK-035 — Site Audit · Tauri IPC Commands (Intake).md
harness/site-audit-prd.md
src-tauri/src/commands.rs
src-tauri/src/lib.rs
src/lib/events.ts
src/types/index.ts
```

---

## Progress Log

| Date | Update |
|------|--------|
| 2026-05-17 | Task created — Phase 12 Site Audit intake Tauri commands |

---

## Time Log

| Date | Hours | Note |
|------|-------|------|
| — | — | — |

---

## Review Notes

- **—**

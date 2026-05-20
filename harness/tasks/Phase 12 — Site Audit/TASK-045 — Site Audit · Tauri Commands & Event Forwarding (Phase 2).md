---
id: TASK-045
title: "Site Audit · Tauri Commands & Event Forwarding (Phase 2)"
type: task
status: open
effort: Medium
priority: high
phase: 2
area: tauri
---

## Goal

Add the two Phase 2 Tauri commands (`audit_start`, `audit_cancel`) and wire up forwarding of all Phase 2 engine events to the React frontend.

## File to modify

`src-tauri/src/commands.rs`

## New Tauri commands

### `audit_start`

```rust
#[tauri::command]
pub async fn audit_start(
    project_path: String,
    session_id: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, EngineState>,
) -> Result<(), String> {
    engine_command(
        &state,
        &app,
        serde_json::json!({
            "action": "audit_start",
            "projectPath": project_path,
            "sessionId": session_id
        }),
    )
    .await
    .map_err(|e| e.to_string())
}
```

### `audit_cancel`

```rust
#[tauri::command]
pub async fn audit_cancel(
    session_id: String,
    state: tauri::State<'_, EngineState>,
) -> Result<(), String> {
    engine_command(
        &state,
        /* app handle not needed for cancel */
        serde_json::json!({
            "action": "audit_cancel",
            "sessionId": session_id
        }),
    )
    .await
    .map_err(|e| e.to_string())
}
```

Register both in `lib.rs` `invoke_handler`:

```rust
tauri::generate_handler![
    // … existing handlers …
    audit_start,
    audit_cancel,
]
```

## Event forwarding

The Go engine emits JSON lines on stdout. The existing engine stdout reader in `lib.rs` or `commands.rs` already parses each line and dispatches Tauri events. Add cases for these Phase 2 events:

| Engine event key | Tauri event name | Forwarded payload |
|---|---|---|
| `audit_dimension_status` | `audit_dimension_status` | `{ key, label, status, score, errorMessage }` |
| `audit_log_line` | `audit_log_line` | `{ timestamp, level, content }` |
| `audit_completed` | `audit_completed` | `{ sessionId }` |
| `audit_cancelled` | `audit_cancelled` | `{ sessionId }` |
| `audit_error` | `audit_error` | `{ sessionId, dimension, message }` |

**Event forwarding pattern (existing pattern to follow):**

```rust
"audit_dimension_status" => {
    app.emit_all("audit_dimension_status", &payload).ok();
}
"audit_log_line" => {
    app.emit_all("audit_log_line", &payload).ok();
}
"audit_completed" => {
    app.emit_all("audit_completed", &payload).ok();
}
"audit_cancelled" => {
    app.emit_all("audit_cancelled", &payload).ok();
}
"audit_error" => {
    app.emit_all("audit_error", &payload).ok();
}
```

## Frontend event listeners (src/lib/events.ts)

Add listener registrations for Phase 2 events. Follow the existing pattern in `events.ts`:

```typescript
export function listenAuditDimensionStatus(
  cb: (status: AuditDimensionStatus) => void
): UnlistenFn { ... }

export function listenAuditLogLine(
  cb: (line: LogLine) => void
): UnlistenFn { ... }

export function listenAuditCompleted(
  cb: (payload: { sessionId: string }) => void
): UnlistenFn { ... }

export function listenAuditCancelled(
  cb: (payload: { sessionId: string }) => void
): UnlistenFn { ... }

export function listenAuditError(
  cb: (payload: { sessionId: string; dimension: string; message: string }) => void
): UnlistenFn { ... }
```

Each calls `listen('audit_*', (event) => cb(event.payload))` via `@tauri-apps/api/event`.

## Acceptance criteria

- [ ] `audit_start` command sends `{ action: "audit_start", projectPath, sessionId }` to engine stdin
- [ ] `audit_cancel` command sends `{ action: "audit_cancel", sessionId }` to engine stdin
- [ ] Both commands are registered in `invoke_handler` in `lib.rs`
- [ ] All 5 engine events are forwarded to the frontend via `app.emit_all`
- [ ] `events.ts` exports a typed listener function for each Phase 2 event
- [ ] `AuditDimensionStatus` type is imported from `src/types/index.ts` in the listener (no inline type definitions)
- [ ] No compilation errors (`cargo check` passes)

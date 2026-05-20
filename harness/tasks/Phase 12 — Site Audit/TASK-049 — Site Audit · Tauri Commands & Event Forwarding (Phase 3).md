---
id: TASK-049
title: "Site Audit · Tauri Commands & Event Forwarding (Phase 3)"
type: task
status: open
effort: Low
priority: high
phase: 3
area: tauri
---

## Goal

Add three new Tauri commands for Phase 3: `audit_generate_report` (routes to Go engine), `audit_read_report` (reads `report.md` from disk), and `audit_export_report` (native Save dialog + file copy). Register all three in `lib.rs` and expose them in `src/lib/audit.ts`.

Event forwarding for `audit_report_ready` already works automatically — `lib.rs` forwards every `{ event, payload }` object from Go engine stdout to the frontend without any new Rust code.

## Files to modify

- `src-tauri/src/commands.rs`
- `src-tauri/src/lib.rs`
- `src/lib/audit.ts`

---

## 1 — Add commands to `commands.rs`

Add below the existing Phase 2 commands (`audit_start` / `audit_cancel`).

### `audit_generate_report`

Routes to Go engine via stdin. Mirrors the pattern of `audit_start`.

```rust
/// Send audit_generate_report to the Go engine, which calls BuildReport in a goroutine.
#[tauri::command]
pub async fn audit_generate_report(
    state: tauri::State<'_, crate::EngineState>,
    project_path: String,
    session_id: String,
) -> Result<(), String> {
    engine_send(&state, serde_json::json!({
        "action": "audit_generate_report",
        "projectPath": project_path,
        "sessionId": session_id
    }))
}
```

### `audit_read_report`

Reads `report.md` directly from disk (no Go engine involvement). Returns the full markdown string.

```rust
/// Read report.md from disk and return its contents as a string.
#[tauri::command]
pub async fn audit_read_report(
    project_path: String,
    session_id: String,
) -> Result<String, String> {
    let path = std::path::PathBuf::from(&project_path)
        .join("audits")
        .join(&session_id)
        .join("report.md");
    std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read report.md: {e}"))
}
```

### `audit_export_report`

Opens a native Save dialog pre-filled with `{siteName}-audit-report.md`, then copies the existing `report.md` to the chosen destination. Returns the destination path on success.

```rust
/// Open a native Save dialog and copy report.md to the chosen destination.
#[tauri::command]
pub async fn audit_export_report(
    app: tauri::AppHandle,
    project_path: String,
    session_id: String,
    site_name: String,
) -> Result<String, String> {
    use tauri_plugin_dialog::DialogExt;

    let default_name = format!("{}-audit-report.md",
        site_name.to_lowercase().replace(' ', "-"));

    let dest = app
        .dialog()
        .file()
        .set_title("Export Audit Report")
        .set_file_name(&default_name)
        .blocking_save_file();

    let dest_path = match dest {
        Some(p) => p.to_string(),
        None => return Err("cancelled".to_string()),
    };

    let src = std::path::PathBuf::from(&project_path)
        .join("audits")
        .join(&session_id)
        .join("report.md");

    std::fs::copy(&src, &dest_path)
        .map_err(|e| format!("Export failed: {e}"))?;

    Ok(dest_path)
}
```

---

## 2 — Register in `lib.rs`

Add the three commands to the `invoke_handler` list in `src-tauri/src/lib.rs`:

```rust
commands::audit_generate_report,
commands::audit_read_report,
commands::audit_export_report,
```

Place them after `commands::audit_cancel` to keep Phase 2 and Phase 3 commands grouped.

---

## 3 — Add to `src/lib/audit.ts`

Append below `auditCancel`:

```typescript
export async function auditGenerateReport(
  projectPath: string,
  sessionId: string,
): Promise<void> {
  return invoke('audit_generate_report', { projectPath, sessionId })
}

export async function auditReadReport(
  projectPath: string,
  sessionId: string,
): Promise<string> {
  return invoke('audit_read_report', { projectPath, sessionId })
}

export async function auditExportReport(
  projectPath: string,
  sessionId: string,
  siteName: string,
): Promise<string> {
  return invoke('audit_export_report', { projectPath, sessionId, siteName })
}
```

---

## Event forwarding (no changes needed)

`lib.rs` already forwards every JSON object from Go engine stdout that contains an `event` key directly to the frontend via `handle.emit(event_name, payload)`. The new `audit_report_ready` event from `report_builder.go` is forwarded automatically — no additional Rust code required.

---

## Acceptance criteria

- [ ] `audit_generate_report` command sends `{ action, projectPath, sessionId }` to Go engine stdin
- [ ] `audit_read_report` reads `{projectPath}/audits/{sessionId}/report.md` and returns its string contents; returns an error string if the file does not exist
- [ ] `audit_export_report` opens a native Save dialog, copies `report.md` to the chosen path, and returns the destination path; returns `"cancelled"` error if the user dismisses the dialog
- [ ] All three commands are registered in `lib.rs` invoke_handler
- [ ] All three wrapper functions are exported from `src/lib/audit.ts`
- [ ] `cargo build` passes with no errors
- [ ] No existing audit commands are affected

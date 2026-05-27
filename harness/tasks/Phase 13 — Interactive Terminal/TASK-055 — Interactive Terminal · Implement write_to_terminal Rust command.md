---
id: TASK-055
title: "Interactive Terminal · Implement write_to_terminal Rust command"
type: task
status: open
effort: Low
priority: high
phase: 13
area: rust-backend
---

## Goal

Implement the `write_to_terminal` Tauri command in `src-tauri/src/commands.rs`. This command receives raw string data (keystrokes, paste events, special key sequences) from the xterm.js frontend and writes it directly to the PTY master writer, forwarding it to the shell's stdin.

## Files to modify

- `src-tauri/src/commands.rs`

---

## 1 — Command signature

```rust
#[tauri::command]
pub fn write_to_terminal(
    state: tauri::State<'_, crate::TerminalState>,
    id: String,
    data: String,
) -> Result<(), String>
```

Note: this is a synchronous command (`pub fn`, not `pub async fn`) — the write is fast and does not need async.

---

## 2 — Implementation

```rust
#[tauri::command]
pub fn write_to_terminal(
    state: tauri::State<'_, crate::TerminalState>,
    id: String,
    data: String,
) -> Result<(), String> {
    use std::io::Write;
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions.get_mut(&id).ok_or_else(|| format!("Terminal session '{}' not found", id))?;
    session.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    session.writer.flush().map_err(|e| e.to_string())?;
    Ok(())
}
```

---

## 3 — What data this receives

The `data` string from xterm.js `onData` contains:
- Regular characters: `"a"`, `"hello\n"`
- Ctrl sequences: `"\x03"` (Ctrl+C / SIGINT), `"\x04"` (Ctrl+D / EOF), `"\x0C"` (Ctrl+L / clear)
- Arrow keys: `"\x1b[A"` (up), `"\x1b[B"` (down), `"\x1b[C"` (right), `"\x1b[D"` (left)
- Tab: `"\t"`
- Backspace: `"\x7f"`

The PTY layer handles all signal translation — writing `"\x03"` to the PTY master sends SIGINT to the foreground process group automatically.

---

## Acceptance criteria

- [ ] `write_to_terminal` command compiles without errors
- [ ] Returns an error if no session with the given `id` exists
- [ ] Writes bytes to the PTY master writer and flushes
- [ ] Does not block or panic on write errors — returns `Err(String)` instead
- [ ] `cargo build` compiles without errors

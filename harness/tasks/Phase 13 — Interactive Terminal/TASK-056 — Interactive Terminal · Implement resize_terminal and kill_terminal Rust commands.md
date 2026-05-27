---
id: TASK-056
title: "Interactive Terminal · Implement resize_terminal and kill_terminal Rust commands"
type: task
status: open
effort: Low
priority: high
phase: 13
area: rust-backend
---

## Goal

Implement `resize_terminal` and `kill_terminal` in `src-tauri/src/commands.rs`.

- `resize_terminal` — notifies the PTY of new dimensions so programs like `vim`, `htop`, and `less` reflow their output correctly
- `kill_terminal` — terminates the shell and removes the session from state, freeing resources

## Files to modify

- `src-tauri/src/commands.rs`

---

## 1 — resize_terminal

```rust
#[tauri::command]
pub fn resize_terminal(
    state: tauri::State<'_, crate::TerminalState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    use portable_pty::PtySize;
    let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions.get(&id).ok_or_else(|| format!("Terminal session '{}' not found", id))?;
    session.master
        .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())
}
```

This sends SIGWINCH to the shell's process group on Unix. On Windows, ConPTY handles the resize natively.

---

## 2 — kill_terminal

```rust
#[tauri::command]
pub fn kill_terminal(
    state: tauri::State<'_, crate::TerminalState>,
    id: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    sessions.remove(&id);
    // Dropping the session closes the master writer, which sends EOF to the shell
    // and causes it to exit naturally. No explicit kill() call needed.
    Ok(())
}
```

Dropping the `TerminalSession` closes both `writer` and `master`. This sends EOF/HUP to the PTY slave, which terminates the shell process cleanly.

---

## Acceptance criteria

- [ ] `resize_terminal` updates PTY dimensions for the given session ID
- [ ] `resize_terminal` returns an error if session ID not found
- [ ] `kill_terminal` removes the session from `TerminalState`
- [ ] `kill_terminal` is idempotent — calling it on a non-existent ID returns `Ok(())`
- [ ] Shell process exits after `kill_terminal` is called (verified by `terminal_exit` event firing)
- [ ] `cargo build` compiles without errors

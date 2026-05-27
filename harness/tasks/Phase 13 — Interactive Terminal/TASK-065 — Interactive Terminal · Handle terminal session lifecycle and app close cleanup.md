---
id: TASK-065
title: "Interactive Terminal · Handle terminal session lifecycle and app close cleanup"
type: task
status: open
effort: Medium
priority: high
phase: 13
area: rust-backend
---

## Goal

Ensure terminal shell processes are killed in all exit scenarios — component unmount, user typing `exit`, and the Tauri app window closing. Without this, orphaned shell processes keep running after the app exits.

## Files to modify

- `src-tauri/src/lib.rs`
- `src/components/Workspace/Terminal.tsx`

---

## 1 — Component unmount cleanup (Terminal.tsx)

The `useEffect` cleanup in TASK-061 already calls `invoke('kill_terminal', { id })` when the component unmounts. Verify this is in place:

```typescript
return () => {
  observer.disconnect()
  unlistens.forEach((fn) => fn())
  invoke('kill_terminal', { id }).catch(() => {})
  term.dispose()
}
```

---

## 2 — Shell exits on its own (user types `exit`)

When the user types `exit`, the PTY reader loop in `create_terminal` (TASK-054) gets `Ok(0)` (EOF) and emits `terminal_exit`. The Rust task drops the reader — but the `TerminalSession` entry remains in `TerminalState` until the frontend calls `kill_terminal`.

Add cleanup on the Rust side: after emitting `terminal_exit`, remove the session from state:

In the `create_terminal` reader task (in `commands.rs`), modify the exit branch:

```rust
Ok(0) | Err(_) => {
    let _ = app_handle.emit("terminal_exit", serde_json::json!({ "id": term_id, "code": null }));
    // Remove session from state to free the writer/master
    if let Ok(mut sessions) = state_clone.sessions.lock() {
        sessions.remove(&term_id);
    }
    break;
}
```

This requires cloning `state` into the reader task. Add `state_clone: tauri::State<'_, crate::TerminalState>` as a parameter, or pass an `Arc<Mutex<HashMap<...>>>` into the spawned task directly.

---

## 3 — App window close (lib.rs)

Register a window event handler to kill all active sessions when the main window closes.

In `src-tauri/src/lib.rs`, inside the `.setup(|app| { ... })` closure, after the sidecar spawn:

```rust
let terminal_state = app.state::<TerminalState>();
// Clone the Arc for use in the event handler
app.get_webview_window("main").unwrap().on_window_event({
    let app_handle = app.handle().clone();
    move |event| {
        if let tauri::WindowEvent::CloseRequested { .. } = event {
            if let Ok(state) = app_handle.try_state::<TerminalState>() {
                if let Ok(mut sessions) = state.sessions.lock() {
                    sessions.clear(); // Drops all TerminalSessions → closes PTY masters → shells exit
                }
            }
        }
    }
});
```

Dropping all `TerminalSession` entries closes the PTY masters, sending HUP/EOF to the shells, which causes them to exit.

---

## 4 — keepAlive tab switching (LogPanel.tsx)

In TASK-063, the `<Terminal>` component uses `display: none` when the OUTPUT tab is active — it stays mounted. This means `kill_terminal` is NOT called on tab switch, which is the correct behavior. Verify this is implemented with the `display: none` wrapper approach and NOT by conditionally rendering `{activeTab === 'terminal' && <Terminal />}`.

---

## Acceptance criteria

- [ ] Unmounting `Terminal.tsx` (e.g. panel collapse) calls `kill_terminal` and disposes xterm
- [ ] User typing `exit` emits `terminal_exit` and removes the session from `TerminalState`
- [ ] Closing the app window calls `sessions.clear()`, killing all shell processes
- [ ] Switching between OUTPUT and TERMINAL tabs does NOT kill the shell session
- [ ] `cargo build` compiles without errors

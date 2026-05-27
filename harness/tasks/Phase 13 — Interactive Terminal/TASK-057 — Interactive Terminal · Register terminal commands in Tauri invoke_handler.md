---
id: TASK-057
title: "Interactive Terminal · Register terminal commands in Tauri invoke_handler"
type: task
status: open
effort: Low
priority: high
phase: 13
area: rust-backend
---

## Goal

Register all four new terminal commands in the `tauri::generate_handler![]` macro in `src-tauri/src/lib.rs` and ensure `TerminalState` is managed. Without this step, the Tauri IPC bridge won't expose the commands to the frontend.

## Files to modify

- `src-tauri/src/lib.rs`

---

## 1 — Add to invoke_handler

In the `.invoke_handler(tauri::generate_handler![...])` call, add four new entries alongside the existing commands:

```rust
commands::create_terminal,
commands::write_to_terminal,
commands::resize_terminal,
commands::kill_terminal,
```

---

## 2 — Verify TerminalState is managed

Confirm that the `.manage(TerminalState { sessions: Mutex::new(HashMap::new()) })` line added in TASK-053 is present **before** the `.invoke_handler(...)` call in the builder chain. Tauri requires all managed state to be registered before the handler.

---

## 3 — Final invoke_handler list (terminal section)

After this task the terminal-related entries in the handler should read:

```rust
commands::create_terminal,
commands::write_to_terminal,
commands::resize_terminal,
commands::kill_terminal,
```

---

## Acceptance criteria

- [ ] All four terminal commands present in `tauri::generate_handler![]`
- [ ] `TerminalState` registered with `.manage()` before `.invoke_handler()`
- [ ] `cargo build` compiles without errors
- [ ] No duplicate command registrations

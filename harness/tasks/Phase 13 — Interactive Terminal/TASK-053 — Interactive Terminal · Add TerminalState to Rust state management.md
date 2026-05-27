---
id: TASK-053
title: "Interactive Terminal · Add TerminalState to Rust state management"
type: task
status: open
effort: Low
priority: high
phase: 13
area: rust-backend
---

## Goal

Define a `TerminalState` struct in `src-tauri/src/lib.rs` that holds all active terminal sessions keyed by a string ID. Register it with Tauri's `.manage()` so every command can access it via `tauri::State<'_, TerminalState>`.

## Files to modify

- `src-tauri/src/lib.rs`

---

## 1 — TerminalSession struct

Add the following structs **above** the existing `EngineState` definition:

```rust
use std::collections::HashMap;
use portable_pty::MasterPty;

pub struct TerminalSession {
    pub writer: Box<dyn std::io::Write + Send>,
    pub master: Box<dyn MasterPty + Send>,
}

pub struct TerminalState {
    pub sessions: Mutex<HashMap<String, TerminalSession>>,
}
```

- `writer` — PTY master writer; used by `write_to_terminal` to forward keystrokes
- `master` — PTY master handle; used by `resize_terminal` to send SIGWINCH

---

## 2 — Register with Tauri

In the `tauri::Builder` chain inside `pub fn run()`, add `.manage()` for the new state alongside the existing `EngineState` and `HarnessChatState`:

```rust
.manage(TerminalState {
    sessions: Mutex::new(HashMap::new()),
})
```

---

## Acceptance criteria

- [ ] `TerminalSession` struct defined with `writer` and `master` fields
- [ ] `TerminalState` struct defined with `sessions: Mutex<HashMap<String, TerminalSession>>`
- [ ] `TerminalState` registered with `.manage()` in the Tauri builder
- [ ] `cargo build` compiles without errors
- [ ] No unused import warnings

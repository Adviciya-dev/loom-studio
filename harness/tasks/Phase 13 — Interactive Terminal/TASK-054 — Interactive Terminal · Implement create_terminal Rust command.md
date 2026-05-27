---
id: TASK-054
title: "Interactive Terminal · Implement create_terminal Rust command"
type: task
status: open
effort: High
priority: high
phase: 13
area: rust-backend
---

## Goal

Implement the `create_terminal` Tauri command in `src-tauri/src/commands.rs`. This command spawns a real interactive shell inside a PTY, starts a background task that streams raw PTY output (base64-encoded) to the frontend as `terminal_output` events, and stores the session in `TerminalState`.

## Files to modify

- `src-tauri/src/commands.rs`

---

## 1 — Command signature

```rust
#[tauri::command]
pub async fn create_terminal(
    state: tauri::State<'_, crate::TerminalState>,
    app: tauri::AppHandle,
    id: String,
    cwd: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<(), String>
```

---

## 2 — Implementation steps

### Step 1: Create the PTY pair

```rust
use portable_pty::{native_pty_system, CommandBuilder, PtySize};

let pty_system = native_pty_system();
let pair = pty_system
    .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
    .map_err(|e| e.to_string())?;
```

### Step 2: Detect shell binary

```rust
fn detect_shell() -> String {
    #[cfg(windows)]
    { std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".into()) }
    #[cfg(not(windows))]
    {
        let shell = std::env::var("SHELL").unwrap_or_default();
        if !shell.is_empty() && std::path::Path::new(&shell).exists() {
            return shell;
        }
        for s in &["/bin/zsh", "/bin/bash", "/bin/sh"] {
            if std::path::Path::new(s).exists() { return s.to_string(); }
        }
        "/bin/sh".into()
    }
}
```

### Step 3: Build the shell command

```rust
let shell = detect_shell();
let mut cmd = CommandBuilder::new(&shell);

// On macOS/Linux, pass -i so .zshrc/.bashrc is sourced (GUI apps miss dotfiles)
#[cfg(not(windows))]
cmd.arg("-i");

// Set working directory
let home = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).unwrap_or_default();
let work_dir = cwd.filter(|p| !p.is_empty()).unwrap_or(home);
cmd.cwd(&work_dir);

// Environment variables
cmd.env("TERM", "xterm-256color");
cmd.env("COLORTERM", "truecolor");
cmd.env("LANG", "en_US.UTF-8");
cmd.env("PATH", expanded_path());  // reuse existing helper
```

### Step 4: Spawn the shell into the PTY slave

```rust
let _child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
```

### Step 5: Spawn output reader task

Clone the master reader and emit `terminal_output` events:

```rust
let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
let app_handle = app.clone();
let term_id = id.clone();

tauri::async_runtime::spawn_blocking(move || {
    use std::io::Read;
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    use tauri::Emitter;

    let mut buf = [0u8; 4096];
    loop {
        match reader.read(&mut buf) {
            Ok(0) | Err(_) => {
                let _ = app_handle.emit("terminal_exit", serde_json::json!({ "id": term_id, "code": null }));
                break;
            }
            Ok(n) => {
                let encoded = STANDARD.encode(&buf[..n]);
                let _ = app_handle.emit("terminal_output", serde_json::json!({ "id": term_id, "data": encoded }));
            }
        }
    }
});
```

### Step 6: Store session

```rust
let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
sessions.insert(id, crate::TerminalSession {
    writer,
    master: pair.master,
});
Ok(())
```

---

## Acceptance criteria

- [ ] `create_terminal` command compiles without errors
- [ ] Spawning a terminal emits `terminal_output` events with base64-encoded data
- [ ] Shell starts in the provided `cwd` (or home directory if `None`)
- [ ] `TERM=xterm-256color`, `COLORTERM=truecolor`, `LANG=en_US.UTF-8` are set
- [ ] `-i` flag passed on macOS/Linux so dotfiles are sourced
- [ ] Session stored in `TerminalState` under the provided `id`
- [ ] `terminal_exit` event emitted when the reader loop ends
- [ ] `cargo build` compiles without errors

---
id: TASK-066
title: "Interactive Terminal · Cross-platform shell detection and environment setup"
type: task
status: open
effort: Medium
priority: medium
phase: 13
area: rust-backend
---

## Goal

Ensure `create_terminal` detects the correct shell binary, passes the right flags to load dotfiles, and sets the terminal environment variables that programs expect — across macOS, Linux, and Windows.

This is a gap fix: without these details the terminal works but feels broken (no colors, wrong PATH, no shell aliases, prompts don't appear).

## Files to modify

- `src-tauri/src/commands.rs`

---

## 1 — Shell detection helper

Extract a dedicated `detect_shell()` helper function (keep it private, above `create_terminal`):

```rust
fn detect_shell() -> String {
    #[cfg(windows)]
    {
        // Prefer PowerShell if available, fall back to cmd.exe
        for candidate in &["powershell.exe", "cmd.exe"] {
            if which_exists(candidate) { return candidate.to_string(); }
        }
        "cmd.exe".into()
    }
    #[cfg(not(windows))]
    {
        // Respect the user's configured shell first
        let shell = std::env::var("SHELL").unwrap_or_default();
        if !shell.is_empty() && std::path::Path::new(&shell).exists() {
            return shell;
        }
        // Fallback chain
        for s in &["/bin/zsh", "/bin/bash", "/bin/sh"] {
            if std::path::Path::new(s).exists() { return s.to_string(); }
        }
        "/bin/sh".into()
    }
}

#[cfg(windows)]
fn which_exists(name: &str) -> bool {
    std::process::Command::new("where").arg(name).output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}
```

---

## 2 — Shell flags for dotfile loading

On macOS and Linux, GUI apps do not automatically load `.zshrc`, `.bashrc`, or `.profile` because the shell runs as non-interactive and non-login. This means the user's PATH customizations, aliases, and `nvm`/`rbenv`/`pyenv` shims are missing.

Pass the **interactive + login** flags:

```rust
#[cfg(not(windows))]
{
    let shell_name = std::path::Path::new(&shell)
        .file_name().and_then(|n| n.to_str()).unwrap_or("sh");
    match shell_name {
        "zsh"  => { cmd.arg("-i"); cmd.arg("-l"); }
        "bash" => { cmd.arg("-i"); cmd.arg("-l"); }
        _      => { cmd.arg("-i"); }
    }
}
```

- `-i` = interactive (loads `.zshrc` / `.bashrc`)
- `-l` = login shell (loads `.zprofile` / `.bash_profile`, which sets PATH from `/etc/paths` etc. on macOS)

---

## 3 — Required environment variables

Always set these regardless of platform:

```rust
cmd.env("TERM", "xterm-256color");
cmd.env("COLORTERM", "truecolor");
cmd.env("LANG", "en_US.UTF-8");
cmd.env("PATH", expanded_path());
```

On Windows also set:
```rust
#[cfg(windows)]
cmd.env("TERM", "xterm-256color");  // Windows shells don't set this
```

---

## 4 — Working directory fallback

```rust
let home = std::env::var("HOME")
    .or_else(|_| std::env::var("USERPROFILE"))
    .unwrap_or_else(|_| ".".into());
let work_dir = cwd.filter(|p| !p.is_empty()).unwrap_or(home);
cmd.cwd(&work_dir);
```

---

## Acceptance criteria

- [ ] `detect_shell()` respects `$SHELL` env var on macOS/Linux
- [ ] Falls back to `/bin/zsh` → `/bin/bash` → `/bin/sh` if `$SHELL` is unset or missing
- [ ] On Windows, detects `powershell.exe` before `cmd.exe`
- [ ] `-i -l` flags passed for zsh/bash so dotfiles are sourced
- [ ] `TERM=xterm-256color`, `COLORTERM=truecolor`, `LANG=en_US.UTF-8` are always set
- [ ] `expanded_path()` used as PATH value (existing helper reused)
- [ ] Shell aliases and nvm/rbenv/pyenv shims available in the terminal after opening
- [ ] `cargo build` compiles without errors on macOS and Windows

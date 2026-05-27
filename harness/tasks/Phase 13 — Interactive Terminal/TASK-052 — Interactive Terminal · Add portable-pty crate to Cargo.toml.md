---
id: TASK-052
title: "Interactive Terminal · Add portable-pty crate to Cargo.toml"
type: task
status: open
effort: Low
priority: high
phase: 13
area: rust-backend
---

## Goal

Add the `portable-pty` and `base64` crates to `src-tauri/Cargo.toml`. These are the two new Rust dependencies required before any terminal command code can be written.

- `portable-pty` — cross-platform PTY abstraction: `openpty()` on macOS/Linux, ConPTY on Windows
- `base64` — needed to encode raw PTY bytes as a JSON-safe string before emitting Tauri events (Tauri events carry JSON, not raw binary)

## Files to modify

- `src-tauri/Cargo.toml`

---

## 1 — Add dependencies

In the `[dependencies]` section of `src-tauri/Cargo.toml`, add:

```toml
portable-pty = "0.8"
base64 = "0.22"
```

No feature flags are needed — `portable-pty` auto-selects the platform backend (Unix PTY or ConPTY).

---

## Acceptance criteria

- [ ] `portable-pty = "0.8"` present in `[dependencies]`
- [ ] `base64 = "0.22"` present in `[dependencies]`
- [ ] `cargo build` compiles without errors after adding the dependencies
- [ ] No duplicate dependency entries

---
id: TASK-058
title: "Interactive Terminal · Update Tauri capabilities and CSP for terminal commands"
type: task
status: open
effort: Low
priority: high
phase: 13
area: rust-backend
---

## Goal

Update the Tauri capabilities definition files to expose the four new terminal commands to the frontend. Also verify the Content Security Policy (CSP) in `tauri.conf.json` allows xterm.js inline styles, which are required for the terminal to render.

## Files to modify

- `src-tauri/capabilities/default.json` (or whichever capability file exists)
- `src-tauri/tauri.conf.json`

---

## 1 — Locate the capabilities file

Check `src-tauri/capabilities/` for the capability JSON. It will look like:

```json
{
  "identifier": "default",
  "description": "...",
  "windows": ["main"],
  "permissions": [
    "core:default",
    ...
  ]
}
```

---

## 2 — Add terminal command permissions

Append the four terminal command allow-entries to the `permissions` array:

```json
"allow-create-terminal",
"allow-write-to-terminal",
"allow-resize-terminal",
"allow-kill-terminal"
```

In Tauri 2.x, these identifiers are derived from the command function name with `allow-` prefix and underscores replaced by hyphens.

---

## 3 — Verify/update the CSP

Open `src-tauri/tauri.conf.json` and find the `security.csp` string.

xterm.js injects inline `<style>` tags and uses canvas. The terminal will render blank if `style-src 'unsafe-inline'` is missing.

Ensure the CSP contains at minimum:

```
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
```

The `blob:` in `img-src` is needed for the xterm.js canvas renderer.

If `html2canvas` (already in the project) already forced `unsafe-inline`, this may be a no-op — verify before changing.

Example final CSP value:

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src ipc: http://ipc.localhost
```

---

## Acceptance criteria

- [ ] All four terminal commands present in the capabilities `permissions` array
- [ ] `cargo build` and `npm run tauri build` succeed without capability errors
- [ ] CSP contains `style-src 'unsafe-inline'`
- [ ] CSP contains `img-src ... blob:`
- [ ] Existing permissions are not removed or broken

---
id: TASK-067
title: "Interactive Terminal · Fix Tauri CSP for xterm.js canvas and inline styles"
type: task
status: open
effort: Low
priority: high
phase: 13
area: rust-backend
---

## Goal

xterm.js injects inline `<style>` tags and uses the canvas API with blob URLs for its rendering. The default Tauri Content Security Policy blocks these, causing the terminal to render as a blank box. Update the CSP in `tauri.conf.json` to allow them.

## Files to modify

- `src-tauri/tauri.conf.json`

---

## 1 — Locate the CSP

Open `src-tauri/tauri.conf.json`. Find the `security` section:

```json
"security": {
  "csp": "..."
}
```

---

## 2 — Required CSP directives

xterm.js needs two additions:

| Directive | Addition | Reason |
|-----------|----------|--------|
| `style-src` | `'unsafe-inline'` | xterm injects `<style>` tags for its canvas layer |
| `img-src` | `blob:` | xterm canvas renderer creates blob URLs for image data |

---

## 3 — Check if already covered

`html2canvas` (already in `package.json`) also requires `'unsafe-inline'`. If the CSP was already updated for html2canvas, this task may only require adding `blob:` to `img-src`.

Check the current CSP before editing. If `'unsafe-inline'` is already present in `style-src`, only add `blob:` to `img-src`.

---

## 4 — Final CSP example

```json
"csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src ipc: http://ipc.localhost"
```

Adjust the existing value rather than replacing it wholesale — only add the missing parts.

---

## 5 — Verify no regressions

After updating the CSP:
- Run `npm run tauri dev`
- Open the TERMINAL tab — terminal must render (not blank)
- Open DevTools console — no CSP violation errors should appear
- Existing features (html2canvas PDF export in CQC, etc.) must still work

---

## Acceptance criteria

- [ ] `style-src` in CSP contains `'unsafe-inline'`
- [ ] `img-src` in CSP contains `blob:`
- [ ] Terminal renders correctly (not blank) after CSP update
- [ ] No new CSP violation errors in DevTools console
- [ ] Existing app features unaffected (pdf export, image rendering still work)
- [ ] `npm run tauri dev` starts without errors

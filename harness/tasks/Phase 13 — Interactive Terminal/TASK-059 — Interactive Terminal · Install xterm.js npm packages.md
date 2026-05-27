---
id: TASK-059
title: "Interactive Terminal · Install xterm.js npm packages"
type: task
status: open
effort: Low
priority: high
phase: 13
area: frontend
---

## Goal

Install the three xterm.js npm packages needed to render an interactive terminal in the React frontend.

## Files to modify

- `package.json` (updated by npm install)

---

## 1 — Install command

```bash
npm install @xterm/xterm @xterm/addon-fit @xterm/addon-web-links
```

**Use the `@xterm/` scoped packages (v5+).** Do NOT use the old `xterm` package — it is deprecated and does not work cleanly with Vite/ESM.

### Package roles

| Package | Purpose |
|---------|---------|
| `@xterm/xterm` | Core terminal emulator: renders a canvas-based VT100/xterm-compatible terminal in the browser |
| `@xterm/addon-fit` | `FitAddon.fit()` — resizes the terminal to fill its container; call it after panel resize |
| `@xterm/addon-web-links` | Makes URLs printed in the terminal clickable |

---

## 2 — Import xterm CSS globally

In `Terminal.tsx` (TASK-061), add a global CSS import at the top of the file:

```typescript
import '@xterm/xterm/css/xterm.css'
```

This must be a global import, not a CSS Module import. Vite handles it correctly when imported from a `.tsx` file.

---

## Acceptance criteria

- [ ] `@xterm/xterm` present in `package.json` dependencies
- [ ] `@xterm/addon-fit` present in `package.json` dependencies
- [ ] `@xterm/addon-web-links` present in `package.json` dependencies
- [ ] `npm install` completes without errors
- [ ] `npm run build` (Vite) does not error on the xterm imports
- [ ] Old `xterm` (unscoped) package is NOT added

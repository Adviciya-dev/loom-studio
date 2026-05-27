---
id: TASK-062
title: "Interactive Terminal · Create Terminal.module.css"
type: task
status: open
effort: Low
priority: medium
phase: 13
area: frontend
---

## Goal

Create `src/components/Workspace/Terminal.module.css` with the styles needed for the terminal wrapper, container, exit overlay, and restart button. The xterm.js theme colors are set in the `XTerm` constructor (in `Terminal.tsx`), not in CSS. This file handles layout and the overlay UI only.

## Files to create

- `src/components/Workspace/Terminal.module.css`

---

## 1 — Full CSS module

```css
.wrapper {
  position: relative;
  width: 100%;
  overflow: hidden;
  background: #111111;
}

.container {
  width: 100%;
  height: 100%;
  padding: 4px 8px;
  box-sizing: border-box;
}

/* xterm.js needs the .xterm element to fill the container */
.container :global(.xterm) {
  height: 100%;
}

.container :global(.xterm-viewport) {
  background: transparent !important;
}

.exitOverlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  background: rgba(17, 17, 17, 0.92);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.exitMsg {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
  font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
}

.restartBtn {
  font-size: 11px;
  padding: 2px 10px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 3px;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}

.restartBtn:hover {
  border-color: rgba(255, 255, 255, 0.45);
  color: rgba(255, 255, 255, 0.9);
}
```

---

## Notes

- The xterm global class overrides (`.container :global(.xterm)`) are needed to make xterm fill the container; without them xterm defaults to a fixed internal size.
- Do not set `overflow: hidden` on `.container` — xterm manages its own scrollbar internally via `.xterm-viewport`.

---

## Acceptance criteria

- [ ] `.wrapper` fills parent width and clips overflow
- [ ] `.container` padding gives the terminal breathing room from panel edges
- [ ] xterm fills the container height (`:global(.xterm)` override present)
- [ ] Exit overlay appears at the bottom with semi-transparent background
- [ ] Restart button has hover state
- [ ] No linting or prettier errors (`npm run format`)

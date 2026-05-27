---
id: TASK-064
title: "Interactive Terminal · Wire active project path as terminal working directory"
type: task
status: open
effort: Low
priority: medium
phase: 13
area: frontend
---

## Goal

Ensure the terminal shell starts in the active project's directory when first created, and show a non-blocking advisory message inside xterm when the user switches to a different project while the terminal is running.

## Files to modify

- `src/components/Workspace/Terminal.tsx`

---

## 1 — cwd on creation (already handled by TASK-061)

The `Terminal` component already accepts a `cwd` prop and passes it to `create_terminal`. In `LogPanel.tsx` (TASK-063) it is wired as:

```tsx
<Terminal id={terminalId} cwd={state.activeProject?.path} height={...} />
```

This covers the initial case — the shell opens in the project directory automatically.

---

## 2 — Advisory on project switch

Add a `useEffect` in `Terminal.tsx` that watches the `cwd` prop for changes **after** the terminal is initialized:

```typescript
const isFirstMount = useRef(true)

useEffect(() => {
  if (isFirstMount.current) {
    isFirstMount.current = false
    return
  }
  // cwd changed — user switched projects
  const term = xtermRef.current
  if (!term || !cwd) return
  term.writeln(
    `\r\n\x1b[33m[Project switched to ${cwd}]\x1b[0m\r\n` +
    `\x1b[2mRun  cd "${cwd}"  to navigate there.\x1b[0m\r\n`
  )
}, [cwd])
```

**Do NOT kill and restart the terminal** on project switch — the user may have an active process (e.g., a running dev server). The advisory message is purely informational.

---

## 3 — Why not auto-cd

Auto-changing directory would interrupt running processes and violate user expectations. The advisory pattern matches how VS Code handles workspace folder changes in its integrated terminal.

---

## Acceptance criteria

- [ ] Terminal opens in `state.activeProject.path` when first activated
- [ ] Switching the active project writes the advisory message to xterm (yellow highlight)
- [ ] Advisory does NOT appear on the first mount
- [ ] The shell's working directory is NOT automatically changed
- [ ] `tsc --noEmit` passes with no TypeScript errors

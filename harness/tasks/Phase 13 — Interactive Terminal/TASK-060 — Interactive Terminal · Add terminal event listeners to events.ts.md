---
id: TASK-060
title: "Interactive Terminal · Add terminal event listeners to events.ts"
type: task
status: open
effort: Low
priority: high
phase: 13
area: frontend
---

## Goal

Add two new event listener functions to `src/lib/events.ts` for the terminal events emitted by the Rust backend: `terminal_output` (raw PTY bytes, base64-encoded) and `terminal_exit` (shell process exited).

## Files to modify

- `src/lib/events.ts`

---

## 1 — Add to events.ts

Append the following two exports at the end of the file, after the existing audit event listeners:

```typescript
// ─── Terminal events ──────────────────────────────────────────────────────────

export const onTerminalOutput = (cb: (id: string, data: string) => void) =>
  listen<{ id: string; data: string }>('terminal_output', (e) =>
    cb(e.payload.id, e.payload.data)
  )

export const onTerminalExit = (cb: (id: string, code: number | null) => void) =>
  listen<{ id: string; code: number | null }>('terminal_exit', (e) =>
    cb(e.payload.id, e.payload.code)
  )
```

---

## 2 — Data format notes

- `terminal_output.data` is a **base64-encoded string** of raw PTY bytes. The `Terminal.tsx` component decodes it with `atob(data)` before passing to xterm.js.
- `terminal_exit.code` is `null` when the shell was killed (no exit code), or a number like `0` (clean exit) or `1` (error exit).
- Both events include `id` so multiple terminal sessions can coexist — the component filters by matching its own ID.

---

## Acceptance criteria

- [ ] `onTerminalOutput` exported from `events.ts`
- [ ] `onTerminalExit` exported from `events.ts`
- [ ] Both functions follow the existing listener pattern (return `Promise<UnlistenFn>`)
- [ ] `tsc --noEmit` passes with no TypeScript errors

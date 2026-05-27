---
id: TASK-063
title: "Interactive Terminal · Add OUTPUT and TERMINAL tab switching to bottom panel"
type: task
status: open
effort: Medium
priority: high
phase: 13
area: frontend
---

## Goal

Extend `src/components/Workspace/LogPanel.tsx` to add a second tab — **TERMINAL** — alongside the existing **OUTPUT** tab. The OUTPUT tab keeps all existing behavior unchanged. The TERMINAL tab renders the new `Terminal.tsx` component. The terminal session only mounts when the TERMINAL tab is first activated (lazy init), so the shell does not spawn on app startup.

## Files to modify

- `src/components/Workspace/LogPanel.tsx`
- `src/components/Workspace/LogPanel.module.css`

---

## 1 — State additions

Add two pieces of state to the `LogPanel` component:

```typescript
type PanelTab = 'output' | 'terminal'
const [activeTab, setActiveTab] = useState<PanelTab>('output')
const [terminalMounted, setTerminalMounted] = useState(false)
const [terminalId] = useState(() => crypto.randomUUID())
```

`terminalMounted` latches to `true` the first time the user switches to the TERMINAL tab. Once mounted, the `<Terminal>` component stays in the DOM (but hidden when on OUTPUT tab) so the shell session persists across tab switches.

---

## 2 — Tab bar update

Replace the single `<button className={styles.tabBtn} ...>` with two tab buttons:

```tsx
<button
  className={`${styles.tabBtn} ${activeTab === 'output' ? styles.tabActive : ''}`}
  onClick={() => setActiveTab('output')}
>
  <span className={styles.tabLabel}>OUTPUT</span>
  {isRunning && activeTab !== 'output' && <span className={styles.liveDot} aria-label="running" />}
  {logLines.length > 0 && (
    <span className={styles.lineCount}>{logLines.length.toLocaleString()}</span>
  )}
</button>

<button
  className={`${styles.tabBtn} ${activeTab === 'terminal' ? styles.tabActive : ''}`}
  onClick={() => {
    setActiveTab('terminal')
    setTerminalMounted(true)
  }}
>
  <span className={styles.tabLabel}>TERMINAL</span>
</button>
```

---

## 3 — Header actions — show only on OUTPUT tab

Wrap the existing header actions (conflict button, scroll-to-latest, clear button) with a conditional:

```tsx
{activeTab === 'output' && (
  <div className={styles.headerActions}>
    {/* ... existing action buttons unchanged ... */}
  </div>
)}
```

The toggle collapse button (`▾` / `▴`) stays outside the conditional so it always shows.

---

## 4 — Body — render based on active tab

Replace the current body section:

```tsx
{open && (
  <div className={styles.body} ref={bodyRef} onScroll={handleScroll}
    style={{ display: activeTab === 'output' ? undefined : 'none' }}
  >
    {/* ... existing log rendering unchanged ... */}
  </div>
)}

{open && terminalMounted && (
  <Terminal
    id={terminalId}
    cwd={state.activeProject?.path}
    height={panelHeight - HEADER_H}
    style={{ display: activeTab === 'terminal' ? undefined : 'none' }}
  />
)}
```

Using `display: none` (instead of unmounting) keeps the terminal session alive when switching back to OUTPUT.

**Note:** `Terminal` component does not accept a `style` prop in TASK-061's definition. Either add `style?: React.CSSProperties` to `TerminalProps`, or wrap in a `<div style={{ display: ... }}>`.

---

## 5 — CSS additions to LogPanel.module.css

```css
.tabActive {
  color: #fff;
  border-bottom: 2px solid rgba(255, 255, 255, 0.7);
}
```

---

## Acceptance criteria

- [ ] OUTPUT tab shows existing log panel behavior exactly as before
- [ ] TERMINAL tab shows xterm.js interactive terminal
- [ ] Terminal session is NOT created until TERMINAL tab is first activated
- [ ] Switching back to OUTPUT tab keeps the terminal session running in background
- [ ] Live dot indicator shows on OUTPUT tab when engine is running
- [ ] Clear / scroll buttons only appear on OUTPUT tab
- [ ] Panel resize handle works for both tabs
- [ ] `tsc --noEmit` passes with no TypeScript errors

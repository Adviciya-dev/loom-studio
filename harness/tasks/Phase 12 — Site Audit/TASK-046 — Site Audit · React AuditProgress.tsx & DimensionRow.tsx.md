---
id: TASK-046
title: "Site Audit · React AuditProgress.tsx & DimensionRow.tsx"
type: task
status: open
effort: High
priority: high
phase: 2
area: frontend
---

## Goal

Build the Phase 2 UI: the audit progress panel with streaming log and all 8 dimension status rows. Includes Start Audit, Cancel, Re-run, and Generate Report buttons.

## Files to create

```
src/components/SiteAudit/
  AuditProgress.tsx
  AuditProgress.module.css
  DimensionRow.tsx
```

---

## AuditProgress.tsx

### Props

```typescript
interface AuditProgressProps {
  session: AuditSession
  dimensions: AuditDimensionStatus[]
  logLines: LogLine[]
  onStartAudit: () => void
  onCancelAudit: () => void
  onRerunAudit: () => void
  onGenerateReport: () => void
}
```

### Layout

```
┌─────────────────────────────────────────────────────┐
│  Phase 2 — Audit Execution                          │
│  [Start Audit]  [Cancel]  [Re-run]                  │
│  Estimated time: 2–4 minutes  (shown after start)   │
├─────────────────────────────────────────────────────┤
│  Dimension rows (8 rows, always rendered)           │
│  ┌─────────────────────────────────────────────┐   │
│  │ DimensionRow × 8                            │   │
│  └─────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────┤
│  Streaming log (scrollable, auto-scroll to bottom)  │
│  [Generate Report]  (bottom-right, enabled on done) │
└─────────────────────────────────────────────────────┘
```

### Button states

| Button | Visible | Enabled |
|---|---|---|
| Start Audit | `phase !== 'running'` | `phase === 'intake'` and intake saved |
| Cancel | `phase === 'running'` | always when visible |
| Re-run | `phase === 'done' \|\| phase === 'cancelled'` | always when visible |
| Generate Report | always | `phase === 'done'` AND at least one raw file exists (passed as `canGenerateReport` prop) |

**Estimated time label:** render only when `phase === 'running'`.  
Static text: `"Estimated time: 2–4 minutes"`

### Streaming log

- Scrollable `<div>` with `overflow-y: auto`
- Auto-scrolls to bottom when new lines arrive (use `useEffect` + `ref.scrollTop = ref.scrollHeight`)
- Each line: `<div className={styles.logLine} data-level={line.level}>` 
  - `error` → red text
  - `warn` → amber text
  - `info` → default text colour
- Show timestamp prefix in muted colour: `[HH:MM:SS]`
- Maximum 500 lines displayed (trim oldest when exceeded)

### Re-run confirmation

On Re-run click, show a `window.confirm` (or a modal if a shared `ConfirmDialog` component exists):  
`"This will delete all existing audit data for this session. Continue?"`  
Only call `onRerunAudit` if confirmed.

### Event listeners

`AuditProgress` subscribes to Phase 2 events on mount and dispatches to state:

```typescript
useEffect(() => {
  const unsubs = [
    listenAuditDimensionStatus(status => dispatch({ type: 'AUDIT_DIMENSION_STATUS', payload: status })),
    listenAuditLogLine(line => dispatch({ type: 'AUDIT_LOG_LINE', payload: line })),
    listenAuditCompleted(() => dispatch({ type: 'AUDIT_COMPLETED' })),
    listenAuditCancelled(() => dispatch({ type: 'AUDIT_CANCELLED' })),
    listenAuditError(err => dispatch({ type: 'AUDIT_LOG_LINE', payload: { timestamp: new Date().toISOString(), level: 'error', content: err.message } })),
  ]
  return () => unsubs.forEach(fn => fn())
}, [dispatch])
```

---

## DimensionRow.tsx

### Props

```typescript
interface DimensionRowProps {
  dimension: AuditDimensionStatus
}
```

### Layout (single row)

```
[ icon ]  Label                    Score     Status badge
          [error detail area]               (collapsed by default)
```

**Status icons:**

| Status | Icon | Style |
|---|---|---|
| `pending` | `○` | muted |
| `running` | `◌` (animated spin) | accent colour |
| `done` | `✓` | green |
| `error` | `!` | red, clickable to expand |
| `skipped` | `–` | muted italic |

**Score display:**
- Show `{score}/100` when `status === 'done'` and `score !== null`
- Show nothing (empty) for `pending`, `running`, `skipped`
- Show `Error` for `error` status

**Error expansion:**
- Clicking an `error` row (or the `!` icon) toggles an inline detail area below the row
- Detail area shows `dimension.errorMessage` in a muted, smaller font
- The rest of the dimension rows are unaffected

**Skipped row:**
- Full row rendered in muted text
- Label shows `Skipped` in brackets or as a badge
- Tooltip on hover: `"Lighthouse not found — run npm i -g lighthouse"` (for performance/accessibility) or `"No competitors provided"` etc. — pass `tooltipText` as prop from `AuditProgress`

### CSS

```css
/* AuditProgress.module.css */
.container { display: flex; flex-direction: column; height: 100%; }
.dimensionList { flex: 0 0 auto; padding: 12px 16px; border-bottom: 1px solid var(--border); }
.logArea { flex: 1 1 auto; overflow-y: auto; padding: 8px 16px; font-family: monospace; font-size: 12px; }
.logLine { padding: 2px 0; }
.logLine[data-level="error"] { color: var(--red); }
.logLine[data-level="warn"] { color: var(--amber); }
.actions { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--border); }
```

## Acceptance criteria

- [ ] All 8 dimension rows render immediately when `AuditProgress` mounts (regardless of run state)
- [ ] Skipped rows show `–` icon and muted text; they are never hidden
- [ ] Clicking an error row expands the inline error detail; a second click collapses it
- [ ] Score appears in the dimension row immediately when `status === 'done'` (not after all dimensions finish)
- [ ] Log lines auto-scroll to bottom; `error` = red, `warn` = amber, `info` = default
- [ ] Timestamp prefix shown in muted colour on each log line
- [ ] "Estimated time: 2–4 minutes" label visible only while `phase === 'running'`
- [ ] Re-run button shows only when `phase === 'done' || phase === 'cancelled'`; clicking shows confirmation before firing `onRerunAudit`
- [ ] Generate Report button is disabled when `!canGenerateReport`; enabled when condition met
- [ ] Event listeners are unregistered on component unmount

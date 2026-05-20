---
id: TASK-047
title: "Site Audit · Reducer Phase 2 Actions"
type: task
status: open
effort: Low
priority: high
phase: 2
area: state
---

## Goal

Add Phase 2 action handlers to `src/context/reducer.ts` to manage audit execution state: dimensions, log lines, and phase transitions.

## Files to modify

- `src/context/reducer.ts`
- `src/context/types.ts` (verify Phase 2 types are present from TASK-034; add if missing)

---

## State shape (verify these fields exist from TASK-034)

```typescript
// In AppState:
auditDimensions: AuditDimensionStatus[]   // all 8 rows
auditLog: LogLine[]                        // streaming log
activeAuditSession: AuditSession | null    // current session
```

If any of these are missing from `types.ts`, add them now (they should be present from TASK-034).

---

## Reducer cases to add

### `AUDIT_STARTED`

```typescript
case 'AUDIT_STARTED':
  return {
    ...state,
    activeAuditSession: state.activeAuditSession
      ? { ...state.activeAuditSession, phase: 'running' }
      : null,
    auditDimensions: INITIAL_DIMENSIONS,  // reset all 8 to pending
    auditLog: [],
  }
```

`INITIAL_DIMENSIONS` is a constant array of all 8 dimensions with `status: 'pending'`, `score: null`, `errorMessage: null`.

```typescript
const INITIAL_DIMENSIONS: AuditDimensionStatus[] = [
  { key: 'performance',  label: 'Performance',      status: 'pending', score: null, errorMessage: null },
  { key: 'seo',          label: 'SEO On-Page',       status: 'pending', score: null, errorMessage: null },
  { key: 'accessibility',label: 'Accessibility',     status: 'pending', score: null, errorMessage: null },
  { key: 'technical',    label: 'Technical Health',  status: 'pending', score: null, errorMessage: null },
  { key: 'code_quality', label: 'Code Quality',      status: 'pending', score: null, errorMessage: null },
  { key: 'content',      label: 'Content & Copy',    status: 'pending', score: null, errorMessage: null },
  { key: 'competitors',  label: 'Competitor Gap',    status: 'pending', score: null, errorMessage: null },
  { key: 'security',     label: 'Security',          status: 'pending', score: null, errorMessage: null },
]
```

---

### `AUDIT_DIMENSION_STATUS`

Payload: `AuditDimensionStatus` (key, label, status, score, errorMessage)

```typescript
case 'AUDIT_DIMENSION_STATUS':
  return {
    ...state,
    auditDimensions: state.auditDimensions.map(dim =>
      dim.key === action.payload.key
        ? { ...dim, ...action.payload }
        : dim
    ),
  }
```

---

### `AUDIT_LOG_LINE`

Payload: `LogLine` (timestamp, level, content)

```typescript
case 'AUDIT_LOG_LINE': {
  const MAX_LINES = 500
  const newLog = [...state.auditLog, action.payload]
  return {
    ...state,
    auditLog: newLog.length > MAX_LINES
      ? newLog.slice(newLog.length - MAX_LINES)
      : newLog,
  }
}
```

---

### `AUDIT_COMPLETED`

```typescript
case 'AUDIT_COMPLETED':
  return {
    ...state,
    activeAuditSession: state.activeAuditSession
      ? { ...state.activeAuditSession, phase: 'done' }
      : null,
  }
```

Note: `phase: 'done'` is an intermediate state used internally in the UI to distinguish "all dimensions finished" from `'report'` (report generated). If `AuditPhase` type from TASK-034 does not include `'done'`, add it:

```typescript
type AuditPhase = 'intake' | 'running' | 'done' | 'report' | 'goals' | 'cancelled' | 'complete'
```

---

### `AUDIT_CANCELLED`

```typescript
case 'AUDIT_CANCELLED':
  return {
    ...state,
    activeAuditSession: state.activeAuditSession
      ? { ...state.activeAuditSession, phase: 'cancelled' }
      : null,
  }
```

---

## `AUDIT_STARTED` dispatch in AuditProgress

When the user clicks Start Audit in `AuditProgress.tsx`:

```typescript
const handleStartAudit = async () => {
  dispatch({ type: 'AUDIT_STARTED' })
  await invoke('audit_start', {
    projectPath: activeProject.path,
    sessionId: session.id,
  })
}
```

Dispatch `AUDIT_STARTED` immediately (before the `invoke` resolves) so the UI transitions to running state without waiting for the engine to acknowledge.

---

## Type additions to verify

In `src/types/index.ts` or `src/context/types.ts`, confirm these are defined (from TASK-034):

```typescript
interface AuditDimensionStatus {
  key: string
  label: string
  status: 'pending' | 'running' | 'done' | 'error' | 'skipped'
  score: number | null
  errorMessage: string | null
}

interface LogLine {
  timestamp: string
  level: 'info' | 'warn' | 'error'
  content: string
}
```

If `LogLine` is already defined for the Workspace module, reuse it rather than creating a duplicate.

---

## Acceptance criteria

- [ ] `AUDIT_STARTED` resets `auditDimensions` to all 8 pending rows and clears `auditLog`
- [ ] `AUDIT_STARTED` sets `activeAuditSession.phase` to `'running'`
- [ ] `AUDIT_DIMENSION_STATUS` updates the matching dimension row in-place by `key`; other rows unchanged
- [ ] `AUDIT_LOG_LINE` appends to log and trims to max 500 lines
- [ ] `AUDIT_COMPLETED` sets `activeAuditSession.phase` to `'done'`
- [ ] `AUDIT_CANCELLED` sets `activeAuditSession.phase` to `'cancelled'`
- [ ] `AuditPhase` type includes `'done'` as a valid value
- [ ] `INITIAL_DIMENSIONS` constant is defined outside the reducer function (not recreated per action)
- [ ] No TypeScript errors (`tsc --noEmit` passes)

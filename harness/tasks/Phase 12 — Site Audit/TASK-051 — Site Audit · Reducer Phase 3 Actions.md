---
id: TASK-051
title: "Site Audit · Reducer Phase 3 Actions"
type: task
status: open
effort: Low
priority: high
phase: 3
area: state
---

## Goal

Add Phase 3 state fields and reducer cases for report generation, and wire up the `audit_report_ready` event listener in `SiteAudit.tsx` so the frontend receives the completed report automatically.

## Files to modify

- `src/context/types.ts`
- `src/context/reducer.ts`
- `src/components/SiteAudit/SiteAudit.tsx`

---

## 1 — New state fields (`types.ts`)

Add three fields to `AppState` (alongside the existing `auditSessions`, `auditPhase`, etc.):

```typescript
auditReport: string | null            // markdown content of report.md
auditReportGenerating: boolean        // true while Claude is writing the report
auditReportError: string | null       // error message if generation failed
```

Initial values in the default state object:

```typescript
auditReport: null,
auditReportGenerating: false,
auditReportError: null,
```

---

## 2 — New action types (`types.ts`)

Add to the `AppAction` union:

```typescript
| { type: 'AUDIT_REPORT_STARTED' }
| { type: 'AUDIT_REPORT_READY'; payload: { reportPath: string; markdown: string } }
| { type: 'AUDIT_REPORT_FAILED'; payload: string }   // payload = error message
```

Also add `AUDIT_PHASE_SET` if it is not already present (used by `ReportViewer` to navigate to goals):

```typescript
| { type: 'AUDIT_PHASE_SET'; payload: AuditPhase }
```

---

## 3 — Reducer cases (`reducer.ts`)

### `AUDIT_REPORT_STARTED`

```typescript
case 'AUDIT_REPORT_STARTED':
  return {
    ...state,
    auditReportGenerating: true,
    auditReportError: null,
  }
```

### `AUDIT_REPORT_READY`

```typescript
case 'AUDIT_REPORT_READY':
  return {
    ...state,
    auditReportGenerating: false,
    auditReportError: null,
    auditReport: action.payload.markdown,
    auditPhase: 'report',
    activeAuditSession: state.activeAuditSession
      ? {
          ...state.activeAuditSession,
          phase: 'report',
          reportPath: action.payload.reportPath,
        }
      : null,
    auditSessions: state.auditSessions.map(s =>
      s.id === state.activeAuditSession?.id
        ? { ...s, phase: 'report', reportPath: action.payload.reportPath }
        : s
    ),
  }
```

### `AUDIT_REPORT_FAILED`

```typescript
case 'AUDIT_REPORT_FAILED':
  return {
    ...state,
    auditReportGenerating: false,
    auditReportError: action.payload,
  }
```

### `AUDIT_PHASE_SET`

```typescript
case 'AUDIT_PHASE_SET':
  return {
    ...state,
    auditPhase: action.payload,
    activeAuditSession: state.activeAuditSession
      ? { ...state.activeAuditSession, phase: action.payload }
      : null,
  }
```

---

## 4 — Event listener in `SiteAudit.tsx`

The Go engine emits `audit_report_ready` with `{ sessionId, reportPath }`. Tauri forwards it to the frontend. `SiteAudit.tsx` listens, reads the markdown, and dispatches `AUDIT_REPORT_READY`.

Import the Tauri event listener and the audit read function:

```typescript
import { listen } from '@tauri-apps/api/event'
import { auditReadReport } from '@/lib/audit'
```

Add inside the `SiteAudit` component, alongside the existing session-load effect:

```typescript
useEffect(() => {
  const unlisten = listen<{ sessionId: string; reportPath: string }>(
    'audit_report_ready',
    async ({ payload }) => {
      if (payload.sessionId !== state.activeAuditSession?.id) return
      try {
        const markdown = await auditReadReport(
          state.activeProject!.path,
          payload.sessionId,
        )
        dispatch({
          type: 'AUDIT_REPORT_READY',
          payload: { reportPath: payload.reportPath, markdown },
        })
      } catch (err) {
        dispatch({ type: 'AUDIT_REPORT_FAILED', payload: String(err) })
      }
    },
  )
  return () => { unlisten.then(fn => fn()) }
}, [state.activeAuditSession?.id]) // eslint-disable-line react-hooks/exhaustive-deps
```

Also listen for `audit_error` to surface engine-side failures during report generation:

```typescript
useEffect(() => {
  const unlisten = listen<{ sessionId: string; dimension: string; message: string }>(
    'audit_error',
    ({ payload }) => {
      if (payload.sessionId !== state.activeAuditSession?.id) return
      // Only update report error state when we're in report-generating mode
      if (state.auditReportGenerating) {
        dispatch({ type: 'AUDIT_REPORT_FAILED', payload: payload.message })
      }
    },
  )
  return () => { unlisten.then(fn => fn()) }
}, [state.activeAuditSession?.id, state.auditReportGenerating]) // eslint-disable-line react-hooks/exhaustive-deps
```

---

## 5 — Clear report state on session switch

When the user clicks a different session in `SessionList`, the active session changes. Clear the report fields so the new session starts fresh:

Find the existing `AUDIT_SESSION_SELECTED` (or equivalent) reducer case and add:

```typescript
case 'AUDIT_SESSION_SELECTED':
  return {
    ...state,
    activeAuditSession: action.payload,
    auditPhase: action.payload.phase,
    auditReport: null,
    auditReportGenerating: false,
    auditReportError: null,
    auditDimensions: INITIAL_DIMENSIONS,
    auditLog: [],
  }
```

If the session's phase is `'report'` or `'goals'` or `'complete'`, the report needs to be loaded from disk. Add this load after dispatch in `SessionList.tsx` (or wherever `AUDIT_SESSION_SELECTED` is dispatched):

```typescript
if (['report', 'goals', 'complete'].includes(session.phase) && session.reportPath) {
  auditReadReport(activeProject.path, session.id)
    .then(markdown => dispatch({ type: 'AUDIT_REPORT_READY', payload: { reportPath: session.reportPath!, markdown } }))
    .catch(() => {})
}
```

---

## Acceptance criteria

- [ ] `auditReport`, `auditReportGenerating`, `auditReportError` exist in `AppState` with correct initial values
- [ ] `AUDIT_REPORT_STARTED` sets `auditReportGenerating: true` and clears `auditReportError`
- [ ] `AUDIT_REPORT_READY` sets `auditReport`, advances `auditPhase` to `'report'`, updates `activeAuditSession.phase` and `reportPath`, and mirrors the change in `auditSessions` array
- [ ] `AUDIT_REPORT_FAILED` sets `auditReportError` and clears `auditReportGenerating`
- [ ] `AUDIT_PHASE_SET` updates both `auditPhase` and `activeAuditSession.phase`
- [ ] `SiteAudit.tsx` listens for `audit_report_ready`, reads the markdown via `auditReadReport`, and dispatches `AUDIT_REPORT_READY`
- [ ] `audit_error` during report generation dispatches `AUDIT_REPORT_FAILED`
- [ ] Switching sessions clears `auditReport` / `auditReportGenerating` / `auditReportError`
- [ ] Loading a session with `phase === 'report'` restores the report markdown from disk
- [ ] `tsc --noEmit` passes with no TypeScript errors

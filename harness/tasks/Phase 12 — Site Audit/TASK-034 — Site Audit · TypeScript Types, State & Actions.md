# TASK-034: Site Audit · TypeScript Types, State & Actions

## Meta
| Field | Value |
|-------|-------|
| **Assignee** | — |
| **Status** | 🔲 To Do |
| **Priority** | P0 |
| **Sprint** | Sprint 9 |
| **Story Points** | 3 |
| **PRD Reference** | harness/site-audit-prd.md §10.2 §10.3 |
| **Architecture Ref** | harness/site-audit-prd.md §10.1 |
| **Start Date** | — |
| **Due Date** | — |
| **Created** | 2026-05-17 |
| **Completed** | — |

---

## Description

Add all new TypeScript types, AppState fields, and AppAction variants required by the Site Audit feature. This is a pure types-and-state task — no UI, no backend. Everything else in Phase 12 depends on these definitions being correct and complete.

The canonical source for every type defined here is **PRD §10.2** and **§10.3**.

---

## Sub Tasks

### Layer 1 — New types in `src/types/index.ts`

Add the following exports to the existing types file. Do **not** modify any existing type — only append new ones.

```typescript
// ─── Site Audit ────────────────────────────────────────────────────────────

export type AuditPhase =
  | 'intake'
  | 'running'
  | 'report'
  | 'goals'
  | 'cancelled'
  | 'complete'
// 'cancelled' — audit started but user cancelled before all dimensions done
// 'complete'  — tasks have been saved to harness/tasks/ at least once

export type CmsOption =
  | 'wordpress'
  | 'nextjs'
  | 'nuxt'
  | 'laravel'
  | 'shopify'
  | 'custom'
  | 'other'

export interface AuditIntake {
  siteUrl: string
  siteName: string
  cms: CmsOption
  cmsOther: string            // only populated when cms === 'other'
  industry: string
  nicheKeywords: string
  targetMarket: string
  competitors: string[]        // max 5; each a well-formed URL
  localRepoPath: string | null // validated: path exists + non-empty dir
  businessGoal: string
  budgetTimeline: string
}

export interface AuditSession {
  id: string             // UUID v4 — crypto.randomUUID()
  version: number        // schema version, starts at 1
  projectId: string
  siteName: string
  siteUrl: string
  createdAt: string      // ISO 8601 timestamp
  updatedAt: string      // ISO 8601 timestamp — set on each save
  phase: AuditPhase
  intakePath: string     // absolute path to intake.json
  reportPath: string | null
  taskCount: number      // number of tasks saved to harness/tasks/
}

export type DimensionStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped'

export interface AuditDimensionStatus {
  key: string
  label: string
  status: DimensionStatus
  score: number | null   // populated as soon as dimension reaches 'done'
  errorMessage: string | null  // non-null only when status === 'error'
}

export type GoalBucket =
  | 'critical'
  | 'this_week'
  | 'high_priority'
  | 'this_month'
  | 'ongoing'
  | 'content_links'

export interface GoalTask {
  id: string
  title: string
  bucket: GoalBucket
  dimension: string
  effort: 'Low' | 'Medium' | 'High'
  owner: string | null
  notes: string
  linkedReportSection: string
}
```

- [ ] Append all types above to `src/types/index.ts`
- [ ] Verify no existing type is renamed or removed

---

### Layer 2 — AppState additions in `src/context/types.ts`

Extend the existing `AppState` interface with the following fields:

```typescript
// Add inside the existing AppState interface:
auditSessions: AuditSession[]
activeAuditSession: AuditSession | null
auditPhase: AuditPhase
auditDimensions: AuditDimensionStatus[]
auditLog: LogLine[]        // reuse existing LogLine type
```

- [ ] Add the five fields to `AppState` in `src/context/types.ts`

---

### Layer 3 — Initial state defaults in `src/context/reducer.ts`

Add default values for the five new AppState fields in the `initialState` object (or wherever defaults are declared):

```typescript
auditSessions: [],
activeAuditSession: null,
auditPhase: 'intake',
auditDimensions: [],
auditLog: [],
```

- [ ] Add defaults to `initialState` in `src/context/reducer.ts`

---

### Layer 4 — New AppAction variants in `src/context/types.ts`

Append the following action discriminants to the existing `AppAction` union type:

```typescript
// Intake
| { type: 'AUDIT_SESSION_CREATED'; payload: AuditSession }
| { type: 'AUDIT_INTAKE_SAVED'; payload: AuditIntake }

// Execution
| { type: 'AUDIT_STARTED' }
| { type: 'AUDIT_DIMENSION_STATUS'; payload: AuditDimensionStatus }
| { type: 'AUDIT_LOG_LINE'; payload: LogLine }
| { type: 'AUDIT_COMPLETED' }
| { type: 'AUDIT_CANCELLED' }

// Report
| { type: 'AUDIT_REPORT_READY'; payload: { reportPath: string; markdown: string } }

// Goals
| { type: 'AUDIT_GOALS_READY'; payload: GoalTask[] }
| { type: 'AUDIT_GOAL_TASK_UPDATED'; payload: GoalTask }
| { type: 'AUDIT_GOAL_TASK_REMOVED'; payload: string }  // task id
| { type: 'AUDIT_TASKS_SAVED'; payload: { count: number } }
// AUDIT_TASKS_SAVED reducer must:
//   • set activeAuditSession.phase → 'complete'
//   • increment activeAuditSession.taskCount by payload.count
//   • trigger auto-dismiss toast (4 s)

// Session management
| { type: 'AUDIT_SESSIONS_LOADED'; payload: AuditSession[] }
| { type: 'AUDIT_ACTIVE_SESSION_SET'; payload: AuditSession }
```

- [ ] Append all action variants to `AppAction` in `src/context/types.ts`

---

### Layer 5 — Reducer cases in `src/context/reducer.ts`

Add a `switch` case for each new action. Minimum correct handling:

| Action | Reducer behaviour |
|--------|-------------------|
| `AUDIT_SESSIONS_LOADED` | Set `auditSessions = payload` |
| `AUDIT_SESSION_CREATED` | Prepend session to `auditSessions`; set `activeAuditSession = payload`; set `auditPhase = 'intake'` |
| `AUDIT_ACTIVE_SESSION_SET` | Set `activeAuditSession = payload`; set `auditPhase = payload.phase` |
| `AUDIT_INTAKE_SAVED` | No-op on sessions list; consumed by IntakeForm component directly |
| `AUDIT_STARTED` | Set `auditPhase = 'running'`; clear `auditLog = []`; reset `auditDimensions` to 8 rows with `status = 'pending'` |
| `AUDIT_DIMENSION_STATUS` | Merge updated dimension into `auditDimensions` array (match by `key`) |
| `AUDIT_LOG_LINE` | Append to `auditLog` |
| `AUDIT_COMPLETED` | Set `auditPhase = 'report'`; update `activeAuditSession.phase` |
| `AUDIT_CANCELLED` | Set `auditPhase = 'cancelled'`; update `activeAuditSession.phase` |
| `AUDIT_REPORT_READY` | Set `auditPhase = 'report'`; set `activeAuditSession.reportPath` |
| `AUDIT_GOALS_READY` | Set `auditPhase = 'goals'` |
| `AUDIT_GOAL_TASK_UPDATED` | No global state change needed (GoalPlanner owns local state) |
| `AUDIT_GOAL_TASK_REMOVED` | No global state change needed |
| `AUDIT_TASKS_SAVED` | Set `activeAuditSession.phase = 'complete'`; increment `activeAuditSession.taskCount` by `payload.count`; also update the matching session in `auditSessions` array |

- [ ] Add all cases to the reducer switch statement
- [ ] The `AUDIT_STARTED` case must initialise `auditDimensions` with all 8 dimension rows using keys and labels from the table in PRD §6.1

**Default 8 dimension rows for `AUDIT_STARTED`:**
```typescript
const AUDIT_DIMENSION_ROWS: AuditDimensionStatus[] = [
  { key: 'performance',   label: 'Performance',      status: 'pending', score: null, errorMessage: null },
  { key: 'seo',           label: 'SEO On-page',       status: 'pending', score: null, errorMessage: null },
  { key: 'accessibility', label: 'Accessibility',     status: 'pending', score: null, errorMessage: null },
  { key: 'technical',     label: 'Technical Health',  status: 'pending', score: null, errorMessage: null },
  { key: 'code_quality',  label: 'Code Quality',      status: 'pending', score: null, errorMessage: null },
  { key: 'content',       label: 'Content & Copy',    status: 'pending', score: null, errorMessage: null },
  { key: 'competitors',   label: 'Competitor Gap',    status: 'pending', score: null, errorMessage: null },
  { key: 'security',      label: 'Security',          status: 'pending', score: null, errorMessage: null },
]
```

---

## Acceptance Criteria

- [ ] All new types compile with `strict: true` — no TypeScript errors
- [ ] `AppState` includes all 5 new fields with correct types
- [ ] `AppAction` includes all 14 new action variants
- [ ] Every new action has a corresponding reducer case; no unhandled action warning
- [ ] `AUDIT_STARTED` initialises all 8 dimension rows in correct order
- [ ] `AUDIT_TASKS_SAVED` correctly sets `phase = 'complete'` and increments `taskCount` on both `activeAuditSession` and the matching entry in `auditSessions`
- [ ] No existing reducer cases or state fields are modified or broken
- [ ] `pnpm build` completes without type errors

---

## Technical Notes

- `LogLine` is already defined in the codebase — reuse it for `auditLog` (do not define a duplicate type)
- Keep the `AUDIT_DIMENSION_ROWS` constant outside the reducer function so it is not recreated on every dispatch
- Reducer must be a pure function — no side effects; toast triggering will be handled via a `useEffect` in the shell component watching `taskCount`

---

## Files to Modify

```
MODIFY:
src/types/index.ts          ← append new audit types
src/context/types.ts        ← extend AppState + AppAction
src/context/reducer.ts      ← add initial state defaults + all reducer cases
```

---

## Dependencies

- **Blocked by:** nothing — this is the first Phase 12 task
- **Blocks:** TASK-035, TASK-036, TASK-037, TASK-038, TASK-039

---

## Claude Code Context

```
harness/claude.md
harness/tasks/Phase 12 — Site Audit/TASK-034 — Site Audit · TypeScript Types, State & Actions.md
harness/site-audit-prd.md
src/types/index.ts
src/context/types.ts
src/context/reducer.ts
```

---

## Progress Log

| Date | Update |
|------|--------|
| 2026-05-17 | Task created — Phase 12 Site Audit kickoff |

---

## Time Log

| Date | Hours | Note |
|------|-------|------|
| — | — | — |

---

## Review Notes

- **—**

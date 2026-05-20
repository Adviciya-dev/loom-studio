# TASK-028: Content Quality Checker · Frontend Types, State & Events

## Meta
| Field | Value |
|-------|-------|
| **Assignee** | — |
| **Status** | ✅ Done |
| **Priority** | P1 |
| **Sprint** | Sprint 8 |
| **Story Points** | 5 |
| **PRD Reference** | harness/content-review-prd.md |
| **Architecture Ref** | architecture.md |
| **Start Date** | — |
| **Due Date** | — |
| **Created** | 2026-05-11 |
| **Completed** | — |

---

## Description

Add all CQC-related TypeScript types, AppState fields, AppAction variants, reducer cases, and Tauri event listeners. This is the foundation layer that all CQC UI components depend on — no UI is built here, only the data plumbing.

---

## Sub Tasks

### Layer 1 — TypeScript Types

Add to `src/types/index.ts`:

```typescript
export interface CqcClient {
  id: string
  name: string
  brand_spelling: string
  brand_spelling_variants: string
  required_hashtags: string
  banned_words: string
  tone: string
  key_facts: string
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface CqcIssue {
  type: 'spelling' | 'grammar' | 'brand' | 'fact'
  snippet: string
  explanation: string
  suggested_fix?: string
  severity: 'high' | 'medium' | 'low'
}

export interface CqcCheckResult {
  extracted_text: string
  issues: CqcIssue[]
  summary: string
  approved: boolean
}

export interface CqcLogEntry {
  id: string
  client_id: string
  user: string
  content_type: 'text' | 'image'
  content_preview: string
  image_path?: string
  issue_count: number
  issues_json: string
  summary: string
  approved: boolean
  created_at: string
}

export type CqcProgressStep =
  | 'building_prompt'
  | 'running_claude'
  | 'parsing_result'
  | 'saving_log'

export type CqcSubView = 'check' | 'clients' | 'log'
```

- [ ] Add all types above to `src/types/index.ts`

---

### Layer 2 — AppState Fields

Add to the `AppState` interface in `src/context/types.ts`:

```typescript
// CQC
cqcClients: CqcClient[]
cqcSelectedClientId: string | null
cqcActiveCheck: CqcCheckResult | null
cqcCheckRunning: boolean
cqcProgressStep: CqcProgressStep | null
cqcLog: CqcLogEntry[]
cqcUser: string
cqcSubView: CqcSubView
```

- [ ] Add all fields above to `AppState`

---

### Layer 3 — AppAction Variants

Add to the `AppAction` union in `src/context/types.ts`:

```typescript
| { type: 'SET_CQC_CLIENTS'; clients: CqcClient[] }
| { type: 'SET_CQC_SELECTED_CLIENT'; id: string | null }
| { type: 'SET_CQC_CHECK_RESULT'; result: CqcCheckResult | null }
| { type: 'SET_CQC_CHECK_RUNNING'; running: boolean }
| { type: 'SET_CQC_PROGRESS_STEP'; step: CqcProgressStep | null }
| { type: 'SET_CQC_LOG'; entries: CqcLogEntry[] }
| { type: 'SET_CQC_USER'; user: string }
| { type: 'SET_CQC_SUB_VIEW'; view: CqcSubView }
| { type: 'ADD_CQC_LOG_ENTRY'; entry: CqcLogEntry }
```

- [ ] Add all action variants above

---

### Layer 4 — Initial State

In `src/context/reducer.ts` (or wherever `initialState` lives), add:

```typescript
cqcClients: [],
cqcSelectedClientId: null,
cqcActiveCheck: null,
cqcCheckRunning: false,
cqcProgressStep: null,
cqcLog: [],
cqcUser: '',
cqcSubView: 'check',
```

- [ ] Add initial values to `initialState`

---

### Layer 5 — Reducer Cases

Add cases to the switch statement in `src/context/reducer.ts`:

```typescript
case 'SET_CQC_CLIENTS':
  return { ...state, cqcClients: action.clients }
case 'SET_CQC_SELECTED_CLIENT':
  return { ...state, cqcSelectedClientId: action.id }
case 'SET_CQC_CHECK_RESULT':
  return { ...state, cqcActiveCheck: action.result }
case 'SET_CQC_CHECK_RUNNING':
  return { ...state, cqcCheckRunning: action.running }
case 'SET_CQC_PROGRESS_STEP':
  return { ...state, cqcProgressStep: action.step }
case 'SET_CQC_LOG':
  return { ...state, cqcLog: action.entries }
case 'SET_CQC_USER':
  return { ...state, cqcUser: action.user }
case 'SET_CQC_SUB_VIEW':
  return { ...state, cqcSubView: action.view }
case 'ADD_CQC_LOG_ENTRY':
  return { ...state, cqcLog: [action.entry, ...state.cqcLog] }
```

- [ ] Add all reducer cases above

---

### Layer 6 — Event Listeners

Add to `src/lib/events.ts`:

```typescript
export function onCqcProgress(
  cb: (payload: { step: CqcProgressStep }) => void
): UnlistenFn {
  return listen('cqc:progress', (e) => cb(e.payload as { step: CqcProgressStep }))
}
```

- [ ] Add `onCqcProgress` listener

---

### Layer 7 — Wire Event in App.tsx

In `AppInner` `useEffect` (alongside existing engine event subscriptions):

- [ ] Subscribe to `onCqcProgress` → dispatch `SET_CQC_PROGRESS_STEP`
- [ ] Unsubscribe on cleanup

---

## Acceptance Criteria
- [ ] TypeScript compiles with no errors after all type additions
- [ ] `state.cqcClients`, `state.cqcCheckRunning`, and other CQC fields accessible in components
- [ ] All reducer cases exercisable via dispatch (manual test in DevTools)
- [ ] `onCqcProgress` receives events during a text check run and updates `state.cqcProgressStep`

---

## Technical Notes
- Import `CqcProgressStep` in `events.ts` from `../types/index` — avoid duplicating the union.
- Do NOT add any UI in this task. All work here is pure types + state plumbing.
- Keep `cqcUser` as a plain string (the team member's name typed each session) until a login system exists.

---

## Files to Create
```
CREATE:
(none)
```

## Files to Modify
```
MODIFY:
src/types/index.ts          ← CqcClient, CqcIssue, CqcCheckResult, CqcLogEntry, CqcProgressStep, CqcSubView
src/context/types.ts        ← AppState CQC fields + AppAction CQC variants
src/context/reducer.ts      ← initialState defaults + reducer cases
src/lib/events.ts           ← onCqcProgress listener
src/App.tsx                 ← wire onCqcProgress in useEffect
```

---

## Dependencies
- **Blocked by:** TASK-027 (Tauri IPC Commands)
- **Blocks:** TASK-029, TASK-030, TASK-031, TASK-032, TASK-033

---

## Claude Code Context
```
harness/claude.md
harness/tasks/Phase 11 — Content Quality Checker/TASK-028 — Content Quality Checker · Frontend Types, State & Events.md
harness/content-review-prd.md
src/types/index.ts
src/context/types.ts
src/context/reducer.ts
src/lib/events.ts
src/App.tsx
```

---

## Progress Log
| Date | Update |
|------|--------|
| 2026-05-11 | Task created — CQC Phase 11 frontend types & state foundation |

---

## Time Log
| Date | Hours | Note |
|------|-------|------|
| — | — | — |

---

## Review Notes
- **—**

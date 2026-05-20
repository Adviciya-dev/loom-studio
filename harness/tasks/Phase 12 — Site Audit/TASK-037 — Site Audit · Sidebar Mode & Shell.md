# TASK-037: Site Audit · Sidebar Mode & Shell

## Meta
| Field | Value |
|-------|-------|
| **Assignee** | — |
| **Status** | 🔲 To Do |
| **Priority** | P1 |
| **Sprint** | Sprint 9 |
| **Story Points** | 4 |
| **PRD Reference** | harness/site-audit-prd.md §9.1 §9.2 §10.10 |
| **Architecture Ref** | harness/site-audit-prd.md §10.1 |
| **Start Date** | — |
| **Due Date** | — |
| **Created** | 2026-05-17 |
| **Completed** | — |

---

## Description

Add the **Site Audit** mode to the Loom Studio sidebar and wire up the top-level `SiteAudit.tsx` shell component. This task is the integration point that makes the new mode reachable from the UI. No audit logic runs here — this is purely structural: routing, layout, and the `+ New Audit` entry point.

After this task the user can switch to the audit mode in the sidebar, see an empty session list on the left, and see the intake form placeholder on the right. TASK-038 and TASK-039 build those actual panels.

---

## Sub Tasks

### Layer 1 — Add `'audit'` to the app mode type

The existing `AppMode` type (in `src/types/index.ts` or `src/context/types.ts`) must include `'audit'`:

```typescript
// Existing modes + new entry:
export type AppMode = 'run' | 'harness' | 'qa' | 'github' | 'cqc' | 'audit'
```

- [ ] Add `'audit'` to the `AppMode` union type (find the existing union and append — do not create a duplicate type)

---

### Layer 2 — Sidebar entry in `src/components/Sidebar/Sidebar.tsx`

Follow the existing pattern for sidebar mode entries. Add **Site Audit** below the Content Quality Checker (`'cqc'`) entry.

```typescript
// Sidebar item definition (follow existing shape exactly):
{
  mode: 'audit',
  label: 'Site Audit',
  icon: <IconSearch size={18} />,   // or whichever icon library is already in use
}
```

Rules:
- Use the same icon library and size already used by adjacent items
- `Site Audit` appears below `Content Quality Checker` and above any footer items
- Active state styling follows the existing `activeMode === item.mode` pattern — no new CSS class

- [ ] Add sidebar item for `'audit'` mode in `Sidebar.tsx`

---

### Layer 3 — Top-level shell `src/components/SiteAudit/SiteAudit.tsx`

Create the shell component and its CSS module. The shell owns:
- The two-panel layout (left 320 px, right flex)
- Routing between the four phase panels in the right panel
- Loading sessions on mount and dispatching `AUDIT_SESSIONS_LOADED`
- The `+ New Audit` button (disabled when no active project)
- Triggering the duplicate-session dialog (see §5.5 of the PRD)

```
src/components/SiteAudit/
  SiteAudit.tsx
  SiteAudit.module.css
  SessionList.tsx           ← TASK-038 (render placeholder for now)
  SessionList.module.css    ← TASK-038
  IntakeForm.tsx            ← TASK-039 (render placeholder for now)
  IntakeForm.module.css     ← TASK-039
  AuditProgress.tsx         ← future task (render null for now)
  ReportViewer.tsx          ← future task (render null for now)
  GoalPlanner.tsx           ← future task (render null for now)
```

**`SiteAudit.tsx` responsibilities (this task only):**

```typescript
// Pseudo-structure:
export function SiteAudit() {
  const { state, dispatch } = useAppContext()
  const { activeProject, auditSessions, activeAuditSession, auditPhase } = state

  // Load sessions when this mode mounts
  useEffect(() => {
    if (!activeProject) return
    auditListSessions(activeProject.path).then(sessions => {
      dispatch({ type: 'AUDIT_SESSIONS_LOADED', payload: sessions })
    })
  }, [activeProject])

  // New audit button handler
  function handleNewAudit() {
    if (!activeProject) return
    // Check for duplicate siteUrl — if sessions exist, handled by child
    const sessionId = crypto.randomUUID()
    const newSession: AuditSession = { id: sessionId, ... }
    dispatch({ type: 'AUDIT_SESSION_CREATED', payload: newSession })
  }

  // Right panel phase router
  function renderRightPanel() {
    switch (auditPhase) {
      case 'intake': return <IntakeForm />
      case 'running': return null  // Phase 2 — future task
      case 'report': return null   // Phase 3 — future task
      case 'goals': return null    // Phase 4 — future task
      case 'cancelled': return null
      case 'complete': return null
      default: return <IntakeForm />
    }
  }

  return (
    <div className={styles.shell}>
      <div className={styles.leftPanel}>
        <button
          className={styles.newAuditBtn}
          onClick={handleNewAudit}
          disabled={!activeProject}
          title={!activeProject ? 'Open a project first' : undefined}
        >
          + New Audit
        </button>
        <SessionList />
      </div>
      <div className={styles.rightPanel}>
        {renderRightPanel()}
      </div>
    </div>
  )
}
```

- [ ] Create `SiteAudit.tsx` with two-panel layout, session load on mount, `+ New Audit` button
- [ ] `+ New Audit` is disabled when `!activeProject`
- [ ] Phase router in the right panel (placeholder `null` for phases 2–4 is fine)

---

### Layer 4 — CSS layout in `SiteAudit.module.css`

```css
.shell {
  display: flex;
  height: 100%;
  overflow: hidden;
}

.leftPanel {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-color);
  overflow-y: auto;
}

.newAuditBtn {
  /* Follow the button pattern from other panels (e.g. HarnessManager) */
  margin: 12px;
  flex-shrink: 0;
}

.rightPanel {
  flex: 1;
  overflow-y: auto;
}
```

Match the exact CSS variable names already used elsewhere in the project (check `src/components/HarnessManager/` for reference).

- [ ] Create `SiteAudit.module.css` with the layout above, using existing CSS variables

---

### Layer 5 — Register in `src/App.tsx`

Add the `SiteAudit` component to the `appMode` render switch in `App.tsx`:

```typescript
import { SiteAudit } from './components/SiteAudit/SiteAudit'

// Inside the mode switch:
case 'audit':
  return <SiteAudit />
```

- [ ] Import `SiteAudit` in `App.tsx`
- [ ] Add `case 'audit'` to the existing mode switch / conditional render

---

### Layer 6 — Placeholder child components

Create minimal placeholder files so `SiteAudit.tsx` can import them without errors. TASK-038 and TASK-039 will fill them in.

```typescript
// src/components/SiteAudit/SessionList.tsx
export function SessionList() {
  return <div>Session list placeholder</div>
}

// src/components/SiteAudit/IntakeForm.tsx
export function IntakeForm() {
  return <div>Intake form placeholder</div>
}
```

- [ ] Create `SessionList.tsx` with a placeholder `<div>`
- [ ] Create `IntakeForm.tsx` with a placeholder `<div>`

---

## Acceptance Criteria

- [ ] **Site Audit** appears in the sidebar below Content Quality Checker
- [ ] Clicking **Site Audit** in the sidebar switches `appMode` to `'audit'` and renders `SiteAudit.tsx`
- [ ] The shell renders a left panel (320 px) and a flex right panel with no overlap or overflow
- [ ] `+ New Audit` button is visible and disabled when no project is active, with tooltip "Open a project first"
- [ ] `+ New Audit` button is enabled when a project is active
- [ ] Sessions are loaded from disk on mount (via `auditListSessions`) and dispatched as `AUDIT_SESSIONS_LOADED`
- [ ] The right panel renders `IntakeForm` placeholder when `auditPhase === 'intake'`
- [ ] `pnpm build` produces no TypeScript or CSS errors

---

## Technical Notes

- Create `SiteAudit.tsx` within the 200-line component size limit. If the phase router grows large, extract a `useAuditPhasePanel()` hook.
- The `+ New Audit` session ID must be generated client-side: `crypto.randomUUID()` (no server round-trip). This matches the PRD §5.3 spec.
- The duplicate session check (§5.5) involves comparing `siteUrl` values. Implement this check in `handleNewAudit` once `IntakeForm` is wired up in TASK-039. For now just generate the session ID and dispatch.
- Do not implement actual session creation disk-write here — that happens when IntakeForm calls `auditSaveIntake` in TASK-039.

---

## Files to Create

```
CREATE:
src/components/SiteAudit/SiteAudit.tsx
src/components/SiteAudit/SiteAudit.module.css
src/components/SiteAudit/SessionList.tsx          (placeholder)
src/components/SiteAudit/SessionList.module.css   (empty)
src/components/SiteAudit/IntakeForm.tsx           (placeholder)
src/components/SiteAudit/IntakeForm.module.css    (empty)
src/components/SiteAudit/AuditProgress.tsx        (placeholder: export function AuditProgress() { return null })
src/components/SiteAudit/ReportViewer.tsx         (placeholder: export function ReportViewer() { return null })
src/components/SiteAudit/GoalPlanner.tsx          (placeholder: export function GoalPlanner() { return null })
```

## Files to Modify

```
MODIFY:
src/types/index.ts          ← add 'audit' to AppMode
src/components/Sidebar/Sidebar.tsx  ← add 'audit' sidebar item
src/App.tsx                 ← import SiteAudit + add case 'audit'
```

---

## Dependencies

- **Blocked by:** TASK-034 (AppMode type, AuditSession type, dispatch actions)
- **Blocked by:** TASK-035 (auditListSessions wrapper function)
- **Blocks:** TASK-038 (SessionList fills in left panel), TASK-039 (IntakeForm fills in right panel)

---

## Claude Code Context

```
harness/claude.md
harness/tasks/Phase 12 — Site Audit/TASK-037 — Site Audit · Sidebar Mode & Shell.md
harness/site-audit-prd.md
src/App.tsx
src/types/index.ts
src/context/types.ts
src/context/reducer.ts
src/components/Sidebar/Sidebar.tsx
src/components/HarnessManager/FileExplorer.tsx
src/components/ContentQualityChecker/
src/lib/events.ts
```

---

## Progress Log

| Date | Update |
|------|--------|
| 2026-05-17 | Task created — Phase 12 Site Audit sidebar + shell |

---

## Time Log

| Date | Hours | Note |
|------|-------|------|
| — | — | — |

---

## Review Notes

- **—**

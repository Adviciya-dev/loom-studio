# TASK-038: Site Audit · Session List Panel

## Meta
| Field | Value |
|-------|-------|
| **Assignee** | — |
| **Status** | 🔲 To Do |
| **Priority** | P1 |
| **Sprint** | Sprint 9 |
| **Story Points** | 4 |
| **PRD Reference** | harness/site-audit-prd.md §5.4 §5.5 §5.6 |
| **Architecture Ref** | harness/site-audit-prd.md §9.2 §10.10 |
| **Start Date** | — |
| **Due Date** | — |
| **Created** | 2026-05-17 |
| **Completed** | — |

---

## Description

Implement the `SessionList.tsx` component that lives in the left panel of the Site Audit mode. It displays all saved audit sessions for the active project as card rows, supports switching between sessions, and shows an empty state when no audits exist.

This component replaces the placeholder created in TASK-037. It is purely a display/navigation component — no audit logic runs here.

---

## Sub Tasks

### Layer 1 — Session card layout

Each session in `auditSessions` renders as a card. The card shows:

| Element | Content | Style |
|---------|---------|-------|
| Site name | `session.siteName` | Bold, 14 px |
| Site URL | `session.siteUrl` | Muted text, 12 px, truncate with ellipsis |
| Phase badge | See badge table below | Inline chip with colour |
| Relative date | "3 days ago" / "Today" / "2 weeks ago" | Muted, 11 px |

**Phase badge colours** (use existing CSS variable naming from the project):

| `phase` value | Badge label | Colour |
|--------------|-------------|--------|
| `intake` | Intake | Neutral / default |
| `running` | Running | Amber / warning |
| `cancelled` | Cancelled | Red / error muted |
| `report` | Report | Blue / info |
| `goals` | Goals | Purple / accent |
| `complete` | Complete | Green / success |

Active session: highlight the card with the existing accent left-border pattern (check `HarnessManager` or similar component for the convention).

Hover: no additional action buttons — the entire card is clickable.

```typescript
// SessionCard props:
interface SessionCardProps {
  session: AuditSession
  isActive: boolean
  onClick: () => void
}
```

- [ ] Implement `SessionCard` (can be inside `SessionList.tsx` or a separate file if approaching line limit)
- [ ] Phase badge renders with correct label and colour class per the table above
- [ ] Relative date uses a simple helper: compare `session.createdAt` to `Date.now()` — no external date library

---

### Layer 2 — Session list render

`SessionList.tsx` reads from `state.auditSessions` and renders:

```typescript
export function SessionList() {
  const { state, dispatch } = useAppContext()
  const { auditSessions, activeAuditSession } = state

  function handleSessionClick(session: AuditSession) {
    dispatch({ type: 'AUDIT_ACTIVE_SESSION_SET', payload: session })
  }

  if (auditSessions.length === 0) {
    return <EmptyState />   // see Layer 3
  }

  return (
    <div className={styles.list}>
      {auditSessions.map(s => (
        <SessionCard
          key={s.id}
          session={s}
          isActive={activeAuditSession?.id === s.id}
          onClick={() => handleSessionClick(s)}
        />
      ))}
    </div>
  )
}
```

- [ ] List renders from `state.auditSessions`
- [ ] Sessions are already sorted newest-first by the time they reach this component (sorted by TASK-035/TASK-036 before dispatch)
- [ ] Clicking a card dispatches `AUDIT_ACTIVE_SESSION_SET`
- [ ] Active card uses accent border styling

---

### Layer 3 — Empty state

When `auditSessions.length === 0`, render an empty state instead of the list:

```
┌──────────────────────────┐
│                          │
│   [icon or illustration] │
│                          │
│   No audits yet          │
│                          │
│   Start your first       │
│   site audit →           │
│   [Start new audit btn]  │
│                          │
└──────────────────────────┘
```

The "Start new audit" button in the empty state triggers the same `handleNewAudit` logic as the `+ New Audit` button in the shell. Pass an `onNewAudit` prop from `SessionList` to `EmptyState`, or lift the handler to `SiteAudit.tsx` and pass it down.

```typescript
interface EmptyStateProps {
  onNewAudit: () => void
  disabled: boolean   // true when no project is active
}
```

- [ ] Empty state renders when `auditSessions.length === 0`
- [ ] "Start new audit" button in empty state respects the `disabled` / no-active-project constraint
- [ ] Empty state uses existing illustration or icon — do not add new image assets; a simple SVG icon or emoji placeholder is acceptable

---

### Layer 4 — Relative date helper

Add a simple, self-contained helper in `SessionList.tsx` (or in `src/lib/dateUtils.ts` if one already exists):

```typescript
function relativeDate(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  const diffWeeks = Math.floor(diffDays / 7)
  if (diffWeeks === 1) return '1 week ago'
  if (diffWeeks < 5) return `${diffWeeks} weeks ago`
  const diffMonths = Math.floor(diffDays / 30)
  return diffMonths === 1 ? '1 month ago' : `${diffMonths} months ago`
}
```

- [ ] `relativeDate` helper is implemented and used in the session card

---

### Layer 5 — CSS in `SessionList.module.css`

```css
.list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  overflow-y: auto;
}

.card {
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background-color 0.1s;
}

.card:hover {
  background-color: var(--hover-bg);
}

.cardActive {
  border-left: 3px solid var(--accent-color);
  background-color: var(--active-bg);
}

.siteName {
  font-weight: 600;
  font-size: 14px;
}

.siteUrl {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 260px;
}

.meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 4px;
}

.badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}

/* Per-phase badge colours — adapt to existing CSS variable names */
.badgeIntake    { background-color: var(--badge-neutral-bg); color: var(--badge-neutral-fg); }
.badgeRunning   { background-color: var(--badge-warning-bg); color: var(--badge-warning-fg); }
.badgeCancelled { background-color: var(--badge-error-bg);   color: var(--badge-error-fg); }
.badgeReport    { background-color: var(--badge-info-bg);    color: var(--badge-info-fg); }
.badgeGoals     { background-color: var(--badge-accent-bg);  color: var(--badge-accent-fg); }
.badgeComplete  { background-color: var(--badge-success-bg); color: var(--badge-success-fg); }

.relDate {
  font-size: 11px;
  color: var(--text-muted);
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 20px;
  text-align: center;
  color: var(--text-muted);
}
```

Use the actual CSS variable names from the project. If a specific variable (e.g. `--badge-success-bg`) does not exist, pick the closest equivalent from the existing design tokens.

- [ ] Create `SessionList.module.css` matching the structure above

---

## Acceptance Criteria

- [ ] Sessions from `state.auditSessions` render as cards in the left panel
- [ ] Each card shows: site name (bold), site URL (truncated), phase badge (correct label + colour), relative date
- [ ] Active session card has an accent left-border highlight
- [ ] Clicking a non-active card dispatches `AUDIT_ACTIVE_SESSION_SET` with the correct session
- [ ] Empty state displays when `auditSessions.length === 0`
- [ ] "Start new audit" button in empty state fires the same new-audit handler as the shell button
- [ ] "Start new audit" in empty state is disabled when no project is active
- [ ] `Complete` phase badge uses green/success colour
- [ ] `Cancelled` phase badge uses error/muted colour
- [ ] `Running` phase badge uses amber/warning colour
- [ ] `pnpm build` produces no TypeScript or CSS module errors

---

## Technical Notes

- Session list is read-only in this component — no writes. Sorting is already done upstream (TASK-035 sorts by `createdAt` descending before dispatch).
- Keep `SessionList.tsx` under 200 lines. Extract `SessionCard` and `EmptyState` into the same file as internal components, or into separate files inside `SiteAudit/` if needed.
- No `useEffect` is needed here — sessions are already in `state.auditSessions` from the parent shell's mount effect.
- Badge colour CSS classes use a map pattern to avoid a long conditional chain:
  ```typescript
  const badgeClass: Record<AuditPhase, string> = {
    intake: styles.badgeIntake,
    running: styles.badgeRunning,
    cancelled: styles.badgeCancelled,
    report: styles.badgeReport,
    goals: styles.badgeGoals,
    complete: styles.badgeComplete,
  }
  ```

---

## Files to Create / Replace

```
REPLACE (placeholder from TASK-037):
src/components/SiteAudit/SessionList.tsx
src/components/SiteAudit/SessionList.module.css
```

---

## Dependencies

- **Blocked by:** TASK-034 (AuditSession type, AppAction types)
- **Blocked by:** TASK-037 (shell placeholder must exist before replacement)
- **Does NOT block:** TASK-039 — IntakeForm and SessionList can be built in parallel

---

## Claude Code Context

```
harness/claude.md
harness/tasks/Phase 12 — Site Audit/TASK-038 — Site Audit · Session List Panel.md
harness/site-audit-prd.md
src/components/SiteAudit/SiteAudit.tsx
src/types/index.ts
src/context/types.ts
src/context/reducer.ts
src/components/HarnessManager/FileExplorer.tsx
```

---

## Progress Log

| Date | Update |
|------|--------|
| 2026-05-17 | Task created — Phase 12 Site Audit session list panel |

---

## Time Log

| Date | Hours | Note |
|------|-------|------|
| — | — | — |

---

## Review Notes

- **—**

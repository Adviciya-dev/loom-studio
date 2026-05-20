# TASK-033: Content Quality Checker · Log Panel & Audit History

## Meta
| Field | Value |
|-------|-------|
| **Assignee** | — |
| **Status** | ✅ Done |
| **Priority** | P2 |
| **Sprint** | Sprint 9 |
| **Story Points** | 8 |
| **PRD Reference** | harness/content-review-prd.md |
| **Architecture Ref** | architecture.md |
| **Start Date** | — |
| **Due Date** | — |
| **Created** | 2026-05-11 |
| **Completed** | — |

---

## Description

Implement the **Log** sub-panel — an audit history of every quality check run. Team leads can filter by client or team member, see aggregate stats, and drill into a past check result to review the original issues.

This panel is read-only. It does not trigger new checks.

---

## Sub Tasks

### Layer 1 — Load Log on Panel Mount

In `LogPanel.tsx`:

- [ ] On mount (and whenever the panel is shown), call `invoke('cqc_list_log', { path: activeProject.path, limit: 100 })`
- [ ] Dispatch `SET_CQC_LOG` with the result
- [ ] Show loading spinner while fetching; show "No checks logged yet" empty state if array is empty

---

### Layer 2 — Stats Cards

At the top of the panel, show summary stats computed from `state.cqcLog`:

```
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│  Total   │  │ Approved │  │  Issues  │  │  Pass %  │
│    42    │  │    35    │  │   187    │  │   83%    │
└──────────┘  └──────────┘  └──────────┘  └──────────┘
```

- [ ] Total checks: `cqcLog.length`
- [ ] Approved: `cqcLog.filter(e => e.approved).length`
- [ ] Total issues: `sum(cqcLog.map(e => e.issue_count))`
- [ ] Pass rate: `(approved / total * 100).toFixed(0)%` — show `—` if total is 0
- [ ] Stats update automatically when the log array changes (derived, no separate state)

---

### Layer 3 — Filter Bar

```
  Client: [All ▾]    User: [All ▾]    [Search content preview...]
```

- [ ] Client filter: `<select>` with "All" + one option per unique `client_id` in the log (resolve to client name from `state.cqcClients`)
- [ ] User filter: `<select>` with "All" + one option per unique `user` value in the log
- [ ] Search input: filters `content_preview` substring (case-insensitive)
- [ ] All filters are local state (no IPC call on filter change — filter the already-loaded `state.cqcLog` in memory)

---

### Layer 4 — Log Entry Table

```
┌────────────────────────────────────────────────────────────────┐
│ Date/Time          │ Client      │ User   │ Issues │ Status    │
├────────────────────────────────────────────────────────────────┤
│ 2026-05-11 14:32  │ Acme Corp   │ Akshay │  3     │ ✗ Review  │
│ 2026-05-11 13:10  │ Beta Brand  │ Sara   │  0     │ ✓ Approved│
│ 2026-05-10 17:45  │ Acme Corp   │ Akshay │  1     │ ✗ Review  │
└────────────────────────────────────────────────────────────────┘
```

- [ ] Sorted by `created_at` descending (newest first)
- [ ] `created_at` formatted as `YYYY-MM-DD HH:mm` local time
- [ ] Client name resolved from `state.cqcClients` by `client_id` (fall back to raw ID if not found)
- [ ] Status badge: green `✓ Approved` or red `✗ Review`
- [ ] Clicking a row expands an inline detail view (see Layer 5)
- [ ] Only one row expanded at a time

---

### Layer 5 — Expanded Row Detail

When a log entry row is clicked, expand it inline (below the row) to show:

```
  Content preview:
  "Check out our amazing AcmeCorp deals this weekend! #AcmeDeals #Sale"

  Issues (3):
  [BRAND · HIGH] "acme corp" — Brand name spelled incorrectly
  [SPELLING · MEDIUM] "recieve" — Common spelling error
  [FACT · LOW] "this weekend" — Event date not confirmed in key facts

  Summary: "One high-severity brand name error found."
```

- [ ] Content preview text (full `content_preview` field)
- [ ] Issues parsed from `issues_json` (JSON.parse into `CqcIssue[]`)
- [ ] Each issue shown as: `[TYPE · SEVERITY] "snippet" — explanation`
- [ ] Summary text
- [ ] `[Close ↑]` button to collapse the row

---

### Layer 6 — CSS

Create `src/components/ContentQualityChecker/LogPanel.module.css`:

- [ ] `.panel` — full height flex column
- [ ] `.statsRow` — horizontal flex row of 4 stat cards
- [ ] `.statCard` — card with large number + label
- [ ] `.filters` — filter bar row
- [ ] `.table` — full-width table, sticky header
- [ ] `.row` — table data row, clickable
- [ ] `.rowExpanded` — row with visible expanded detail below
- [ ] `.detail` — expanded detail area, muted background
- [ ] `.issueItem` — single issue line in detail
- [ ] `.approved` — green status badge
- [ ] `.needsReview` — red status badge

---

## Acceptance Criteria
- [ ] Log loads from engine on panel mount; entries displayed in table sorted newest-first
- [ ] Stats cards show correct totals derived from the log array
- [ ] Client filter narrows the table to entries for that client only
- [ ] User filter narrows the table to entries by that user only
- [ ] Search filters by `content_preview` substring (case-insensitive)
- [ ] Clicking a row expands the detail; clicking again (or `[Close ↑]`) collapses it
- [ ] Only one row expanded at a time — clicking a second row collapses the first
- [ ] Issues in detail view parsed correctly from `issues_json`
- [ ] Empty state shown when no log entries exist
- [ ] No TypeScript errors; component under 200 lines (extract detail row to `LogEntryDetail.tsx` if needed)

---

## Technical Notes
- `issues_json` is a raw JSON string stored in the DB. Use `JSON.parse(entry.issues_json) as CqcIssue[]` — wrap in try/catch and default to `[]` on parse error.
- Do NOT re-fetch from engine when filters change — filter the in-memory `state.cqcLog` array.
- Client name resolution: if `state.cqcClients` doesn't contain a matching client (e.g. deleted), show the raw `client_id` in italic.

---

## Files to Create
```
CREATE:
src/components/ContentQualityChecker/LogPanel.tsx
src/components/ContentQualityChecker/LogPanel.module.css
src/components/ContentQualityChecker/LogEntryDetail.tsx   (if needed to stay under 200 lines)
```

## Files to Modify
```
MODIFY:
src/components/ContentQualityChecker/ContentQualityChecker.tsx  ← replace Log stub with <LogPanel />
```

---

## Dependencies
- **Blocked by:** TASK-029 (Sidebar Mode & Shell), TASK-028 (Frontend Types — provides cqcLog state)
- **Blocks:** —

---

## Claude Code Context
```
harness/claude.md
harness/tasks/Phase 11 — Content Quality Checker/TASK-033 — Content Quality Checker · Log Panel & Audit History.md
harness/content-review-prd.md
src/components/ContentQualityChecker/ContentQualityChecker.tsx
src/context/types.ts
src/types/index.ts
src-tauri/src/commands.rs   ← cqc_list_log invoke signature
```

---

## Progress Log
| Date | Update |
|------|--------|
| 2026-05-11 | Task created — CQC Phase 11 Log panel & audit history |

---

## Time Log
| Date | Hours | Note |
|------|-------|------|
| — | — | — |

---

## Review Notes
- **—**

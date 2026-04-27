# TASK-014: Diff Interception · Diff Overlay UI

## Meta
| Field | Value |
|-------|-------|
| **Assignee** | — |
| **Status** | ✅ Done |
| **Priority** | P0 |
| **Sprint** | Sprint 3 |
| **Story Points** | 8 |
| **PRD Reference** | prd.md §6.5, §7 |
| **Architecture Ref** | architecture.md §3.2 |
| **Start Date** | — |
| **Due Date** | — |
| **Created** | 2026-04-20 |
| **Completed** | 2026-04-21 |

---

## Description
Build the `<DiffOverlay>` component — the core UI of Loom. It renders when a `diff_ready` event is received and displays the proposed code changes before anything is written to disk. The overlay has a file list panel on the left and a diff code view on the right, with Split/Unified toggle and Approve/Reject actions at the bottom.

---

## Sub Tasks
- [x] Add `pendingDiff` field to `AppContext` state; `SET_PENDING_DIFF` and `CLEAR_PENDING_DIFF` actions
- [x] Listen for `diff_ready` Tauri event → dispatch `SET_PENDING_DIFF` → overlay opens automatically
- [x] Build `<DiffOverlay>` modal: full-screen overlay with close (×) disabled — user must Approve or Reject
- [x] Build file list panel (left): one row per `DiffFile`, shows filename, `+N` added (green), `-N` removed (red); clicking a row switches the diff view
- [x] Build diff code panel (right): renders `DiffLine[]` for the selected file
  - [x] Added lines: green left border + green background tint
  - [x] Removed lines: red left border + red background tint, text decoration line-through
  - [x] Context lines: default styling
  - [x] Line numbers shown on left edge
- [x] Implement Split View: side-by-side before/after columns
- [x] Implement Unified View: single column inline diff (default)
- [x] Toggle button: [Split View] / [Unified View] in overlay header
- [x] Build diff footer: "Apply changes to {filename}" label, build status badge (placeholder `Build ✓` for MVP), Reject button, Apply Changes button
- [x] First file in list is selected by default when overlay opens

---

## Acceptance Criteria
- [x] Overlay opens automatically when `diff_ready` event is received
- [x] File list shows all modified files with correct added/removed counts
- [x] Clicking a file in the list updates the diff code view
- [x] Added lines render with green background, removed lines with red background and strikethrough
- [x] Line numbers are shown for every line in the diff view
- [x] Split View and Unified View toggle works correctly
- [x] Overlay cannot be dismissed with keyboard or outside click — only Approve or Reject
- [x] Apply Changes and Reject buttons are visible in the footer
- [x] First file is selected and displayed when overlay opens
- [x] No `any` types in the component or its props

---

## Technical Notes
- The overlay is NOT a `<dialog>` element — render it as a fixed full-screen div with the highest z-index. This prevents accidental dismissal.
- Diff lines can be numerous — do not virtualize in this task; add virtualization in TASK-018 if needed.
- Split view: build/remove lines from before and after, align by hunk. Context lines appear in both columns.
- Monospace font for all diff line content — same font token as `<LogPanel>`.

---

## Files to Create/Modify
```
CREATE:
src/components/DiffOverlay/DiffOverlay.tsx
src/components/DiffOverlay/DiffOverlay.module.css
src/components/DiffOverlay/FileList.tsx
src/components/DiffOverlay/FileList.module.css
src/components/DiffOverlay/DiffCodeView.tsx
src/components/DiffOverlay/DiffCodeView.module.css
src/components/DiffOverlay/DiffFooter.tsx
src/components/DiffOverlay/DiffFooter.module.css

MODIFY:
src/context/AppContext.tsx
src/context/reducer.ts
src/context/types.ts
src/App.tsx
```

---

## API Endpoints
N/A — no API endpoints in this task

---

## UI Screens
- **Diff Overlay** — full-screen modal with file list, diff code view, view toggle, and approve/reject footer
- **File List** — left panel with per-file change counts
- **Diff Code View** — right panel with colored inline or split diff
- **Diff Footer** — apply/reject actions and build status

---

## Related Test Cases
—

## Dependencies
- **Blocked by:** TASK-011, TASK-013
- **Blocks:** TASK-015

---

## Claude Code Context
```
harness/claude.md
harness/tasks/Phase 4 — Diff Interception/TASK-014 — Diff Interception · Diff Overlay UI.md
harness/architecture.md §3.2, §4.1
harness/prd.md §6.5, §7
```

---

## Progress Log
| Date | Update |
|------|--------|
| 2026-04-21 | Built FileList, DiffCodeView (unified + split with aligned rem/add pairing), DiffFooter, DiffOverlay shell; wired diff_ready + engine_status events in App.tsx; added onEngineStatus to events.ts; no any types; tsc clean. |

---

## Time Log
| Date | Hours | Note |
|------|-------|------|
| — | — | No time logged |

---

## Review Notes
- **—**

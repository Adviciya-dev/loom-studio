# TASK-029: Content Quality Checker · Sidebar Mode & Shell

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

Add the **Content Quality Checker** as the 5th sidebar mode. This task adds the sidebar icon, wires the `appMode === 'content'` route in `App.tsx`, and builds the `ContentQualityChecker` shell component with its three sub-view tabs: **Check**, **Clients**, and **Log**.

The shell renders the correct sub-panel based on `state.cqcSubView`. The actual panels (CheckPanel, ClientsPanel, LogPanel) are stubbed as empty placeholders in this task and implemented in TASK-030–033.

---

## Sub Tasks

### Layer 1 — Sidebar Icon

In `src/components/Sidebar/Sidebar.tsx`:

- [ ] Add a new mode button for `'content'` after the existing QA (`'qa'`) button
- [ ] Use the `CheckSquare` icon from `lucide-react` (or `ClipboardCheck` — whichever fits the visual language better)
- [ ] Tooltip: `"Content Quality Checker"`
- [ ] Active state styling follows the same pattern as the existing mode buttons

---

### Layer 2 — App.tsx Route

In `src/App.tsx`:

- [ ] Add `'content'` to the `AppMode` union type (if defined in `App.tsx` rather than `types.ts`)
- [ ] In the main content render block, add:
  ```tsx
  {appMode === 'content' && <ContentQualityChecker />}
  ```
- [ ] Import `ContentQualityChecker` from `../components/ContentQualityChecker/ContentQualityChecker`

---

### Layer 3 — TopBar Adjustments

In `src/components/TopBar/TopBar.tsx`:

- [ ] Hide `TaskTabs` and `RunControls` when `appMode === 'content'` (same condition as `appMode === 'harness'` and `appMode === 'qa'`)
- [ ] Verify the existing `isHarness`-style check covers the new mode — if it does, no change needed; just document it

---

### Layer 4 — ContentQualityChecker Shell

Create `src/components/ContentQualityChecker/ContentQualityChecker.tsx`:

```
┌─────────────────────────────────────────────┐
│  Content Quality Checker                    │
│  ─────────────────────────────────────────  │
│  [Check]  [Clients]  [Log]                  │
│  ─────────────────────────────────────────  │
│                                             │
│  <active sub-panel rendered here>           │
│                                             │
└─────────────────────────────────────────────┘
```

- [ ] Three tab buttons: "Check", "Clients", "Log"
- [ ] Clicking a tab dispatches `SET_CQC_SUB_VIEW` with the corresponding `CqcSubView` value
- [ ] Active tab has highlighted styling (match QATestSuite tab style)
- [ ] Renders placeholder `<div>` for each sub-view (panels implemented in later tasks):
  - `cqcSubView === 'check'` → `<CheckPanel />` (stub: `<div>Check panel coming soon</div>`)
  - `cqcSubView === 'clients'` → `<ClientsPanel />` (stub)
  - `cqcSubView === 'log'` → `<LogPanel />` (stub)
- [ ] Component max 120 lines — extract tab bar to a `CqcTabBar` sub-component if needed

Create `src/components/ContentQualityChecker/ContentQualityChecker.module.css`:

- [ ] `.container` — full height flex column, dark background matching harness panel style
- [ ] `.header` — title row, same typography as other panel headers
- [ ] `.tabBar` — horizontal row of tab buttons
- [ ] `.tab` — individual tab button, muted by default
- [ ] `.tabActive` — highlighted active tab (border-bottom accent or background chip)
- [ ] `.content` — flex-grow area that renders the active panel

---

## Acceptance Criteria
- [ ] Clicking the new sidebar icon switches `appMode` to `'content'`
- [ ] Other sidebar modes still work (no regression)
- [ ] TopBar hides TaskTabs and RunControls in `'content'` mode
- [ ] Three sub-view tabs visible; clicking each updates `state.cqcSubView`
- [ ] Active tab is visually distinguished
- [ ] Stub panels render without errors
- [ ] No TypeScript errors; component stays under 120 lines

---

## Technical Notes
- Do NOT implement CheckPanel, ClientsPanel, or LogPanel here — stubs only. Those panels are TASK-030 through TASK-033.
- CSS Modules only — no inline styles.
- Follow the `HarnessManager` and `GitHubPR` layout patterns as reference for the shell structure.

---

## Files to Create
```
CREATE:
src/components/ContentQualityChecker/ContentQualityChecker.tsx
src/components/ContentQualityChecker/ContentQualityChecker.module.css
```

## Files to Modify
```
MODIFY:
src/components/Sidebar/Sidebar.tsx   ← add 'content' mode button
src/App.tsx                          ← add 'content' route + import
src/components/TopBar/TopBar.tsx     ← hide task controls in 'content' mode
```

---

## Dependencies
- **Blocked by:** TASK-028 (Frontend Types, State & Events)
- **Blocks:** TASK-030, TASK-031, TASK-032, TASK-033

---

## Claude Code Context
```
harness/claude.md
harness/tasks/Phase 11 — Content Quality Checker/TASK-029 — Content Quality Checker · Sidebar Mode & Shell.md
harness/content-review-prd.md
src/App.tsx
src/components/Sidebar/Sidebar.tsx
src/components/TopBar/TopBar.tsx
src/components/HarnessManager/HarnessManager.tsx   ← layout reference
src/components/GitHubPR/GitHubPR.tsx               ← appMode routing reference
src/components/QATestSuite/QATestSuite.tsx          ← tab bar reference
src/context/types.ts
```

---

## Progress Log
| Date | Update |
|------|--------|
| 2026-05-11 | Task created — CQC Phase 11 sidebar mode & shell |

---

## Time Log
| Date | Hours | Note |
|------|-------|------|
| — | — | — |

---

## Review Notes
- **—**

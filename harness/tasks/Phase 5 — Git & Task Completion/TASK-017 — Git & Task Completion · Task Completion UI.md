# TASK-017: Git & Task Completion · Task Completion UI

## Meta
| Field | Value |
|-------|-------|
| **Assignee** | — |
| **Status** | ✅ Done |
| **Priority** | P1 |
| **Sprint** | Sprint 3 |
| **Story Points** | 3 |
| **PRD Reference** | prd.md §6.7, §7 |
| **Architecture Ref** | architecture.md §3.2, §4.1 |
| **Start Date** | — |
| **Due Date** | — |
| **Created** | 2026-04-20 |
| **Completed** | 2026-04-21 |

---

## Description
Implement task completion state in the React frontend. When the `task_complete` event is received, update the task status in the UI, mark all steps as done in the detail panel, persist the completion to the JSON store, and display a clear success state. The task tab must remain accessible for reference after completion.

---

## Sub Tasks
- [x] Add `COMPLETE_TASK` action to `AppContext` reducer — sets task `status` to `completed`, marks all steps `done: true`, stores commit hash
- [x] Listen for `task_complete` Tauri event → dispatch `COMPLETE_TASK` with task ID and commit hash
- [x] Update task tab: show `✓` checkmark icon on completed tab, retain tab (do not auto-close)
- [x] Update `<TaskDetailPanel>`: show "Completed" status badge, all step checkboxes checked
- [x] Show commit hash in detail panel footer: "Committed: `abc1234`" (monospace, copy-on-click)
- [x] Add success toast/banner: "Task complete — changes committed" shown for 4 seconds then auto-dismisses
- [x] Persist completed status to JSON store: `invoke('save_task_history', { taskId, status: 'completed', completedAt })` 
- [x] Run controls: disable Run button on completed task; show "Completed" label instead

---

## Acceptance Criteria
- [x] `task_complete` event triggers completed state in UI
- [x] Task tab shows `✓` checkmark; tab stays open
- [x] All steps in the detail panel show as checked
- [x] Status badge in detail panel changes to "Completed" (green)
- [x] Commit hash displayed in detail panel footer
- [x] Success toast appears and auto-dismisses after 4 seconds
- [x] Task completion persisted to JSON store — visible on app restart
- [x] Run button disabled on a completed task

---

## Technical Notes
- Toast component: build a simple `<Toast>` component with a 4-second auto-dismiss timeout using `setTimeout` + `clearTimeout` in a `useEffect`. No external toast library.
- Copy-on-click for commit hash: `navigator.clipboard.writeText(hash)` with a brief "Copied!" tooltip.

---

## Files to Create/Modify
```
CREATE:
src/components/Toast/Toast.tsx
src/components/Toast/Toast.module.css

MODIFY:
src/context/reducer.ts
src/context/types.ts
src/components/TopBar/TaskTabs.tsx
src/components/Workspace/TaskDetailPanel.tsx
src/components/TopBar/RunControls.tsx
src/App.tsx
```

---

## API Endpoints
N/A — no API endpoints in this task

---

## UI Screens
- **Task Tab** — checkmark on completed tab
- **Task Detail Panel** — completed status badge, all steps checked, commit hash footer
- **Toast** — 4-second success notification
- **Run Controls** — disabled state on completed task

---

## Related Test Cases
—

## Dependencies
- **Blocked by:** TASK-016
- **Blocks:** TASK-018

---

## Claude Code Context
```
harness/claude.md
harness/tasks/Phase 5 — Git & Task Completion/TASK-017 — Git & Task Completion · Task Completion UI.md
harness/architecture.md §3.2, §4.1
harness/prd.md §6.7, §7
```

---

## Progress Log
| Date | Update |
|------|--------|
| 2026-04-21 | Implemented all subtasks: Toast component, completed tab checkmark, commit hash footer with copy-on-click, Completed label in RunControls, save_task_history engine command |

---

## Time Log
| Date | Hours | Note |
|------|-------|------|
| — | — | No time logged |

---

## Review Notes
- **—**

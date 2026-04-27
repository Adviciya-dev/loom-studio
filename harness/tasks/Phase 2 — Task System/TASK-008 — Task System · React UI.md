# TASK-008: Task System · React UI

## Meta
| Field | Value |
|-------|-------|
| **Assignee** | akshay-ksd |
| **Status** | ✅ Done |
| **Priority** | P0 |
| **Sprint** | Sprint 2 |
| **Story Points** | 8 |
| **PRD Reference** | prd.md §5, §6.2, §7 |
| **Architecture Ref** | architecture.md §3.2 |
| **Start Date** | — |
| **Due Date** | — |
| **Created** | 2026-04-20 |
| **Completed** | 2026-04-20 |

---

## Description
Build the full task selection and display UI: `<TaskSelectModal>` for browsing and picking tasks, `<TaskTabs>` for managing open tasks in the top bar, and `<TaskDetailPanel>` for rendering the selected task's full detail. All data flows from `AppContext` — no component-level fetching.

---

## Sub Tasks
- [ ] Add `activeTasks`, `activeTaskIndex` to `AppContext` with `ADD_TASK`, `SET_ACTIVE_TASK`, `REMOVE_TASK` actions
- [ ] Build `<TaskSelectModal>` — reads tasks via `invoke('read_harness_tasks', path)`, renders list with ID, title, status badge, due date
- [ ] Add filter bar to `<TaskSelectModal>`: filter by status (`pending`, `in-progress`, `completed`)
- [ ] "Assign Task" button in modal: dispatches `ADD_TASK`, closes modal, switches to new tab
- [ ] Build `<TaskTabs>` in top bar: one tab per active task, close (×) button per tab, "+ Task" button to open modal
- [ ] Build `<TaskDetailPanel>` (left workspace panel): ID + breadcrumb, title, meta (type, status, due), description, step list with checkboxes
- [ ] Step checkboxes in detail panel are read-only (visual only — task state is source of truth in `.md` file)
- [ ] Handle empty state: no tasks open → show "Select a Task" placeholder in workspace
- [ ] Handle missing `harness/` folder: modal shows "No tasks found. Add a harness/ folder to your project."

---

## Acceptance Criteria
- [ ] "+ Task" button opens `<TaskSelectModal>`
- [ ] Modal lists all tasks from the active project's `harness/` folder
- [ ] Status filter works: only tasks matching the selected status are shown
- [ ] "Assign Task" adds the task as a tab and loads it in the detail panel
- [ ] Multiple tasks can be open simultaneously as tabs
- [ ] Clicking a tab switches the active task in the detail panel
- [ ] "×" on a tab closes that task
- [ ] `<TaskDetailPanel>` renders all task fields: ID, title, type, status, due, description, steps
- [ ] Step completion state displayed correctly (checked/unchecked)
- [ ] Empty state shown when no tasks are open
- [ ] No `any` types anywhere in the task UI components

---

## Technical Notes
- Status badge colors: `pending` → amber, `in-progress` → blue, `completed` → green.
- Task type icons: use simple text labels in MVP, no icon library dependency.
- Tab overflow: if more tabs than fit in the top bar, show a scroll arrow — do not truncate silently.

---

## Files to Create/Modify
```
CREATE:
src/components/TaskSelectModal/TaskSelectModal.tsx
src/components/TaskSelectModal/TaskSelectModal.module.css
src/components/TopBar/TaskTabs.tsx
src/components/TopBar/TaskTabs.module.css
src/components/Workspace/TaskDetailPanel.tsx
src/components/Workspace/TaskDetailPanel.module.css

MODIFY:
src/context/AppContext.tsx
src/context/reducer.ts
src/context/types.ts
src/components/TopBar/TopBar.tsx
src/components/Workspace/Workspace.tsx
```

---

## API Endpoints
N/A — no API endpoints in this task

---

## UI Screens
- **Task Select Modal** — searchable/filterable task list with Assign Task button
- **Task Tabs** — open task tabs in top bar with close button
- **Task Detail Panel** — full task metadata, description, and step list

---

## Related Test Cases
—

## Dependencies
- **Blocked by:** TASK-006, TASK-007
- **Blocks:** TASK-011

---

## Claude Code Context
```
harness/claude.md
harness/tasks/Phase 2 — Task System/TASK-008 — Task System · React UI.md
harness/architecture.md §3.2
harness/prd.md §5, §6.2, §7
```

---

## Progress Log
| Date | Update |
|------|--------|
| — | No updates yet |

---

## Time Log
| Date | Hours | Note |
|------|-------|------|
| — | — | No time logged |

---

## Review Notes
- **—**

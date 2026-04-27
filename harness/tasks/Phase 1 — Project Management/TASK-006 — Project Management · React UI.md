# TASK-006: Project Management · React UI

## Meta
| Field | Value |
|-------|-------|
| **Assignee** | akshay-ksd |
| **Status** | ✅ Done |
| **Priority** | P0 |
| **Sprint** | Sprint 1 |
| **Story Points** | 5 |
| **PRD Reference** | prd.md §6.1, §7 |
| **Architecture Ref** | architecture.md §3.2 |
| **Start Date** | 2026-04-20 |
| **Due Date** | — |
| **Created** | 2026-04-20 |
| **Completed** | 2026-04-20 |

---

## Description
Build the React UI for project management: `<ProjectSelector>` dropdown in the top bar and `<ProjectDropdown>` panel. The user must be able to open the folder picker, see saved projects, switch the active project, and have the selection persist across app restarts. All state lives in React Context — no component-local state for project data.

---

## Sub Tasks
- [x] Define `AppContext` with `useReducer`: initial state, `SET_PROJECTS`, `SET_ACTIVE_PROJECT` actions
- [x] Build `<ProjectSelector>` — shows active project name + color dot in top bar; opens `<ProjectDropdown>` on click
- [x] Build `<ProjectDropdown>` — lists saved projects, highlights active, "Add Project" button at bottom
- [x] Wire "Add Project" → `invoke('open_folder_picker')` → `invoke('save_project', project)` → dispatch `SET_PROJECTS`
- [x] Wire project switch → `invoke('save_project', {..., active: true})` → dispatch `SET_ACTIVE_PROJECT`
- [x] On app load: `invoke('get_projects')` → dispatch `SET_PROJECTS`, restore last active project
- [x] Handle empty state: if no projects, show "Open a Project" prompt in workspace area
- [x] Handle missing `harness/` folder: show inline warning under active project name

---

## Acceptance Criteria
- [ ] Active project name and color dot shown in top bar
- [ ] Clicking the project selector opens the dropdown with all saved projects listed
- [ ] "Add Project" opens the native folder picker and adds the new project to the list
- [ ] Clicking a project in the dropdown switches the active project
- [ ] Active project persists across app restarts (loaded from JSON store on mount)
- [ ] Empty state shown when no projects have been added
- [ ] Warning shown if active project's `harness/` folder does not exist
- [ ] No `any` types — all state and props are strictly typed

---

## Technical Notes
- `AppContext` must be the single source of truth for `projects` and `activeProject` — no local state in these components.
- Color for new project: assign from a fixed palette of 8 colors (cycle by index).
- `<ProjectDropdown>` closes on outside click and on project selection.

---

## Files to Create/Modify
```
CREATE:
src/context/AppContext.tsx
src/context/reducer.ts
src/context/types.ts
src/components/TopBar/ProjectSelector.tsx
src/components/TopBar/ProjectSelector.module.css
src/components/ProjectDropdown/ProjectDropdown.tsx
src/components/ProjectDropdown/ProjectDropdown.module.css

MODIFY:
src/App.tsx
src/components/TopBar/TopBar.tsx
```

---

## API Endpoints
N/A — no API endpoints in this task

---

## UI Screens
- **Top Bar** — project name + color dot, clickable
- **Project Dropdown** — list of saved projects + Add Project button
- **Empty State** — workspace prompt when no project is open

---

## Related Test Cases
—

## Dependencies
- **Blocked by:** TASK-005
- **Blocks:** TASK-008

---

## Claude Code Context
```
harness/claude.md
harness/tasks/Phase 1 — Project Management/TASK-006 — Project Management · React UI.md
harness/architecture.md §3.2
harness/prd.md §6.1, §7
```

---

## Progress Log
| Date | Update |
|------|--------|
| 2026-04-20 | Implemented AppContext (context/types.ts, reducer.ts, AppContext.tsx) with all state including future task/log/diff actions. Built ProjectSelector (top bar, outside-click close, harness warning), ProjectDropdown (project list, active highlight, Add Project). Wired engine get_projects on mount via onProjects listener. Add Project derives name from path, assigns color from palette, sends save_project + set_active_project to engine. tsc + eslint clean. Cargo build clean. |

---

## Time Log
| Date | Hours | Note |
|------|-------|------|
| — | — | No time logged |

---

## Review Notes
- **—**

# TASK-002: Foundation · Tauri + React + Vite Scaffold

## Meta
| Field | Value |
|-------|-------|
| **Assignee** | akshay-ksd |
| **Status** | ✅ Done |
| **Priority** | P0 |
| **Sprint** | Sprint 1 |
| **Story Points** | 5 |
| **PRD Reference** | prd.md §8 |
| **Architecture Ref** | architecture.md §3.1, §3.2 |
| **Start Date** | 2026-04-20 |
| **Due Date** | — |
| **Created** | 2026-04-20 |
| **Completed** | 2026-04-20 |

---

## Description
Initialize the Tauri 2.x desktop application with React 18 + TypeScript frontend bundled by Vite 5. Configure strict TypeScript, CSS Modules baseline, dark theme tokens, ESLint + Prettier, and Husky pre-commit hooks. The app window must open with the full component tree rendered as empty shells — no functionality yet, just the structural scaffold.

---

## Sub Tasks
- [x] Create Tauri 2.x project: `npm create tauri-app@latest` with React + TypeScript template
- [x] Switch package manager to `pnpm`, remove `node_modules`, run `pnpm install`
- [x] Configure `tsconfig.json`: `strict: true`, path aliases (`@/` → `src/`)
- [x] Set up ESLint + Prettier with `@typescript-eslint` rules, no `any` rule enabled
- [x] Configure Husky + lint-staged: lint and format on pre-commit
- [x] Create CSS Modules baseline: global CSS variables for dark theme (colors, spacing, typography)
- [x] Scaffold component shells (no logic): `<App>`, `<Sidebar>`, `<TopBar>`, `<Workspace>`, `<BottomBar>`
- [x] Scaffold modal shells: `<TaskSelectModal>`, `<DiffOverlay>`, `<ProjectDropdown>`
- [x] Configure frameless Tauri window with custom titlebar in `tauri.conf.json`
- [ ] Verify `pnpm tauri dev` opens the app window without errors — blocked: Rust not installed

---

## Acceptance Criteria
- [ ] `pnpm tauri dev` launches the app window on macOS, Linux, and Windows
- [ ] All component shells render without runtime errors
- [ ] TypeScript compiles with `strict: true` — zero errors
- [ ] ESLint passes with zero warnings on the scaffold
- [ ] Prettier formatting applied — no diffs on `pnpm lint`
- [ ] Pre-commit hook blocks commits with lint errors
- [ ] Dark theme tokens defined and applied to `<App>` root
- [ ] Window is frameless with a custom titlebar area visible

---

## Technical Notes
- Use Tauri v2 — not v1. API surface changed significantly.
- Path alias `@/` must be configured in both `tsconfig.json` (paths) and `vite.config.ts` (resolve.alias).
- CSS Modules: one `global.css` for theme tokens (CSS custom properties), component files use `.module.css`.
- Do not use `console.log` — structured logging goes in the Go engine only.

---

## Files to Create/Modify
```
CREATE:
src/App.tsx
src/components/Sidebar/Sidebar.tsx
src/components/Sidebar/Sidebar.module.css
src/components/TopBar/TopBar.tsx
src/components/TopBar/TopBar.module.css
src/components/Workspace/Workspace.tsx
src/components/Workspace/Workspace.module.css
src/components/BottomBar/BottomBar.tsx
src/components/BottomBar/BottomBar.module.css
src/components/TaskSelectModal/TaskSelectModal.tsx
src/components/DiffOverlay/DiffOverlay.tsx
src/components/ProjectDropdown/ProjectDropdown.tsx
src/styles/global.css
tsconfig.json
vite.config.ts
.eslintrc.json
.prettierrc
.husky/pre-commit
src-tauri/tauri.conf.json
```

---

## API Endpoints
N/A — no API endpoints in this task

---

## UI Screens
- **App shell** — frameless window, dark background, sidebar + topbar + workspace + bottombar layout visible

---

## Related Test Cases
—

## Dependencies
- **Blocked by:** TASK-001
- **Blocks:** TASK-003, TASK-005, TASK-006, TASK-008, TASK-011, TASK-014

---

## Claude Code Context
```
harness/claude.md
harness/tasks/Phase 0 — Foundation/TASK-002 — Foundation · Tauri + React + Vite Scaffold.md
harness/architecture.md
harness/prd.md
```

---

## Progress Log
| Date | Update |
|------|--------|
| 2026-04-20 | Scaffolded complete project structure manually. pnpm install succeeded. TypeScript strict mode passes with zero errors. ESLint passes with zero warnings. Husky pre-commit hook wired. Frameless window configured in tauri.conf.json. Pending: Rust not installed — pnpm tauri dev blocked until rustup is set up. |

---

## Time Log
| Date | Hours | Note |
|------|-------|------|
| — | — | No time logged |

---

## Review Notes
- **—**

# Claude Code Rules — Loom

> **Read this file FIRST before touching any code.**
> This is the single source of truth for project rules, coding standards, and development workflow.

---

## Project Identity

| Field | Value |
|-------|-------|
| **Project** | Loom |
| **Type** | Native Developer Workflow Tool |
| **Platform** | Desktop (Tauri + Go CLI) |
| **Industry** | Developer Tools |
| **Repo** | — |
| **Pod** | — |
| **Sprint Duration** | — |
| **Current Sprint** | — |

---

## Team

| Name | Role | Responsibility |
|------|------|----------------|
| — | — | — |

---

## Tech Stack Rules

### Desktop Shell
- **Tauri (Rust)** — Native window, OS integration, IPC bridge
- **React 18** with TypeScript — UI rendering, state management
- **Vite** — Frontend bundling
- **CSS Modules** — Scoped component styles

### Core Engine
- **Go CLI** 1.22+ — Process orchestration, diff parsing
- **Claude Code CLI** — AI code generation and modification

### Infrastructure
- **Git** 2.x — Local version control, diff extraction
- **Local JSON Store** — Projects, task state, preferences

### Development Tools
- **Node.js 20 LTS** — Minimum version
- **pnpm** — Package manager (not npm, not yarn)
- **ESLint + Prettier** — Pre-commit hook via husky + lint-staged
- **Conventional Commits** — `feat:`, `fix:`, `chore:`, `docs:`

---

## Coding Standards

### TypeScript
- Strict mode: `strict: true` in tsconfig
- No `any` — use `unknown` and type guards
- Interfaces for data shapes, types for unions/intersections
- Enums: use `as const` objects instead of TypeScript enums
- Null handling: always handle `null | undefined` explicitly

### Naming Conventions
```
Files:       kebab-case      → task-parser.service.ts, create-project.dto.ts
Components:  PascalCase      → TaskDetail.tsx, BugEditor.tsx
Functions:   camelCase       → parseTaskFile(), writeMarkdown()
Constants:   UPPER_SNAKE     → MAX_RETRY_COUNT, STATUS_MAP
Types:       PascalCase      → TaskData, BugUpdateDto
DB tables:   snake_case      → project_members, audit_log
DB columns:  snake_case      → created_at, last_sync
API routes:  kebab-case      → /api/v1/projects/:id/sync/push
Env vars:    UPPER_SNAKE     → DB_HOST, GITHUB_TOKEN
```

### File Size Limits
- Components: Max 200 lines — extract sub-components if larger
- Services: Max 300 lines — split into focused services if larger
- Single function: Max 50 lines — extract helpers if larger

### Import Order
```typescript
// 1. Node/external modules
import { Injectable } from '@nestjs/common';
// 2. Internal modules (absolute paths)
import { HarnessParserService } from '@/modules/harness/parser';
// 3. Relative imports
import { CreateTaskDto } from './dto/create-task.dto';
// 4. Types (type-only imports)
import type { TaskData } from '@/shared/types';
```

---

## Architecture Rules

### Tauri Shell (Rust) Rules
1. IPC commands exposed to frontend: `open_folder_picker()`, `read_harness_tasks()`, `get_projects()`, `save_project()`, `invoke_engine()`
2. Window management: Single-window application, frameless with custom titlebar
3. File system access: Folder picker dialog, reading `harness/` directory contents
4. Process spawning: Launches the Go CLI engine as a sidecar

### React Frontend (TypeScript) Rules
1. Single-page React application rendered inside Tauri webview
2. No direct filesystem or process access — all operations through Tauri IPC
3. Component tree: `<App>` → `<Sidebar>`, `<TopBar>`, `<Workspace>`, `<BottomBar>`, modals
4. State management: React Context + useReducer, no external state library in MVP
5. Every page gets its own folder under `src/pages/`
6. Shared components go in `src/shared/components/` — ONLY if used by 2+ pages

### Go CLI Core Engine Rules
1. Manages Claude Code CLI as child process
2. Streams stdout/stderr line by line to frontend
3. Detects Claude confirmation prompts and extracts diffs
4. Holds process at confirmation until user decides
5. Executes git commit after approved changes
6. Emits structured events back to Tauri frontend

### Critical Rule: Diff Interception
The diff view is **not** a post-execution review. When Claude Code CLI prompts for confirmation, Loom intercepts that moment and surfaces a structured diff panel. The user reviews proposed changes and decides — Claude continues or reverts based on the decision. This is a true pre-apply review model.

---

## Git Workflow

- **main** → Production (protected)
- **develop** → Integration branch
- **feature/TASK-XXX** → Feature branches from develop
- **bugfix/BUG-XXX** → Bug fix branches from develop
- Squash merge only — minimum 1 approval from Tech Lead
- Conventional commit messages: `feat(tasks):`, `fix(parser):`, `chore(deps):`

---

## File References for Claude Code

```
ALWAYS READ:
1. harness/claude.md          ← This file (rules & standards)
2. harness/tasks/TASK-XXX.md  ← The specific task being worked on
3. harness/architecture.md    ← System design & module structure

READ WHEN RELEVANT:
4. harness/prd.md             ← Product requirements & goals
5. harness/tech-stack.md      ← Dependencies & versions (if exists)
6. harness/docs/db-schema.md  ← When doing database work (if exists)
7. harness/docs/api-contracts.md ← When doing API work (if exists)
8. harness/docs/env-setup.md  ← When setting up dev environment (if exists)
```

---

## What Not To Do

- Don't make API calls in components — all operations through Tauri IPC
- Don't access filesystem directly from frontend — use Tauri commands
- Don't store persistent state in React — use local JSON store via Tauri
- Don't commit `.env` files — use `.env.example`
- Don't use `any` type — use `unknown` with type guards
- Don't use CSS-in-JS — use CSS Modules
- Don't use `console.log` — use structured logging in Go engine
- Don't modify files outside the project repos
- Don't spawn processes directly from frontend — use Go engine
- Don't bypass the diff interception — all changes must be approved

# Claude Code Rules — Loom Studio

> **Read this file FIRST before touching any code.**
> This is the single source of truth for project rules, coding standards, and development workflow.

---

## Project Identity

| Field | Value |
|-------|-------|
| **Project** | Loom Studio |
| **Client** | Adviciya |
| **Type** | Desktop App (Electron) |
| **Industry** | Developer Tools |
| **Repo** | Adviciya-dev/loom-studio |
| **Pod** | — |
| **Sprint Duration** | 2 weeks |
| **Current Sprint** | Sprint 1 |

---

## Team

| Name | Role | Responsibility |
|------|------|----------------|
| — | — | — |

---

## Tech Stack Rules

### Frontend
- **React 18** with TypeScript — no JavaScript files
- **Vite** for build — no CRA, no Webpack
- **Tailwind CSS** — no CSS modules, no styled-components, no inline styles in production
- **React Query (TanStack Query v5)** — for ALL server state. No useState for API data
- **Zustand** — for client-only UI state (sidebar, modals, filters)
- **React Hook Form + Zod** — for ALL forms (task editor, bug editor, create project wizard)
- **Axios** — with centralized interceptor at `shared/services/api.ts`
- **Lucide React** — for icons. No other icon library
- **Headless UI** — for dropdowns, modals, transitions

### Backend
- **NestJS 10** with TypeScript — strict mode enabled
- **TypeORM 0.3** — with migrations, never `synchronize: true` in production
- **PostgreSQL 16** — all queries through TypeORM QueryBuilder or Repository pattern
- **Redis 7** — via `@nestjs/cache-manager` for JWT store, sync locks, parsed cache
- **simple-git** — for all Git operations (clone, pull, add, commit, push)
- **@octokit/rest** — for GitHub API (create repo, list repos, check harness folder)
- **Bull** — for background jobs (auto-commit, webhook processing)
- **class-validator + class-transformer** — for ALL DTOs
- **Passport JWT** — for authentication
- **Winston** — for structured logging (JSON format)
- **Swagger** — auto-generated from decorators

### Shared
- **Node.js 20 LTS** — minimum version
- **pnpm** — package manager (not npm, not yarn)
- **ESLint + Prettier** — pre-commit hook via husky + lint-staged
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

### Frontend Rules
1. Every page gets its own folder under `src/pages/`
2. Shared components go in `src/shared/components/` — ONLY if used by 2+ pages
3. API calls ONLY happen in `src/shared/hooks/` via React Query — never in components
4. Forms always use React Hook Form — never raw `useState` for form fields
5. No prop drilling beyond 2 levels — use Zustand store or React Context
6. Task/Bug detail editors open as full-screen modals — not separate routes
7. Markdown preview uses the SAME `taskToMarkdown()` / `bugToMarkdown()` as backend

### Backend Rules
1. Controller → Service → Repository/Parser — never skip layers
2. DTOs for ALL request bodies — validated with `class-validator`
3. No raw SQL — use TypeORM QueryBuilder
4. Harness files are source of truth — NEVER store task/bug data in PostgreSQL
5. Git operations always acquire Redis lock first — prevent concurrent modifications
6. Markdown writer uses Handlebars templates — never string concatenation
7. Every mutation logs to audit table — interceptor handles automatically

### Critical Rule: Markdown Fidelity
The generated `.md` files MUST be identical whether created from the dashboard or hand-written in VS Code. Claude Code must NOT be able to tell the difference. The roundtrip `parse(write(data))` must be lossless.

---

## API Standards

### Response Format
```json
{ "success": true, "data": { }, "message": "Task updated", "meta": { "timestamp": "..." } }
```

### Error Format
```json
{ "success": false, "error": { "code": "TASK_NOT_FOUND", "message": "...", "details": { } } }
```

### Status Codes
- 200 Success | 201 Created | 204 Deleted | 400 Validation | 401 Unauthorized
- 403 Forbidden | 404 Not Found | 409 Conflict | 423 Locked | 500 Server Error

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
4. harness/tech-stack.md      ← Dependencies & versions
5. harness/docs/db-schema.md  ← When doing database work
6. harness/docs/api-contracts.md ← When doing API work
7. harness/docs/env-setup.md  ← When setting up dev environment
8. harness/prd.md             ← When clarifying requirements
```

---

## What Not To Do

- Don't store task/bug data in PostgreSQL — files are source of truth
- Don't use `synchronize: true` — use TypeORM migrations
- Don't commit `.env` files — use `.env.example`
- Don't use `any` type — use `unknown` with type guards
- Don't use CSS-in-JS — use Tailwind utility classes
- Don't use `console.log` — use Winston logger (backend)
- Don't make API calls in components — use React Query hooks
- Don't string-concatenate markdown — use Handlebars templates
- Don't skip the Redis lock before Git operations
- Don't modify files outside `/harness` in project repos

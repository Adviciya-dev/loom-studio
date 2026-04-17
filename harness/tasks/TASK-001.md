# TASK-001: Setup Development Environment

## Meta
| Field | Value |
|-------|-------|
| **Assignee** | — |
| **Status** | 📋 To Do |
| **Priority** | P0 |
| **Sprint** | Sprint 1 |
| **Story Points** | 3 |
| **PRD Reference** | — |
| **Architecture Ref** | See architecture.md |
| **Created** | 2026-04-17 |
| **Completed** | — |

---

## Description
Set up the local development environment for Loom Studio. Install all dependencies, configure environment variables, start infrastructure services (PostgreSQL, Redis), and verify the application runs end-to-end.

---

## Acceptance Criteria
- [ ] Repository cloned and dependencies installed via `pnpm install`
- [ ] Environment variables configured (.env from .env.example)
- [ ] PostgreSQL and Redis running (via Docker Compose)
- [ ] Database migrations executed successfully
- [ ] Backend starts without errors on port 3000
- [ ] Frontend starts without errors on port 5173
- [ ] Can access the application in the browser

---

## Technical Notes
- **Approach:** Follow env-setup.md guide
- **Entity/Table:** —
- **Relations:** —
- **Reuse:** —
- **Gotchas:** Ensure Node.js 20 LTS is installed. Use pnpm, not npm or yarn.

---

## Files to Create/Modify
```
MODIFY:
- .env (from .env.example)
```

---

## API Endpoints
N/A — this task has no API endpoints

---

## UI Screens
- **Design:** —
- **Route:** —
- **Components:** —
- **Responsive:** —

---

## Related Test Cases
- Test Case File: —
- Related IDs: —

## Dependencies
- **Blocked by:** None
- **Blocks:** All other tasks

---

## Claude Code Context
```
Provide Claude Code with these files:
1. harness/claude.md (rules and standards)
2. harness/tasks/TASK-001.md (this file)
3. harness/architecture.md (system context)
4. harness/docs/env-setup.md (environment setup guide)
```

---

## Progress Log
| Date | Update |
|------|--------|
| — | No updates yet |

---

## Review Notes
- **Reviewer:** —
- **Review Date:** —
- **Feedback:** —

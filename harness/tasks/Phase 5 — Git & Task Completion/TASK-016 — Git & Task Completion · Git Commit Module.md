# TASK-016: Git & Task Completion · Git Commit Module

## Meta
| Field | Value |
|-------|-------|
| **Assignee** | — |
| **Status** | ✅ Done |
| **Priority** | P0 |
| **Sprint** | Sprint 3 |
| **Story Points** | 3 |
| **PRD Reference** | prd.md §6.6, §6.7 |
| **Architecture Ref** | architecture.md §3.3 |
| **Start Date** | — |
| **Due Date** | — |
| **Created** | 2026-04-20 |
| **Completed** | 2026-04-21 |

---

## Description
Implement the Git commit module (`git/commit.go`) in the Go engine. After the user approves a diff and Claude finishes the task, this module stages all changes and creates a local Git commit with an auto-generated message. The commit message is derived from the active task ID and title.

---

## Sub Tasks
- [x] Implement `git.StageAll(projectPath string) error` — run `git add -A` in project directory
- [x] Implement `git.Commit(projectPath string, message string) error` — run `git commit -m "<message>"` 
- [x] Auto-generate commit message format: `feat(loom): [TASK-XXX] <task title>` using active task metadata
- [x] Call `StageAll` then `Commit` after Claude process exits 0 (task complete)
- [x] On commit success: emit `task_complete` event with task ID and commit hash
- [x] On `git add` failure: emit `engine_error`, do not attempt commit
- [x] On `git commit` failure (e.g. nothing to commit, no git repo): emit `engine_error` with message
- [x] Write unit tests using a temp git repo: stage, commit, verify commit exists

---

## Acceptance Criteria
- [x] `git add -A` stages all working tree changes in the project directory
- [x] `git commit` creates a new commit with the auto-generated message
- [x] Commit message format: `feat(loom): [TASK-XXX] <task title>`
- [x] `task_complete` event includes the commit hash
- [x] Failure to stage or commit emits `engine_error` — does not crash
- [x] Unit tests verify commit is created in a temp repo

---

## Technical Notes
- Run all git commands with `exec.Command("git", ...)` with `Dir` set to `projectPath`.
- Get commit hash after commit: run `git rev-parse HEAD` and include in `task_complete` payload.
- No external Git library — shell out to the `git` binary. This is the correct approach for this project.

---

## Files to Create/Modify
```
CREATE/MODIFY:
src-tauri/binaries/loom-engine/git/commit.go
src-tauri/binaries/loom-engine/git/commit_test.go
src-tauri/binaries/loom-engine/process/manager.go
```

---

## API Endpoints
N/A — no API endpoints in this task

---

## UI Screens
- **—**

---

## Related Test Cases
- `git/commit_test.go` — stage all, commit, verify hash, nothing-to-commit error, no-git-repo error

## Dependencies
- **Blocked by:** TASK-015
- **Blocks:** TASK-017

---

## Claude Code Context
```
harness/claude.md
harness/tasks/Phase 5 — Git & Task Completion/TASK-016 — Git & Task Completion · Git Commit Module.md
harness/architecture.md §3.3, §4.1
harness/prd.md §6.6, §6.7
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

# TASK-021: Git Management · Branch Switcher & Manual Commit Panel

## Meta
| Field | Value |
|-------|-------|
| **Assignee** | — |
| **Status** | 📋 To Do |
| **Priority** | P1 |
| **Sprint** | Sprint 4 |
| **Story Points** | 5 |
| **PRD Reference** | — |
| **Architecture Ref** | architecture.md §3.3 |
| **Start Date** | — |
| **Due Date** | — |
| **Created** | 2026-04-25 |
| **Completed** | — |

---

## Description
Add a Git management section to the TopBar. It displays the active project's current branch and opens a dropdown panel where the user can switch to any local branch or manually commit all staged/unstaged changes with a custom message. This gives developers quick git control without leaving the app.

---

## Sub Tasks

### Layer 1 — Go Engine: `git/branch.go` (new file)
- [ ] `GetCurrentBranch(projectPath string) (string, error)` — runs `git rev-parse --abbrev-ref HEAD`
- [ ] `ListBranches(projectPath string) ([]string, error)` — runs `git branch --format='%(refname:short)'`
- [ ] `CheckoutBranch(projectPath, branch string) error` — runs `git checkout <branch>`

### Layer 2 — Go Engine: `main.go` (3 new IPC actions)
- [ ] `git_status` — call GetCurrentBranch + ListBranches, emit `git_info` event `{ branch: string, branches: []string }`
- [ ] `git_checkout` (field: `branch`) — call CheckoutBranch, then re-emit `git_info`; emit `engine_error` on failure (e.g. dirty working tree)
- [ ] `git_commit` (field: `message`) — call StageAll then Commit with user-provided message, emit `git_committed` event `{ hash: string }`; emit `engine_error` if message empty or nothing to commit

### Layer 3 — Frontend Types
- [ ] `src/lib/ipc.ts` — add to `EngineCommand` union:
  - `{ action: 'git_status' }`
  - `{ action: 'git_checkout'; branch: string }`
  - `{ action: 'git_commit'; message: string }`
- [ ] `src/lib/events.ts` — add:
  - `onGitInfo(cb: (info: { branch: string; branches: string[] }) => void)`
  - `onGitCommitted(cb: (payload: { hash: string }) => void)`

### Layer 4 — AppContext State
- [ ] `src/context/types.ts` — add to `AppState`:
  - `gitBranch: string | null`
  - `gitBranches: string[]`
- [ ] `src/context/types.ts` — add `AppAction`:
  - `{ type: 'SET_GIT_INFO'; branch: string; branches: string[] }`
- [ ] `src/context/reducer.ts` — handle `SET_GIT_INFO`: update `gitBranch` and `gitBranches`

### Layer 5 — App Event Wiring
- [ ] In `App.tsx` (or wherever other `onXxx` listeners are registered):
  - Register `onGitInfo` → dispatch `SET_GIT_INFO`
  - Register `onGitCommitted` → show toast with short commit hash
- [ ] Dispatch `engineCommand({ action: 'git_status' })` whenever `activeProject` changes (use `useEffect` on `activeProject`)

### Layer 6 — `GitControls` Component (new)
- [ ] Create `src/components/TopBar/GitControls.tsx`:
  - When no active project: render nothing (return null)
  - Shows `⎇ <branch-name>` button in TopBar; grayed/skeleton if `gitBranch` is null
  - Click toggles a dropdown panel anchored below the button
  - Clicking outside closes dropdown (use `useEffect` + `mousedown` listener on document)
  - **Branch section**: list all `gitBranches`; current branch shown bold with a `✓`; clicking a different branch dispatches `git_checkout` and closes dropdown
  - **Commit section** (below divider): single-line text input for commit message + "Commit" button; button disabled when input empty; on submit dispatches `git_commit` and clears input
- [ ] Create `src/components/TopBar/GitControls.module.css`:
  - `.trigger` — branch icon + name inline, same height as RunControls buttons
  - `.dropdown` — absolute positioned panel, `z-index` above main content, `--bg-elevated` background, `--border` border, `--radius-md` radius, `box-shadow`
  - `.branchItem` — full-width row, hover highlight, bold + checkmark for active branch
  - `.commitSection` — flex column, padding, input + button layout
  - `.commitInput` — full-width text input, `--bg-surface` background
  - `.commitBtn` — same style as `runBtn` from RunControls

### Layer 7 — TopBar Integration
- [ ] `src/components/TopBar/TopBar.tsx` — add `<GitControls />` in the right section, immediately before `<RunControls />`
- [ ] Ensure right section uses `gap` spacing so the two controls don't touch

---

## Acceptance Criteria
- [ ] TopBar shows `⎇ <branch>` for the active project; absent when no project selected
- [ ] Branch name refreshes automatically when the active project changes
- [ ] Dropdown lists all local branches; current branch is visually marked
- [ ] Clicking a branch name checks it out and updates the displayed branch
- [ ] Checkout failure (e.g. uncommitted changes blocking switch) shows engine error toast — does not crash
- [ ] Commit section requires a non-empty message; button is disabled otherwise
- [ ] Committing stages all changes (`git add -A`) then commits with the user's message
- [ ] After a successful commit a toast shows the short hash; input clears
- [ ] Committing with nothing staged shows engine error toast — does not crash
- [ ] Dropdown closes on outside click

---

## Technical Notes
- Shell out to `git` binary for all operations (same pattern as existing `git/commit.go`). No third-party Git libraries.
- `git_status` should be idempotent and cheap — it only reads, never writes.
- `CheckoutBranch` will fail if the working tree is dirty and Git refuses the switch. Surface this as an `engine_error` event — the existing error toast in the UI will handle display.
- The dropdown is a plain absolutely-positioned div, not a `<dialog>` or portal — keep it simple for MVP.
- `CommitWithMessage` in the Go engine is a thin wrapper: `StageAll` then `Commit` with the provided message (no auto-generated prefix). Reuse the existing helpers from `git/commit.go`.

---

## Files to Create/Modify
```
CREATE:
src-tauri/binaries/loom-engine/git/branch.go
src/components/TopBar/GitControls.tsx
src/components/TopBar/GitControls.module.css

MODIFY:
src-tauri/binaries/loom-engine/main.go
src-tauri/binaries/loom-engine/git/commit.go
src/lib/ipc.ts
src/lib/events.ts
src/context/types.ts
src/context/reducer.ts
src/App.tsx  (or wherever onXxx listeners are wired)
src/components/TopBar/TopBar.tsx
```

---

## UI Screens
- **TopBar (running state):** `[ProjectSelector] [TaskTabs ···] | [⎇ main ▾] [Pause] [Stop]`
- **GitControls dropdown open:** branch list with checkmark on current branch + commit input below

---

## Related Test Cases
- `git/branch_test.go` — GetCurrentBranch, ListBranches, CheckoutBranch (success + error cases)

## Dependencies
- **Blocked by:** TASK-016 (git/commit.go must exist for CommitWithMessage reuse)
- **Blocks:** —

---

## Claude Code Context
```
harness/claude.md
harness/tasks/Phase 5 — Git & Task Completion/TASK-021 — Git Management · Branch Switcher & Manual Commit Panel.md
harness/architecture.md §3.3
src-tauri/binaries/loom-engine/git/commit.go
src-tauri/binaries/loom-engine/main.go
src/components/TopBar/RunControls.tsx
src/lib/ipc.ts
src/lib/events.ts
src/context/types.ts
src/context/reducer.ts
```

---

## Progress Log
| Date | Update |
|------|--------|
| 2026-04-25 | Task created — planned via conversation |

---

## Time Log
| Date | Hours | Note |
|------|-------|------|
| — | — | No time logged |

---

## Review Notes
- **—**

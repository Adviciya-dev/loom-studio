# TASK-023: GitHub PR · Pull Request Creation Tab

## Meta
| Field | Value |
|-------|-------|
| **Assignee** | — |
| **Status** | 📋 To Do |
| **Priority** | P1 |
| **Sprint** | Sprint 6 |
| **Story Points** | 8 |
| **PRD Reference** | — |
| **Architecture Ref** | architecture.md |
| **Start Date** | — |
| **Due Date** | — |
| **Created** | 2026-04-27 |
| **Completed** | — |

---

## Description
Add a **GitHub PR** tab (4th sidebar icon, currently the `⎇ GitBranch` icon) that lets developers create and manage pull requests without leaving Loom Studio. After Claude finishes a task on a `loom/<task>` branch, the developer comes here to push and raise a PR in one flow.

The tab detects the current branch and remote, auto-populates the PR title from the last commit, offers Claude-powered description generation, and runs `gh pr create` under the hood.

---

## Sub Tasks

### Layer 1 — Sidebar & App Mode
- [ ] Add `'github'` to `appMode` union in `src/context/types.ts` and action type
- [ ] Wire `⎇ GitBranch` sidebar button to dispatch `SET_APP_MODE 'github'`
- [ ] Add `<GitHubPR />` slot in `App.tsx` (alongside Harness and QA slots)
- [ ] TopBar in `'github'` mode: hide TaskTabs and RunControls, keep GitControls + ProjectSelector

### Layer 2 — Go Engine: New IPC Actions
All commands run in the project directory; emit results as events.

- [ ] `gh_check` — run `which gh`, emit `gh_available: boolean`
- [ ] `gh_default_branch` — run `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`, emit `gh_default_branch: string`
- [ ] `git_log_branch` (fields: `base`) — run `git log origin/<base>..<current> --oneline --no-decorate`, emit `git_log_branch_result: string[]`
- [ ] `git_branch_pushed` — run `git ls-remote --heads origin <current>`, emit `git_branch_pushed_result: boolean`
- [ ] `gh_pr_create` (fields: `title`, `body`, `base`, `draft`) — run `gh pr create --title ... --body ... --base ... [--draft]`, stream stdout as `log_line` events, emit `gh_pr_created: { url: string }` on success, `engine_error` on failure
- [ ] `gh_pr_list` — run `gh pr list --json number,title,headRefName,state,url`, emit `gh_pr_list_result: PRItem[]`

### Layer 3 — Frontend Events & Types
- [ ] `src/lib/events.ts`: add `onGhAvailable`, `onGhDefaultBranch`, `onGitLogBranchResult`, `onGitBranchPushedResult`, `onGhPrCreated`, `onGhPrListResult`
- [ ] `src/lib/ipc.ts`: add 6 new action types + re-exports
- [ ] `src/context/types.ts`: add to `AppState`:
  - `ghAvailable: boolean | null` (null = not checked yet)
  - `ghDefaultBranch: string | null`
  - `gitCommitsOnBranch: string[]`
  - `gitBranchPushed: boolean | null`
  - `ghOpenPrs: PRItem[]`
- [ ] Add corresponding actions and reducer cases

### Layer 4 — GitHubPR Component
Create `src/components/GitHubPR/GitHubPR.tsx` and `.module.css`.

**Section: Header row**
- Shows: `⎇ <current-branch>  →  <base ▾>` with a base branch selector (default from `ghDefaultBranch`)
- Warning pill if `!gitBranchPushed`: "↑ Branch not pushed — push first"
- Warning if `gitBranch === ghDefaultBranch`: "Cannot PR from the default branch"
- Warning if `ghAvailable === false`: "gh CLI not found — install from cli.github.com"

**Section: PR form**
- `title` input: pre-filled from last commit in `gitCommitsOnBranch[0]` OR active task title
- `body` textarea: initially blank, grows up to 320px
- `[✨ Generate with AI]` button: calls `invoke_claude` with:
  - `git log` output (commits list)
  - `git diff --stat` summary
  - Task prompt context
  - Instruction to produce: `## Summary\n<bullets>\n\n## Test plan\n<checklist>`
  - Streams response into the body textarea
- Draft toggle (radio: "Ready for review" / "Draft PR")

**Section: Commits on branch**
- Reads from `gitCommitsOnBranch` state
- Rendered as a compact list with bullet + hash + message
- "Nothing to PR" empty state if list is empty

**Section: Create button**
- `[Create PR on GitHub ↗]` — disabled if: no title, branch not pushed, no commits, gh not available, or PR being created
- On success: show PR URL + `[Open in browser]` button (uses Tauri `open` or `shell.open`)
- Loading state during creation

**Section: Open PRs (bottom)**
- Fetched via `gh_pr_list` on mount
- Table: PR number, title, head branch, state badge
- Click row → open URL in browser

### Layer 5 — Claude-Powered Description
- Re-use `invoke_claude` Rust command (already exists)
- Prompt assembles: `git log` + `git diff --stat` + task context
- Result streams into the body textarea via `harness_log_line` events
- Accumulates into textarea value, same pattern as HarnessManager chat

### Layer 6 — Auto-Push Flow
- If `!gitBranchPushed`: show a `[↑ Push branch]` button in the warning pill
- Clicking it dispatches `git_push` (existing Go action) with `branch: gitBranch`
- On `git_remote_info` update confirming push: re-check `git_branch_pushed`

---

## Acceptance Criteria
- [ ] Clicking ⎇ in sidebar switches to GitHub PR mode; other modes still work
- [ ] Warning shown if `gh` CLI not installed with install link
- [ ] Warning shown if branch not pushed with one-click push option
- [ ] Warning shown if on default branch
- [ ] Title auto-populated from last commit; editable
- [ ] "Generate with AI" streams a structured PR description into the textarea
- [ ] Commit list shows all commits ahead of base branch
- [ ] Clicking Create PR runs `gh pr create` and shows the resulting URL
- [ ] "Open in browser" opens the PR URL in the system browser
- [ ] Open PRs panel lists current open PRs; clicking a row opens the URL
- [ ] Base branch selector defaults to repo default branch

---

## Technical Notes
- All `gh` commands run via Go engine (same exec pattern as git commands). No GitHub API tokens needed — `gh` handles auth.
- If the remote is not GitHub (e.g. GitLab), `gh` commands will fail gracefully — surface a "Not a GitHub remote" message.
- The `gh_pr_create` action streams output as `log_line` events so the user sees progress (gh outputs the URL and branch info as it runs).
- `invoke_claude` for description generation uses the same Rust command as HarnessManager. The `project_path` ensures Claude can read any file context.
- Check for `.github/PULL_REQUEST_TEMPLATE.md` and pre-fill the body with its contents if present.

---

## Files to Create
```
CREATE:
src/components/GitHubPR/GitHubPR.tsx
src/components/GitHubPR/GitHubPR.module.css
```

```
MODIFY:
src/context/types.ts
src/context/reducer.ts
src/components/Sidebar/Sidebar.tsx
src/components/TopBar/TopBar.tsx
src/App.tsx
src/lib/ipc.ts
src/lib/events.ts
src-tauri/binaries/loom-engine/main.go   ← 6 new IPC cases
```

---

## UI Screens
```
Sidebar:  ⎇ icon (4th) → GitHub PR mode

TopBar (github mode):
  ● ● ●  [ProjectSelector]                    [⎇ loom/task-001 ▾]

Main panel:
  ⎇ loom/task-001 → [main ▾]    ⚠ Branch not pushed [↑ Push]

  Title: [feat(auth): implement authentication...          ]
  Body:  [                                    ] [✨ Generate]
  
  Commits (3):
  • abc1234  feat(auth): login screen (2h ago)
  • def5678  feat(auth): JWT backend (3h ago)
  
  ○ Ready for review   ● Draft PR
  
  [         Create PR on GitHub ↗         ]

  ─────────────────────────────────────────
  Open PRs (2)
  #42  feat(home)  loom/task-002 → main  ●open
  #38  fix(auth)   loom/task-003 → main  ●open
```

---

## Dependencies
- **Blocked by:** TASK-021 (GitControls — branch/push already wired) ✅ done
- **Blocked by:** Rust `invoke_claude` command ✅ done
- **Blocks:** —

---

## Claude Code Context
```
harness/claude.md
harness/tasks/Phase 9 — GitHub PR/TASK-023 — GitHub PR · Pull Request Creation Tab.md
src/components/Sidebar/Sidebar.tsx
src/components/TopBar/TopBar.tsx
src/App.tsx
src/context/types.ts
src/context/reducer.ts
src/lib/ipc.ts
src/lib/events.ts
src-tauri/binaries/loom-engine/main.go
src-tauri/src/commands.rs
src/components/HarnessManager/ChatPanel.tsx   ← reference for invoke_claude pattern
```

---

## Progress Log
| Date | Update |
|------|--------|
| 2026-04-27 | Task created — planned via conversation |

---

## Time Log
| Date | Hours | Note |
|------|-------|------|
| — | — | — |

---

## Review Notes
- **—**

# Loom — Development Strategy
### v1.0 · April 2026

---

## Guiding Principle

Build the critical path first. Every phase must produce a working, testable slice of the product. No module is "done" until it connects end-to-end with the layer above and below it.

---

## Phase 0 — Foundation (Week 1)

Goal: Skeleton app runs on all target platforms. Nothing works yet, but the wiring exists.

### Tasks
- [ ] Initialize Tauri 2.x project with Vite + React 18 + TypeScript
- [ ] Configure strict TypeScript (`strict: true`, no `any`)
- [ ] Set up ESLint + Prettier + Husky pre-commit hooks
- [ ] Initialize Go module for `loom-engine`
- [ ] Configure Tauri sidecar to launch Go engine binary
- [ ] Establish IPC command stubs: `open_folder_picker`, `read_harness_tasks`, `get_projects`, `save_project`, `invoke_engine`
- [ ] Scaffold React component tree with empty shells: `<App>`, `<Sidebar>`, `<TopBar>`, `<Workspace>`, `<BottomBar>`
- [ ] Set up CSS Modules baseline + dark theme tokens
- [ ] Confirm dev build runs: `npm run tauri dev`

**Exit criteria:** App window opens, sidebar renders, no runtime errors.

---

## Phase 1 — Project Management (Week 2)

Goal: User can select a project folder and see it persisted across restarts.

### Tasks
- [ ] Implement `open_folder_picker()` Tauri command (Rust)
- [ ] Implement `get_projects()` and `save_project()` Tauri commands (Rust)
- [ ] Implement Local JSON Store in Go (`store/json.go`) — read/write `state.json`
- [ ] Build `<ProjectSelector>` dropdown component
- [ ] Build `<ProjectDropdown>` — list saved projects, add new
- [ ] Wire folder picker → save to JSON → display in top bar
- [ ] Handle edge cases: missing folder, duplicate project, corrupted JSON

**Exit criteria:** Select folder → project saved → visible on restart.

---

## Phase 2 — Task System (Week 3)

Goal: User can browse and select tasks from the `harness/` folder.

### Tasks
- [ ] Implement `read_harness_tasks(path)` Tauri command (Rust)
- [ ] Implement Go task reader (`task/reader.go`) — parse frontmatter + body from `.md` files
- [ ] Define `Task` TypeScript interface (id, title, type, status, due, steps, prompt)
- [ ] Build `<TaskSelectModal>` — list tasks with ID, title, status badge, due date
- [ ] Build `<TaskTabs>` — add task tab on selection, switch between tabs
- [ ] Build `<TaskDetailPanel>` — render task ID, title, meta, description, step list
- [ ] Handle edge cases: empty harness folder, malformed `.md`, missing frontmatter fields

**Exit criteria:** Open modal → select task → task loads in detail panel with correct data.

---

## Phase 3 — Engine Integration & Log Streaming (Week 4)

Goal: Clicking Run spawns Claude Code CLI and streams output to the log panel.

### Tasks
- [ ] Implement `invoke_engine(command, args)` Tauri command (Rust)
- [ ] Implement Go process manager (`process/manager.go`) — spawn/kill Claude CLI
- [ ] Implement Go streamer (`process/streamer.go`) — read stdout/stderr line by line
- [ ] Implement IPC emitter (`ipc/emitter.go`) — emit `log_line` events to frontend
- [ ] Build `<LogPanel>` — auto-scrolling terminal view, timestamped, color-coded by level
- [ ] Build `<RunControls>` — Run/Pause button wired to engine commands
- [ ] Implement engine state machine: `idle → running → completed`
- [ ] Handle pause/resume via SIGSTOP/SIGCONT
- [ ] Handle non-zero exit → `engine_error` event → UI error state

**Exit criteria:** Run task → Claude CLI output streams live into log panel → task completes.

---

## Phase 4 — Diff Interception (Week 5)

Goal: When Claude requests confirmation, Loom intercepts, extracts diff, and surfaces the diff panel. This is the core value of the product.

### Tasks
- [ ] Implement confirmation prompt detector (`process/detector.go`) — pattern match on stream
- [ ] Implement diff extractor (`diff/extractor.go`) — run `git diff`, return raw output
- [ ] Implement diff parser (`diff/parser.go`) — parse unified diff into `DiffFile[]` / `DiffLine[]`
- [ ] Emit `diff_ready` event with `DiffPayload` to frontend
- [ ] Build `<DiffOverlay>` — file list panel + diff code panel
  - [ ] Added lines: green highlight
  - [ ] Removed lines: red highlight with strikethrough
  - [ ] File switcher in left panel
  - [ ] Split view / Unified view toggle
- [ ] Wire Approve → `invoke('engine_command', { action: 'approve' })` → write `y\n` to stdin
- [ ] Wire Reject → `invoke('engine_command', { action: 'reject' })` → write `n\n` + `git checkout .`
- [ ] Block engine on decision channel until user acts
- [ ] Handle multiple confirmation prompts in a single task run (sequential)

**Exit criteria:** Claude hits confirmation → diff panel opens with correct changes → approve/reject works correctly.

---

## Phase 5 — Git Commit & Task Completion (Week 6)

Goal: Approved changes are committed locally and the task is marked complete.

### Tasks
- [ ] Implement `git/commit.go` — stage all changes, auto-generate commit message, commit
- [ ] Emit `task_complete` event after successful commit
- [ ] Update task status to "completed" in UI (tab + detail panel)
- [ ] Mark all task steps as done in detail panel
- [ ] Display success state in UI
- [ ] Persist task completion to JSON store (`task_history`)

**Exit criteria:** Approve changes → git commit created → task marked complete in UI.

---

## Phase 6 — Polish & Hardening (Week 7)

Goal: Production-quality UX. Handle all edge cases and failure paths.

### Tasks
- [ ] Error state: Claude CLI not installed — show install guide
- [ ] Error state: Git not installed — show install guide
- [ ] Error state: `harness/` folder missing — show setup instructions
- [ ] Error state: diff extraction fails — show retry option in diff panel
- [ ] Error state: JSON store corruption — reset to defaults, log warning
- [ ] Bottom bar: custom prompt input wired to engine
- [ ] Status pills in bottom bar (engine status, task status)
- [ ] Build status indicator in diff footer
- [ ] Log level labels and color polish
- [ ] Performance: large diffs render without jank (virtualize if needed)
- [ ] Accessibility: keyboard navigation for approve/reject
- [ ] Test on macOS, Linux, Windows

**Exit criteria:** All error paths handled. App is stable on all three platforms.

---

## Phase 7 — Build & Distribution (Week 8)

Goal: Installable binary for all platforms.

### Tasks
- [ ] Configure Tauri bundle: `Loom.app`, `.dmg`, `.AppImage`, `.deb`, `.exe`
- [ ] Bundle Go engine as Tauri external binary (sidecar)
- [ ] Sign macOS build (Developer ID)
- [ ] Test clean install on fresh machine (no dev tools installed)
- [ ] Write `harness/docs/env-setup.md` for contributors
- [ ] Tag `v1.0.0` release

**Exit criteria:** Installer works on clean macOS, Linux, Windows machines.

---

## Development Priorities

| Priority | Rule |
|----------|------|
| 1 | Diff interception must work correctly — it is the product |
| 2 | Never break the approve/reject data path |
| 3 | All changes reviewed before written to disk — no exceptions |
| 4 | Frontend never touches filesystem directly |
| 5 | Go engine owns all process and Git operations |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Claude CLI confirmation pattern changes | Medium | High | Make detector patterns configurable, not hardcoded |
| `git diff` output format varies across Git versions | Low | Medium | Pin minimum Git version (2.x), add format tests |
| Large diffs cause UI jank | Medium | Medium | Virtualize diff line rendering in Phase 6 |
| Tauri sidecar launch fails silently | Low | High | Add engine health check on app start, surface error in UI |
| JSON store corruption on crash | Low | Medium | Atomic writes + backup before overwrite |
| Platform-specific IPC behavior differences | Medium | Medium | Test IPC layer on all three platforms early (Phase 3) |

---

## Module Build Order (Dependency Graph)

```
Phase 0: Tauri scaffold + Go module
    ↓
Phase 1: JSON Store → Project Management
    ↓
Phase 2: Task Reader → Task UI
    ↓
Phase 3: Process Manager → Streamer → Log Panel
    ↓
Phase 4: Detector → Diff Extractor → Diff Parser → Diff UI ← CORE
    ↓
Phase 5: Git Commit → Task Completion
    ↓
Phase 6: Polish + Error Handling
    ↓
Phase 7: Build + Distribution
```

Each phase depends on the one above it. Phases 0–3 are infrastructure. Phase 4 is the product. Phases 5–7 complete the loop.

---

*Strategy targets Phase 1 MVP. Phase 2+ additions (PR creation, test automation, multi-task queue) are scoped separately.*

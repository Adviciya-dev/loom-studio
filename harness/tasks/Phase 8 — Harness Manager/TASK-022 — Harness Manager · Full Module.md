# TASK-022: Harness Manager · Full Module

## Meta
| Field | Value |
|-------|-------|
| **Assignee** | — |
| **Status** | 📋 To Do |
| **Priority** | P1 |
| **Sprint** | Sprint 5 |
| **Story Points** | 13 |
| **PRD Reference** | — |
| **Architecture Ref** | architecture.md |
| **Start Date** | — |
| **Due Date** | — |
| **Created** | 2026-04-26 |
| **Completed** | — |

---

## Description
Add a **Harness Manager** mode to Loom Studio, activated by the sidebar's second nav icon (☰). When active, the app switches from the Run layout to a two-panel workspace: a VS Code-style **file explorer** on the left and a **Claude chat panel** on the right. The purpose of this mode is to help developers set up and maintain their harness directory — generating PRD, architecture, feature briefs, and structured task files — using Claude as an assistant.

When the user switches back to ⊞ (Run mode), the original layout is fully restored.

---

## Sub Tasks

### Layer 1 — App Mode State
- [ ] Add `appMode: 'run' | 'harness'` to `AppState` in `src/context/types.ts`
- [ ] Add `SET_APP_MODE` action to `AppAction` union
- [ ] Handle `SET_APP_MODE` in `src/context/reducer.ts` (simple field set)
- [ ] Set default to `'run'`

### Layer 2 — Sidebar: Interactive Mode Switching
- [ ] Make Sidebar stateful: import `useApp`, dispatch `SET_APP_MODE` on nav click
- [ ] `⊞` button → `'run'` mode; `☰` button → `'harness'` mode
- [ ] Active state driven by `state.appMode` (not hardcoded)
- [ ] Keep `⎇` and `⚙` as inert for now (future phases)

### Layer 3 — TopBar: Mode-Aware Rendering
- [ ] In `TopBar.tsx`, read `state.appMode`
- [ ] When `'harness'`: render only `<WindowControls />` + divider + `<ProjectSelector />`; hide TaskTabs, GitControls, RunControls
- [ ] When `'run'`: render current layout unchanged

### Layer 4 — App Layout: Harness Mode Slot
- [ ] In `App.tsx` (or `Workspace.tsx`), conditionally render `<HarnessManager />` when `appMode === 'harness'`, otherwise current workspace
- [ ] HarnessManager replaces both Workspace and BottomBar when active

### Layer 5 — Tauri Commands (Rust)
- [ ] Add `read_directory(path: String) -> Result<FileNode, String>` in `commands.rs`
  - Returns a recursive `FileNode` tree: `{ name, path, is_dir, children?, extension? }`
  - Max depth: 6 levels; skip `node_modules`, `.git`, `target`, `.next`, `dist`
- [ ] Add `read_file_content(path: String) -> Result<String, String>` in `commands.rs`
  - Returns UTF-8 file content; error if binary or > 500KB
- [ ] Register both in `invoke_handler` in `lib.rs`
- [ ] Add corresponding TypeScript bindings in `src/lib/ipc.ts`

### Layer 6 — Go Engine: Harness Chat Action
- [ ] Add `harness_chat` IPC action in `main.go`
  - Fields: `message: string`, `history: [{role, content}]`, `project_path: string`
  - Assembles prompt: conversation history + new user message
  - Runs `claude --dangerously-skip-permissions --print --output-format stream-json <prompt>`
  - Emits `harness_log_line` events (same shape as `log_line` but separate event name)
  - Emits `harness_done` when Claude exits
  - Runs concurrently safe — separate from the task engine (use a dedicated mutex/manager)
- [ ] Add `EmitHarnessLogLine(content string)` to the IPC emitter
- [ ] Add `onHarnessLogLine` and `onHarnessDone` in `src/lib/events.ts`

### Layer 7 — HarnessManager Component
- [ ] Create `src/components/HarnessManager/HarnessManager.tsx`
  - Full-height flex row: left `FileExplorer` (30%) + resize handle + right `ChatPanel` (70%)
  - Draggable divider (clamp 20%–50%)
  - No BottomBar in this mode
- [ ] `src/components/HarnessManager/HarnessManager.module.css`

### Layer 8 — FileExplorer Component
- [ ] Create `src/components/HarnessManager/FileExplorer.tsx`
  - On mount: calls `read_directory(activeProject.path)`, stores tree in local state
  - Recursive `FileNode` renderer with indent per level
  - Folders: chevron (▶ collapsed / ▼ expanded) + folder icon, click to toggle
  - Files: icon based on extension (`.md` 📄, `.ts`/`.tsx` ⚡, `.go` 🔷, `.json` `{}`, others `·`)
  - Click file → open `FileModal`
  - `harness/` folder shows badge: count of missing key files (prd.md, architecture.md, feature.md, claude.md)
  - "Refresh" button at top to re-read directory
  - Empty state when no project selected
- [ ] `src/components/HarnessManager/FileExplorer.module.css`
  - VS Code style: compact rows (24px), monospace font, hover highlight
  - Same dark theme as rest of app

### Layer 9 — FileModal Component
- [ ] Create `src/components/HarnessManager/FileModal.tsx`
  - Full-screen overlay (same pattern as DiffOverlay)
  - Header: file path + close button
  - Content: calls `read_file_content(path)`
  - `.md` files → render as markdown (use a lightweight parser or `<pre>` with basic bold/italic)
  - All other files → `<pre>` with line numbers, monospace
  - Max display: 1000 lines (truncated with note)
- [ ] `src/components/HarnessManager/FileModal.module.css`

### Layer 10 — ChatPanel Component
- [ ] Create `src/components/HarnessManager/ChatPanel.tsx`
  - Local state: `messages: ChatMessage[]` where `ChatMessage = { role: 'user'|'assistant', content: string, timestamp: string }`
  - Scrollable message list (auto-scroll on new message, same pattern as LogPanel)
  - User messages: right-aligned, accent-tinted bubble
  - Assistant messages: left-aligned, same purple-border bubble style as LogPanel `ClaudeBubble`
  - While Claude is responding: stream `harness_log_line` events into the current assistant message (append in place)
  - After `harness_done`: mark message complete, scroll to bottom
  - **Quick Action bar** (above input): 4 buttons
    - "📋 Write PRD" — pre-fills input with PRD starter prompt
    - "🏗 Architecture" — pre-fills architecture starter prompt
    - "✨ Feature Brief" — pre-fills feature.md starter prompt
    - "➕ New Task" — pre-fills structured task file prompt
  - **Input bar** (bottom):
    - Multi-line `<textarea>` (auto-resize up to 6 lines, Enter sends, Shift+Enter newline)
    - 📎 Attach file button → Tauri `openFolderPicker`-style file picker → appends `[file: /path]` to input
    - ▶ Send button (disabled when empty or Claude responding)
- [ ] `src/components/HarnessManager/ChatPanel.module.css`

### Layer 11 — Quick Action Prompts
- [ ] Define prompt templates as constants in `src/components/HarnessManager/prompts.ts`:
  - `PRD_STARTER` — instructs Claude to generate `harness/prd.md` for the active project
  - `ARCHITECTURE_STARTER` — instructs Claude to generate `harness/architecture.md`
  - `FEATURE_STARTER` — instructs Claude to generate `harness/feature.md`
  - `TASK_STARTER` — instructs Claude to create a structured task file following TASK-016 format
  - Each prompt includes: current date, project name, and a note about the expected file location

---

## Acceptance Criteria
- [ ] Clicking ☰ in the sidebar switches to Harness mode; clicking ⊞ restores Run mode
- [ ] In Harness mode, TopBar shows only window controls + project selector
- [ ] File explorer renders the full project tree with expand/collapse; harness/ shows missing-file badge
- [ ] Clicking a file opens a modal with its content; .md files render as markdown
- [ ] Chat sends user message to Claude, streams response line by line into the chat bubble
- [ ] File attachment appends `[file: /path]` to the input
- [ ] Quick action buttons pre-fill the input with the correct starter prompt
- [ ] Switching back to Run mode: all original controls reappear, chat state is preserved (doesn't reset)
- [ ] No crashes when no project is selected (empty states shown)

---

## Technical Notes
- The `harness_chat` Go action runs a **separate** Claude process from the task engine — they must not share state or block each other.
- File tree depth is capped at 6 and skips heavy directories to keep `read_directory` fast.
- Chat messages are kept in component-local state (not in AppContext) — they reset on page reload, which is acceptable for MVP.
- The draggable divider stores its position in `localStorage` so it persists across mode switches.
- `read_file_content` returns an error for binary files — handle gracefully with "Cannot display binary file" message in the modal.

---

## Files to Create
```
CREATE:
src/components/HarnessManager/HarnessManager.tsx
src/components/HarnessManager/HarnessManager.module.css
src/components/HarnessManager/FileExplorer.tsx
src/components/HarnessManager/FileExplorer.module.css
src/components/HarnessManager/FileModal.tsx
src/components/HarnessManager/FileModal.module.css
src/components/HarnessManager/ChatPanel.tsx
src/components/HarnessManager/ChatPanel.module.css
src/components/HarnessManager/prompts.ts
```

```
MODIFY:
src/context/types.ts          ← appMode state + SET_APP_MODE action
src/context/reducer.ts        ← handle SET_APP_MODE
src/components/Sidebar/Sidebar.tsx    ← interactive nav
src/components/TopBar/TopBar.tsx      ← mode-aware rendering
src/App.tsx                           ← HarnessManager slot
src/lib/ipc.ts                        ← new commands + actions
src/lib/events.ts                     ← onHarnessLogLine, onHarnessDone
src-tauri/src/commands.rs             ← read_directory, read_file_content
src-tauri/src/lib.rs                  ← register new commands
src-tauri/binaries/loom-engine/main.go       ← harness_chat action
src-tauri/binaries/loom-engine/ipc/emitter.go ← EmitHarnessLogLine
```

---

## UI Screens

**Harness mode layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│ ● ● ●  Loom Studio  [ProjectSelector]                           │  ← TopBar (slim)
├──┬──────────────────────────┬────────────────────────────────────┤
│⊞ │ ▼ harness/               │  💬 Chat                          │
│☰●│   📄 prd.md              │                                    │
│⎇ │   📄 architecture.md     │  [assistant bubble]                │
│  │   ▶ tasks/               │  [user bubble]                     │
│  │ ▶ src/                   │  [assistant bubble streaming...]   │
│  │ ▶ apps/                  │                                    │
│  │                          │  ──────────────────────────────    │
│  │                          │  [📋 PRD][🏗 Arch][✨ Feat][➕ Task]│
│  │                          │  ┌─────────────────────────────┐   │
│  │                          │  │ Ask Claude anything...  📎 ▶│   │
│  │                          │  └─────────────────────────────┘   │
└──┴──────────────────────────┴────────────────────────────────────┘
```

---

## Dependencies
- **Blocked by:** TASK-021 (GitControls in TopBar — must be hideable) ✅ done
- **Blocks:** —

---

## Claude Code Context
```
harness/claude.md
harness/tasks/Phase 8 — Harness Manager/TASK-022 — Harness Manager · Full Module.md
src/components/Sidebar/Sidebar.tsx
src/components/TopBar/TopBar.tsx
src/context/types.ts
src/context/reducer.ts
src/App.tsx
src-tauri/src/commands.rs
src-tauri/src/lib.rs
src-tauri/binaries/loom-engine/main.go
src-tauri/binaries/loom-engine/ipc/emitter.go
```

---

## Progress Log
| Date | Update |
|------|--------|
| 2026-04-26 | Task created — planned via conversation |

---

## Time Log
| Date | Hours | Note |
|------|-------|------|
| — | — | — |

---

## Review Notes
- **—**

# Loom — System Architecture
### Technical Architecture Document · v1.0 · April 2026

---

## 1. Overview

Loom is a native desktop application built on Tauri (Rust shell + React frontend) with a Go CLI core engine. It orchestrates Claude Code CLI as a managed child process, intercepts AI confirmation prompts in real time, and surfaces code diffs to the developer before any changes are written to disk.

```
┌─────────────────────────────────────────────────────────────┐
│                        Developer                            │
└─────────────────────────┬───────────────────────────────────┘
                          │ UI interaction
┌─────────────────────────▼───────────────────────────────────┐
│                   Tauri Shell (Rust)                        │
│         Native window · IPC bridge · File system API        │
├─────────────────────────────────────────────────────────────┤
│                   React Frontend (TS)                       │
│    Project selector · Task tabs · Log panel · Diff viewer   │
├─────────────────────────────────────────────────────────────┤
│                   Go CLI Core Engine                        │
│   Process manager · Prompt detector · Diff extractor        │
├──────────────┬──────────────────────┬───────────────────────┤
│ Claude Code  │      Git (local)     │   Local JSON Store    │
│    CLI       │                      │                       │
└──────────────┴──────────────────────┴───────────────────────┘
```

---

## 2. Technology Stack

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| Desktop shell | Tauri (Rust) | 2.x | Native window, OS integration, IPC |
| Frontend | React + TypeScript | 18.x | UI rendering, state management |
| Core engine | Go CLI | 1.22+ | Process orchestration, diff parsing |
| AI integration | Claude Code CLI | latest | Code generation and modification |
| Version control | Git | 2.x | Local commits, diff extraction |
| Storage | Local JSON | — | Projects, task state, preferences |
| Build tool | Vite | 5.x | Frontend bundling |
| Styling | CSS Modules | — | Scoped component styles |

---

## 3. Component Architecture

### 3.1 Tauri Shell (Rust)

The Tauri shell is the native OS layer. It owns:

- **Window management** — single-window application, frameless with custom titlebar
- **IPC bridge** — bidirectional message passing between React frontend and Go CLI via Tauri commands
- **File system access** — folder picker dialog, reading `harness/` directory contents
- **Process spawning** — launches the Go CLI engine as a sidecar
- **System tray** — optional background presence indicator

Tauri commands exposed to frontend:

```
open_folder_picker()         → string (selected path)
read_harness_tasks(path)     → Task[]
get_projects()               → Project[]
save_project(project)        → void
invoke_engine(command, args) → void
```

### 3.2 React Frontend (TypeScript)

The frontend is a single-page React application rendered inside the Tauri webview. It has no direct filesystem or process access — all system operations go through Tauri IPC commands.

#### Component Tree

```
<App>
├── <Sidebar>              # Nav icons: Dashboard, Tasks, Git, Settings
├── <TopBar>
│   ├── <ProjectSelector>  # Dropdown: saved projects + add new
│   ├── <TaskTabs>         # Active task tabs, add task button
│   └── <RunControls>      # Run/Pause button, Create PR button
├── <Workspace>
│   ├── <TaskDetailPanel>  # Left: ID, title, meta, description, steps
│   └── <LogPanel>         # Right: streaming terminal output (read-only)
├── <BottomBar>            # Custom prompt input, send, status pills
├── <TaskSelectModal>      # Task picker from harness/ folder
├── <ProjectDropdown>      # Project list and add new project
└── <DiffOverlay>          # Code diff review: file list + diff view + approve/reject
```

#### State Management

Global state is managed via React Context + useReducer. No external state library in MVP.

```typescript
interface AppState {
  projects: Project[];
  activeProject: Project | null;
  activeTasks: Task[];
  activeTaskIndex: number;
  engineStatus: 'idle' | 'running' | 'paused' | 'awaiting_approval';
  logLines: LogLine[];
  pendingDiff: DiffPayload | null;
}
```

Key state transitions:

```
idle → running       : User clicks Run
running → paused     : User clicks Pause
running → awaiting   : Engine detects Claude confirmation prompt
awaiting → running   : User clicks Apply Changes
awaiting → idle      : User clicks Reject
running → idle       : Task completes
```

#### Frontend ↔ Engine Communication

The frontend listens for events emitted by the Go engine via Tauri's event system:

```typescript
// Frontend listens
listen('log_line', (event) => appendLog(event.payload))
listen('diff_ready', (event) => showDiff(event.payload))
listen('task_complete', (event) => markTaskDone(event.payload))
listen('engine_error', (event) => handleError(event.payload))

// Frontend sends
invoke('engine_command', { action: 'start', taskId, prompt })
invoke('engine_command', { action: 'approve' })
invoke('engine_command', { action: 'reject' })
invoke('engine_command', { action: 'pause' })
```

### 3.3 Go CLI Core Engine

The Go engine is the operational heart of Loom. It runs as a Tauri sidecar process and manages all interactions with Claude Code CLI and Git.

#### Responsibilities

- Spawn and manage the Claude Code CLI child process
- Stream stdout/stderr line by line to the frontend
- Detect Claude's confirmation prompts in the output stream
- Extract the proposed diff from the working directory (git diff)
- Hold the process at the confirmation point until user decides
- Write the approval (`y`) or rejection (`n`) to Claude's stdin
- Execute git commit after approved changes
- Emit structured events back to the Tauri frontend

#### Engine Internal Structure

```
loom-engine/
├── main.go                 # Entry point, command router
├── process/
│   ├── manager.go          # Spawn, monitor, kill Claude CLI process
│   ├── streamer.go         # Line-by-line stdout/stderr streaming
│   └── detector.go         # Confirmation prompt pattern detection
├── diff/
│   ├── extractor.go        # Run git diff, parse output into DiffPayload
│   └── parser.go           # Parse unified diff into structured lines
├── git/
│   └── commit.go           # Stage and commit approved changes
├── task/
│   └── reader.go           # Parse .md task files from harness/ folder
├── store/
│   └── json.go             # Read/write local JSON state
└── ipc/
    └── emitter.go          # Emit events to Tauri frontend
```

#### Confirmation Prompt Detection

Claude Code CLI outputs a recognizable pattern when requesting user confirmation. The detector watches the stream for these patterns:

```go
var confirmationPatterns = []string{
    "Do you want to proceed?",
    "Apply this change?",
    "Continue with",
    "[y/n]",
    "[Y/n]",
}

func (d *Detector) IsConfirmation(line string) bool {
    for _, pattern := range confirmationPatterns {
        if strings.Contains(line, pattern) {
            return true
        }
    }
    return false
}
```

When a confirmation is detected:
1. Engine pauses reading stdin passthrough
2. Runs `git diff` to extract current proposed changes
3. Parses diff into structured `DiffPayload`
4. Emits `diff_ready` event to frontend
5. Blocks on a channel waiting for user decision
6. Writes `y\n` or `n\n` to Claude's stdin on decision

#### DiffPayload Structure

```go
type DiffPayload struct {
    SessionID string      `json:"session_id"`
    Files     []DiffFile  `json:"files"`
}

type DiffFile struct {
    Name     string     `json:"name"`
    Added    int        `json:"added"`
    Removed  int        `json:"removed"`
    Lines    []DiffLine `json:"lines"`
}

type DiffLine struct {
    LineNumber int    `json:"line_number"`
    Type       string `json:"type"`   // "add" | "rem" | "neutral"
    Content    string `json:"content"`
}
```

### 3.4 Task File Format

Tasks are `.md` files stored in `{project_root}/harness/`. Loom reads these files at task selection time.

#### Example Task File (`harness/VOID-1824-refactor-auth.md`)

```markdown
---
id: VOID-1824
title: Refactor Auth Middleware
type: feature
status: in-progress
due: 2026-04-14
---

## Description

Refactor the JWT authentication middleware to support refresh token
rotation and improve error handling across all protected routes.

## Steps

- [x] Analyze existing auth flow
- [x] Extract token validation logic
- [ ] Implement refresh token rotation
- [ ] Update route guards
- [ ] Write integration tests

## Prompt

Refactor the authentication middleware in `/src/auth/jwt.ts`.
Implement refresh token rotation using the existing token store.
Add proper error boundaries for expired and malformed tokens.
Ensure all protected routes use the updated middleware.
```

The `## Prompt` section is the static prompt sent to Claude Code CLI when the user clicks Run.

### 3.5 Local JSON Store

All persistent state is stored in a single JSON file at the OS user data directory.

**Location:**
```
macOS:   ~/Library/Application Support/loom/state.json
Linux:   ~/.config/loom/state.json
Windows: %APPDATA%\loom\state.json
```

**Schema:**

```json
{
  "version": 1,
  "projects": [
    {
      "id": "proj_abc123",
      "name": "Project Alpha",
      "path": "/Users/dev/alpha",
      "color": "#6c63ff",
      "added_at": "2026-04-01T10:00:00Z"
    }
  ],
  "active_project_id": "proj_abc123",
  "task_history": [
    {
      "task_id": "VOID-1824",
      "project_id": "proj_abc123",
      "status": "completed",
      "completed_at": "2026-04-13T14:25:32Z"
    }
  ],
  "preferences": {
    "theme": "dark",
    "log_autoscroll": true,
    "default_diff_view": "split"
  }
}
```

---

## 4. Data Flow

### 4.1 Task Execution Flow (Happy Path)

```
1. User selects project
   Frontend → Tauri IPC → reads harness/ folder → returns Task[]

2. User selects task in modal
   Frontend updates state → task tab added → task detail rendered

3. User clicks Run
   Frontend → invoke('engine_command', { action: 'start', task })
   Tauri → Go engine receives command
   Go engine → builds prompt string from task.md
   Go engine → spawns Claude Code CLI child process

4. Streaming begins
   Claude CLI → stdout → Go streamer → line-by-line
   Go emitter → emit('log_line', line) → Tauri → Frontend
   Frontend → appends to LogPanel

5. Claude requests confirmation
   Go detector → identifies confirmation pattern in stream
   Go diff extractor → runs `git diff` → parses output
   Go emitter → emit('diff_ready', DiffPayload) → Frontend
   Frontend → renders DiffOverlay with file list and diff lines
   Go engine → blocks on decision channel

6. User clicks Apply Changes
   Frontend → invoke('engine_command', { action: 'approve' })
   Go engine → writes 'y\n' to Claude stdin → unblocks
   Claude continues → finishes task
   Go git → stages and commits changes locally
   Go emitter → emit('task_complete') → Frontend
   Frontend → marks task as completed

7. User clicks Reject
   Frontend → invoke('engine_command', { action: 'reject' })
   Go engine → writes 'n\n' to Claude stdin
   Go engine → runs `git checkout .` to revert working directory
   Go emitter → emit('log_line', 'Changes rejected. Reverted.')
   Frontend → closes DiffOverlay, task remains in-progress
```

### 4.2 Multiple Confirmation Prompts

If Claude requests confirmation more than once in a single task (e.g., multiple files changed in sequence), each prompt triggers a new diff cycle:

```
Confirmation 1 → Diff shown → Approved → Claude continues
Confirmation 2 → Diff shown → Approved → Claude continues
...
Task complete
```

Confirmations are handled sequentially. There is no queue — each diff must be resolved before Claude proceeds.

---

## 5. Process Management

### 5.1 Claude CLI Process Lifecycle

```
State: IDLE
  ↓ start command received
State: SPAWNING
  ↓ process started
State: RUNNING (streaming stdout)
  ↓ confirmation pattern detected
State: AWAITING_APPROVAL (stdin blocked)
  ↓ approve / reject received
State: RUNNING (resumed)
  ↓ process exits 0
State: COMPLETED
```

Error states:
- Process exits non-zero → `engine_error` event emitted, state → `IDLE`
- User pauses → SIGSTOP sent to process, state → `PAUSED`
- User resumes → SIGCONT sent, state → `RUNNING`

### 5.2 Process Isolation

Each task run spawns a fresh Claude Code CLI process. There is no persistent Claude process between runs. This ensures:

- Clean state for each task
- No cross-task context contamination
- Predictable resource usage

---

## 6. File System Conventions

```
{project_root}/
├── harness/                  # Loom task files (created by developer)
│   ├── VOID-1824-auth.md
│   ├── VOID-1025-vectors.md
│   └── VOID-1034-secrets.md
├── src/                      # Project source (untouched by Loom directly)
└── ...

{loom_app_data}/
├── state.json                # Projects, preferences, task history
└── logs/
    └── {session_id}.log      # Per-session execution logs (optional)
```

---

## 7. Security Model

| Concern | Approach |
|---------|----------|
| Code execution | All execution is local — no remote code runners |
| External data | No source code sent externally except via Claude's own API |
| Pre-apply review | All changes shown in diff before written to disk |
| Revert guarantee | Reject action runs `git checkout .` — no partial writes |
| Credential storage | No credentials stored by Loom — Claude CLI manages its own auth |
| IPC security | Tauri IPC is sandboxed — frontend cannot invoke arbitrary shell commands |
| File access | Frontend has no direct filesystem access — all reads go through Tauri commands |

---

## 8. Error Handling

| Error | Detection | Response |
|-------|-----------|----------|
| Claude CLI not installed | Engine startup check | Emit error event, show install guide in UI |
| Git not installed | Engine startup check | Emit error event, show install guide in UI |
| `harness/` folder missing | Task reader | Show empty state with setup instructions |
| Claude exits non-zero | Process monitor | Log error lines, reset to idle state |
| Diff extraction fails | Git diff runner | Show error in diff panel, offer retry or skip |
| User prompt timeout | N/A (no timeout in MVP) | User must explicitly approve or reject |
| JSON store corruption | Store reader | Reset to defaults, log warning |

---

## 9. Build & Distribution

### Development

```bash
# Install dependencies
npm install          # Frontend
go mod download      # Engine

# Run in dev mode
npm run tauri dev    # Starts Vite + Tauri dev window
go run ./engine      # Engine (started automatically by Tauri sidecar config)
```

### Production Build

```bash
npm run tauri build  # Produces platform-specific installer
```

Output artifacts:
- **macOS:** `Loom.app` + `.dmg`
- **Linux:** `.AppImage` + `.deb`
- **Windows:** `.exe` installer

### Sidecar Configuration (`tauri.conf.json`)

```json
{
  "tauri": {
    "bundle": {
      "externalBin": ["binaries/loom-engine"]
    }
  }
}
```

The Go engine binary is bundled as a Tauri external binary (sidecar). It is spawned automatically by the Tauri shell on app start.

---

## 10. Phase 2 Architecture Additions

The following components are out of scope for Phase 1 but are accounted for in the architecture design to avoid rework.

| Addition | Impact |
|----------|--------|
| GitHub PR creation | Add `gh` CLI wrapper in Go engine; new IPC command `create_pr` |
| Test automation | Post-approval hook in task completion flow; run test command, emit results |
| Multi-task queue | Engine gains a task queue; confirmations serialized per task |
| AI explanation panel | Claude prompted for explanation after each change; displayed alongside diff |
| Risk detection | Diff analyzer scores changes by type/size; score shown in diff footer |
| Team shared harness | `harness/` synced via Git or shared network path; no new Loom infrastructure needed |

---

*This document describes the Phase 1 MVP architecture. All interfaces are internal and subject to change before public release.*

# Loom — AI-Powered Development Workflow Engine
### Product Requirements Document · v1.0 · April 2026

---

## 1. Overview

**Product Name:** Loom  
**Type:** Native Developer Workflow Tool  
**Platform:** Desktop (Tauri + Go CLI)  
**Status:** Phase 1 — MVP

### Problem

Modern development is fragmented. Developers switch constantly between editor, terminal, Git tools, and AI assistants. AI coding tools like Claude Code CLI lack structured visibility and control. There is no unified workflow from task intake through code generation, validation, and approval.

### Solution

Loom provides a single lightweight native interface to execute development tasks using AI, visualize all code changes in real time, and control approvals before anything is applied to the codebase.

> **Core Philosophy:** Developers should control AI — not blindly trust it.

---

## 2. Goals

### Primary Goals

- Create a controlled, auditable AI development loop
- Reduce reliance on heavy IDE workflows
- Improve developer trust in AI-generated code through transparency

### Success Metrics

| Metric | Target |
|--------|--------|
| Time to complete a task | Reduced by 30% |
| Visibility of AI-generated changes | 100% — every change shown before apply |
| Manual coding effort | Measurably reduced |
| Developer confidence in AI output | Increased (qualitative) |

---

## 3. Target Users

**Primary**
- Backend developers (Node.js, APIs)
- Full-stack developers
- AI-assisted developers

**Secondary**
- Tech leads reviewing AI output
- Indie developers working solo

---

## 4. Core Concept

Loom is built around a single controlled loop:

```
Select Project → Select Task → Run AI → Intercept Diff → Approve / Reject → Complete
```

This loop is the entire product experience. Every feature supports one of these steps.

### Key Clarification: Real-Time Diff Interception

The diff view is **not** a post-execution review. When Claude Code CLI prompts for a yes/no confirmation during execution, Loom intercepts that moment and surfaces a structured diff panel. The user reviews proposed changes and decides — Claude continues or reverts based on the decision. This is a true pre-apply review model.

---

## 5. Task System

### Task Source

Tasks are `.md` files stored in a `harness/` subfolder within the selected project directory. Loom reads this folder to populate the task list. No backend is required.

### Task File Format

Each `.md` file represents one task and contains:

- Task ID (e.g., `VOID-1824`)
- Title
- Type (feature, perf, security, test, design)
- Status (pending, in-progress, completed)
- Due date
- Description
- Step list with completion states

### Task Selection Flow

1. User opens the task modal from the top bar
2. Modal reads all `.md` files from `harness/` in the active project
3. Tasks display with ID, name, status badge, and due date
4. User selects a task and clicks "Assign Task"
5. Task appears as a tab in the top bar and loads in the left detail panel

---

## 6. Phase 1 Scope (MVP)

### 6.1 Project Selection

Users select a local project directory. Loom stores recently used projects and displays the active project in the top bar.

Requirements:
- Folder picker to select project root
- Store project path locally (JSON)
- Display active project name with status indicator
- Support switching between multiple saved projects

### 6.2 Task Selection

Users pick a task loaded from the `harness/` folder.

Requirements:
- Read `.md` files from `{project}/harness/`
- Display task list in modal with filters (by status, assignee)
- Task tabs appear in top bar after selection
- Task details load in left panel (ID, title, type, description, step list)

### 6.3 AI Task Execution

Execute the selected task via Claude Code CLI with a static prompt constructed from the task `.md` content.

Flow:
```
User clicks "Run" → Static prompt built from task .md → Claude Code CLI invoked
→ Output streamed to log panel → Claude prompts for confirmation
→ Loom intercepts → Diff panel opens → User approves or rejects
→ Claude continues or reverts
```

Requirements:
- Construct and dispatch CLI command with task prompt
- Stream stdout/stderr to the log panel in real time
- Detect Claude's yes/no confirmation prompts
- Surface diff panel at confirmation moment (not after)
- Pass user decision back to Claude process

### 6.4 Execution Log Panel

Real-time terminal-style log view (read-only).

Requirements:
- Auto-scrolling log output
- Timestamped lines with level labels: INFO, SUCCESS, WARN, ERROR, PASS
- Color coding: green for success, red for errors, amber for warnings
- Command lines visually distinct from log output
- Live indicator when task is running

### 6.5 Code Diff Viewer (Core Feature)

Show AI-proposed changes at the moment Claude requests confirmation — before any changes are written.

Requirements:
- File list panel (left): lists all modified files with added/removed line counts
- Diff code panel (right): inline unified diff view with syntax highlighting
- Added lines highlighted green, removed lines highlighted red with strikethrough
- Switch between files in the file list
- Split view and Unified view toggle
- Build status indicator (pass/fail) shown in diff footer

### 6.6 Approval System

The user decides whether to apply Claude's proposed changes.

**Approve (Apply Changes):**
- Write changes to disk
- Commit locally with auto-generated message
- Mark task steps as completed
- Resume Claude execution if more steps remain

**Reject:**
- Discard proposed changes
- Revert to prior state
- Log rejection event in terminal
- Claude stops current action

### 6.7 Task Completion

After approval of final changes, the task is marked complete.

Requirements:
- Update task status to "Completed" in the tab and detail panel
- All task steps marked done
- Success state visible in UI
- Task remains accessible in top bar tabs for reference

---

## 7. UI/UX Requirements

### Layout Structure

```
┌──────────────────────────────────────────────────────┐
│  [LOOM]  [Project ▾]  [Task Tab] [Task Tab] [+ Task] │  ← Top Bar
├──────┬───────────────────────────────────────────────┤
│      │  Left Panel          │  Right Panel            │
│ Side │  Task Details        │  Execution Log          │
│ bar  │  - ID & breadcrumb   │  (Terminal, read-only)  │
│      │  - Title & meta      │                         │
│      │  - Description       │                         │
│      │  - Step list         │                         │
├──────┴───────────────────────────────────────────────┤
│  [Prompt input ___________________] [Send] [Status]  │  ← Bottom Bar
└──────────────────────────────────────────────────────┘
```

**Sidebar:** Dashboard, Tasks, Git (future), Settings  
**Top Bar:** Project selector, task tabs, Run/Pause button, Create PR button  
**Left Panel:** Task detail view with step tracker  
**Right Panel:** Live log terminal (read-only)  
**Bottom Bar:** Custom prompt input, send button, status pills

### Diff Screen (Modal Overlay)

```
┌────────────────────────────────────────────────┐
│  AI Code Proposal   [Split View] [Unified]  [×]│
├──────────┬─────────────────────────────────────┤
│ Files    │  Diff Code View                     │
│ index.ts │  11  - const result = response...   │
│ utils.js │  11  + const result = await resp... │
│ README   │  12  - console.log(result)           │
│          │  12  + if (!response.ok) throw...    │
├──────────┴─────────────────────────────────────┤
│  [Apply these changes to index.ts]  [Build ✓]  │
│                      [Reject]  [Apply Changes] │
└────────────────────────────────────────────────┘
```

### Design Principles

- Dark theme (VS Code-inspired, not a clone)
- Minimal and distraction-free — the diff is the focus
- Developer-first layout — every element earns its space
- High readability with monospace for code, clean sans-serif for UI
- Status always visible (task state, AI state, build state)

---

## 8. Technical Architecture

| Layer | Technology |
|-------|------------|
| Frontend | Tauri + React |
| Core engine | Go CLI |
| AI integration | Claude Code CLI |
| Version control | Git (local) |
| Data storage | Local JSON (MVP) |

### Process Model

Loom spawns Claude Code CLI as a child process. It streams stdout line by line into the log panel. When a confirmation prompt is detected in the output stream, Loom pauses stdin, reads the proposed diff from the working directory, and opens the diff panel. On user decision, Loom writes `y\n` or `n\n` to stdin and resumes the process.

---

## 9. Security Considerations

- All code execution happens locally — no remote execution
- No source code is sent externally except via Claude's own API calls
- File modifications are staged for review before being written
- Reject action guarantees no changes are persisted
- Local JSON storage only — no cloud sync in Phase 1

---

## 10. Out of Scope (Phase 1)

- GitHub PR creation (Phase 2)
- Multi-project parallel execution
- Team collaboration or shared task lists
- AI explanation panel
- Performance analytics or dashboards
- Cloud sync or remote storage
- Test automation triggers

---

## 11. Future Roadmap

### Phase 2
- PR creation and GitHub integration
- Test automation on task completion
- Multi-task execution queue

### Phase 3
- AI explanation panel (why Claude made each change)
- Risk detection and change scoring
- Performance validation hooks

### Phase 4
- Multi-project orchestration
- Team workflows and shared harness folders
- CI/CD pipeline integration

---

## 12. Key Differentiation

| Feature | Loom | Traditional Tools | AI Coding Assistants |
|---------|------|-------------------|----------------------|
| Controlled AI execution loop | ✅ | ❌ | ❌ |
| Real-time diff interception | ✅ | ❌ | ❌ |
| Approve/reject before apply | ✅ | ❌ | ❌ |
| Task-first development | ✅ | ❌ | ❌ |
| Lightweight native app | ✅ | ❌ | ❌ |
| No IDE dependency | ✅ | ❌ | Partial |

---

## 13. Glossary

**harness/** — the folder within a project that contains `.md` task files read by Loom  
**diff interception** — the moment Loom pauses Claude's process to show proposed changes  
**task tab** — a pinned task in the top bar representing an active or recently run task  
**approval** — user action that writes Claude's proposed changes to disk and commits locally  
**rejection** — user action that discards Claude's proposed changes and reverts state

---

*Loom is not a code editor. It is not a task manager. It is a controlled AI execution engine for software development.*

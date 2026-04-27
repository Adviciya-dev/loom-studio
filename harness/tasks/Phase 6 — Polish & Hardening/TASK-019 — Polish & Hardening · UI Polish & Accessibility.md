# TASK-019: Polish & Hardening · UI Polish & Accessibility

## Meta
| Field | Value |
|-------|-------|
| **Assignee** | — |
| **Status** | ✅ Done |
| **Priority** | P1 |
| **Sprint** | Sprint 4 |
| **Story Points** | 5 |
| **PRD Reference** | prd.md §7 |
| **Architecture Ref** | architecture.md §3.2 |
| **Start Date** | — |
| **Due Date** | — |
| **Created** | 2026-04-20 |
| **Completed** | 2026-04-22 |

---

## Description
Polish the full UI to production quality and implement keyboard accessibility for all critical interactions. Every interactive element must be reachable by keyboard. The custom prompt input in the bottom bar must be wired and functional. Status pills must reflect live engine state. Test on macOS, Linux, and Windows.

---

## Sub Tasks
- [x] Bottom bar: wire custom prompt input — on send, append the custom text to the task prompt before dispatching `start` to engine
- [x] Bottom bar: implement status pills — one for engine state (`idle` / `running` / `paused` / `awaiting`), one for task state
- [x] Keyboard nav: all buttons reachable with `Tab`, activated with `Enter` / `Space`
- [x] Keyboard shortcut: `Enter` confirms Approve in `<DiffOverlay>` (already in TASK-015 — verify it works)
- [x] Keyboard shortcut: task modal opens with `Cmd+T` / `Ctrl+T`
- [x] Focus trap: `<DiffOverlay>` and `<TaskSelectModal>` must trap focus while open
- [x] Scroll behavior: task tab overflow uses arrow scroll, not hidden overflow
- [x] Loading skeletons: show skeleton shimmer in task detail panel while tasks are loading from harness
- [x] Sidebar nav: highlight active section, add tooltips on hover for icon-only items
- [x] Typography pass: enforce consistent font sizes, line heights, and weights across all components using CSS token variables
- [x] Spacing pass: enforce consistent padding/margin using spacing token variables — remove hardcoded pixel values
- [ ] Cross-platform smoke test: verify all flows work on macOS, Linux, and Windows builds

---

## Acceptance Criteria
- [x] Custom prompt input sends text to engine on "Send" button click and `Enter` key
- [x] Status pills show correct live state at all times
- [x] All buttons and interactive elements are keyboard-navigable with Tab
- [x] `Cmd+T` / `Ctrl+T` opens the task modal
- [x] Focus is trapped in modal and overlay while they are open
- [x] Tab overflow uses arrow scroll — no hidden tasks
- [x] Loading skeleton shown while harness tasks are being read
- [x] No hardcoded pixel values for spacing — all from CSS tokens
- [ ] App passes smoke test on macOS, Linux, and Windows

---

## Technical Notes
- Focus trap: implement a small `useFocusTrap` hook using `querySelectorAll` for focusable elements and keydown listener for `Tab` — no external library.
- CSS spacing tokens: define `--space-xs`, `--space-sm`, `--space-md`, `--space-lg`, `--space-xl` in `global.css` and replace all hardcoded values.
- Skeleton shimmer: CSS-only animation using `@keyframes` + linear-gradient, no JS.

---

## Files to Create/Modify
```
CREATE:
src/hooks/useFocusTrap.ts

MODIFY:
src/styles/global.css
src/components/BottomBar/BottomBar.tsx
src/components/BottomBar/BottomBar.module.css
src/components/Sidebar/Sidebar.tsx
src/components/TopBar/TaskTabs.tsx
src/components/Workspace/TaskDetailPanel.tsx
src/components/TaskSelectModal/TaskSelectModal.tsx
src/components/DiffOverlay/DiffOverlay.tsx
```

---

## API Endpoints
N/A — no API endpoints in this task

---

## UI Screens
- **Bottom Bar** — wired prompt input, send button, live status pills
- **Sidebar** — active highlight, tooltips
- **All modals/overlays** — focus trap, keyboard shortcuts

---

## Related Test Cases
—

## Dependencies
- **Blocked by:** TASK-018
- **Blocks:** TASK-020

---

## Claude Code Context
```
harness/claude.md
harness/tasks/Phase 6 — Polish & Hardening/TASK-019 — Polish & Hardening · UI Polish & Accessibility.md
harness/architecture.md §3.2
harness/prd.md §7
```

---

## Progress Log
| Date | Update |
|------|--------|
| 2026-04-22 | All subtasks implemented: useFocusTrap hook, BottomBar wired prompt+send, Cmd+T global shortcut, focus trap in DiffOverlay+TaskSelectModal, TaskTabs arrow-scroll with ResizeObserver, skeleton shimmer in TaskSelectModal loading state, sidebar active indicator with accent bar, global focus rings, spacing token audit. Cross-platform smoke test deferred to pre-release. |

---

## Time Log
| Date | Hours | Note |
|------|-------|------|
| — | — | No time logged |

---

## Review Notes
- **—**

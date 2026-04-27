# TASK-012: Diff Interception · Confirmation Prompt Detector

## Meta
| Field | Value |
|-------|-------|
| **Assignee** | — |
| **Status** | ✅ Done |
| **Priority** | P0 |
| **Sprint** | Sprint 3 |
| **Story Points** | 3 |
| **PRD Reference** | prd.md §4, §6.3 |
| **Architecture Ref** | architecture.md §3.3 |
| **Start Date** | — |
| **Due Date** | — |
| **Created** | 2026-04-20 |
| **Completed** | 2026-04-21 |

---

## Description
Implement the confirmation prompt detector (`process/detector.go`) in the Go engine. This component watches the Claude Code CLI stdout stream for patterns that indicate Claude is requesting user confirmation before applying changes. When detected, the engine must pause stdin passthrough and signal the diff extraction pipeline to begin.

---

## Sub Tasks
- [x] Define `confirmationPatterns []string` — initial set of known Claude confirmation strings
- [x] Implement `Detector.IsConfirmation(line string) bool` — returns true if line matches any pattern
- [x] Integrate detector into the streamer loop: check each line after emitting it as a `log_line`
- [x] On confirmation detected: set engine state to `awaiting_approval`
- [x] Pause stdin passthrough (block the channel) — do not write anything to Claude's stdin yet
- [x] Signal the diff extractor to run (channel or function call)
- [x] Make patterns configurable via a config field — not hardcoded only — so users can add patterns later
- [x] Write unit tests for `IsConfirmation`: true positives for all known patterns, false positives test for normal log lines

---

## Acceptance Criteria
- [x] `IsConfirmation` returns `true` for all known Claude confirmation patterns
- [x] `IsConfirmation` returns `false` for normal log output lines
- [x] On detection: engine state transitions to `awaiting_approval`
- [x] Stdin passthrough is blocked — Claude does not proceed until a decision is made
- [x] Diff extraction is triggered immediately after detection
- [x] Unit tests pass for all pattern variants

---

## Technical Notes
- Known patterns to detect (initial set): `"Do you want to proceed?"`, `"Apply this change?"`, `"Continue with"`, `"[y/n]"`, `"[Y/n]"`.
- The detector must not false-positive on normal log output. Add negative test cases for common log lines.
- Detection happens in the streamer goroutine — keep it non-blocking. Signal downstream via a `chan struct{}`.

---

## Files to Create/Modify
```
CREATE/MODIFY:
src-tauri/binaries/loom-engine/process/detector.go
src-tauri/binaries/loom-engine/process/detector_test.go
src-tauri/binaries/loom-engine/process/streamer.go
```

---

## API Endpoints
N/A — no API endpoints in this task

---

## UI Screens
- **—**

---

## Related Test Cases
- `process/detector_test.go` — true positive patterns, false positive guard, all known variants

## Dependencies
- **Blocked by:** TASK-009, TASK-010
- **Blocks:** TASK-013

---

## Claude Code Context
```
harness/claude.md
harness/tasks/Phase 4 — Diff Interception/TASK-012 — Diff Interception · Confirmation Prompt Detector.md
harness/architecture.md §3.3
harness/prd.md §4, §6.3
```

---

## Progress Log
| Date | Update |
|------|--------|
| 2026-04-21 | Implemented AddPattern/Patterns on Detector; wired streamer with confirmCh/resumeCh blocking; manager now creates stdin pipe, handles confirmations in runConfirmationHandler, exposes Approve/Reject; approve/reject cases added to main.go; 4 unit tests all pass. |

---

## Time Log
| Date | Hours | Note |
|------|-------|------|
| — | — | No time logged |

---

## Review Notes
- **—**

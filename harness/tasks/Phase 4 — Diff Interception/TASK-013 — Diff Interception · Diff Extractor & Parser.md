# TASK-013: Diff Interception · Diff Extractor & Parser

## Meta
| Field | Value |
|-------|-------|
| **Assignee** | — |
| **Status** | ✅ Done |
| **Priority** | P0 |
| **Sprint** | Sprint 3 |
| **Story Points** | 5 |
| **PRD Reference** | prd.md §6.5 |
| **Architecture Ref** | architecture.md §3.3 |
| **Start Date** | — |
| **Due Date** | — |
| **Created** | 2026-04-20 |
| **Completed** | 2026-04-21 |

---

## Description
Implement the diff extractor (`diff/extractor.go`) and diff parser (`diff/parser.go`) in the Go engine. When a confirmation prompt is detected, the extractor runs `git diff` in the project directory and the parser converts the raw unified diff output into a structured `DiffPayload` that the frontend can render. The payload is then emitted to the frontend via the IPC emitter.

---

## Sub Tasks
- [x] Implement `diff.Extract(projectPath string) (string, error)` — run `git diff` and return raw output
- [x] Handle case where `git diff` returns empty string (no changes) — emit warning, do not crash
- [x] Implement `diff.Parse(rawDiff string) (DiffPayload, error)` — parse unified diff into structured payload
- [x] Parser: extract per-file sections, count added/removed lines, parse each diff line into `DiffLine{LineNumber, Type, Content}`
- [x] `DiffLine.Type`: `"add"` for `+` lines, `"rem"` for `-` lines, `"neutral"` for context lines
- [x] Populate `DiffPayload.SessionID` from the current engine session UUID
- [x] On successful parse: call `ipc.Emitter.EmitDiffReady(payload)`
- [x] On extraction failure: call `ipc.Emitter.EmitEngineError("diff extraction failed: ...")`, keep engine in `awaiting_approval` state so user can retry or reject
- [x] Write unit tests for `Parse` with real unified diff fixtures (add, remove, mixed, multi-file)

---

## Acceptance Criteria
- [x] `diff.Extract()` returns the raw `git diff` output from the project directory
- [x] `diff.Parse()` correctly identifies all changed files
- [x] Added lines have `Type: "add"`, removed lines `Type: "rem"`, context lines `Type: "neutral"`
- [x] `DiffFile.Added` and `DiffFile.Removed` counts are accurate
- [x] Empty diff (no changes) is handled gracefully — warning emitted, no crash
- [x] Multi-file diffs produce one `DiffFile` entry per file
- [x] `diff_ready` event received in frontend with correct `DiffPayload` structure
- [x] Unit tests pass for add-only, remove-only, mixed, and multi-file diff fixtures

---

## Technical Notes
- Run `git diff` without `--cached` — Claude's changes are in the working tree, not staged.
- Use `exec.Command("git", "diff")` with `Dir` set to `projectPath`.
- Do not use a third-party diff library — parse the unified diff format manually (it is stable and well-documented).
- Line numbers: parse from the `@@ -a,b +c,d @@` hunk header to track current line numbers.

---

## Files to Create/Modify
```
CREATE:
src-tauri/binaries/loom-engine/diff/extractor.go
src-tauri/binaries/loom-engine/diff/parser.go
src-tauri/binaries/loom-engine/diff/parser_test.go
src-tauri/binaries/loom-engine/diff/types.go
src-tauri/binaries/loom-engine/diff/testdata/add_only.diff
src-tauri/binaries/loom-engine/diff/testdata/remove_only.diff
src-tauri/binaries/loom-engine/diff/testdata/mixed_multifile.diff
```

---

## API Endpoints
N/A — no API endpoints in this task

---

## UI Screens
- **—**

---

## Related Test Cases
- `diff/parser_test.go` — add-only, remove-only, mixed, multi-file, empty diff fixtures

## Dependencies
- **Blocked by:** TASK-012
- **Blocks:** TASK-014

---

## Claude Code Context
```
harness/claude.md
harness/tasks/Phase 4 — Diff Interception/TASK-013 — Diff Interception · Diff Extractor & Parser.md
harness/architecture.md §3.3
harness/prd.md §6.5
```

---

## Progress Log
| Date | Update |
|------|--------|
| 2026-04-21 | Created diff/types.go; rewrote parser.go with full unified-diff parsing (per-file sections, hunk line numbers, +/-/context types, new/deleted file handling); ErrNoDiff sentinel in extractor; manager updated with session ID + error handling; 9 parser tests + 4 parseHunk tests all pass. |

---

## Time Log
| Date | Hours | Note |
|------|-------|------|
| — | — | No time logged |

---

## Review Notes
- **—**

# TASK-025: QA Test Suite · Rework generate_and_run_test

## Meta
| Field | Value |
|-------|-------|
| **Assignee** | — |
| **Status** | 📋 To Do |
| **Priority** | P1 |
| **Sprint** | Sprint 7 |
| **Story Points** | 8 |
| **PRD Reference** | harness/QA-AUTOMATION-TOOL-ARCHITECTURE.md |
| **Architecture Ref** | architecture.md |
| **Start Date** | — |
| **Due Date** | — |
| **Created** | 2026-05-09 |
| **Completed** | — |

---

## Description

The current `generate_and_run_test` engine action sends one monolithic 5-phase prompt to
Claude and expects it to classify the test, check servers, write the Playwright spec, run
it, diagnose failures, and output structured markers — all in a single 15-minute call.
In practice, one failing phase corrupts the others. Additionally the test case "Linked Task"
field (e.g. `TASK-005`) is never read, so Claude has no knowledge of the feature it is
testing — it cannot reference acceptance criteria or implementation details when writing
assertions.

Rework into a clean four-phase Go-orchestrated pipeline: Go handles file reading and npx
invocations; Claude is called twice with focused, bounded contracts (generate spec only;
then diagnose only). Bug reports are created only for confirmed application [BUG]
classifications — not for environment failures or test script errors.

---

## Sub Tasks

### Layer 1 — Rust: parse `Linked Task` field from test case Meta
- [ ] In `src-tauri/src/commands.rs` `parse_test_case_md()`, add `linked_task` local var
- [ ] Add `"linked task" => linked_task = val` to the Meta table match arm
- [ ] Insert `linked_task` into the returned HashMap at the end of the function

### Layer 2 — TypeScript: add `linked_task` to TestCase interface
- [ ] In `src/types/index.ts`, add `linked_task: string` to the `TestCase` interface

### Layer 3 — Frontend: pass `linked_task` in engine command
- [ ] In `src/components/QATestSuite/QATestSuite.tsx` `handleGenerateAndRun`,
  add `linked_task: selectedTc.linked_task` to the `engineCommand` payload

### Layer 4 — Go task package: export `GetLinkedTaskContent`
- [ ] In `src-tauri/binaries/loom-engine/task/reader.go`, add exported function
  `GetLinkedTaskContent(projectPath, taskID string) string` that calls `findTaskFile`
  and returns the raw file bytes as a string (empty string if not found)

### Layer 5 — Go engine: rework `generateAndRunTest` into four phases
- [ ] Phase A: pre-check — `exec.LookPath(npxBin())`, abort with engine_error if missing
- [ ] Read test case + linked task content before any Claude call
- [ ] Phase B: generate — `buildGenerationPrompt()`, Claude call #1 (streamed, 5 min),
  detect `LOOM:GENERATED` marker, abort if absent
- [ ] Phase C: run — `runGeneratedTest()` using `streamCmd` (npx direct, 3 min)
- [ ] `classifyFailure(output string) string` — fast Go string matching for ENV/TEST/BUG
- [ ] Phase D: diagnose — `buildDiagnosisPrompt()`, Claude call #2 (non-streamed, 90 s),
  only invoked for BUG classification
- [ ] ENV/TEST failures: log informative message, no bug report
- [ ] BUG failures: call `createBugReport` with structured failure details
- [ ] Wire context cancellation (stop button) across all phases via shared ctx
- [ ] Update `case "generate_and_run_test":` to parse and pass `linkedTaskID`

---

## Acceptance Criteria
- [ ] Test cases with `| **Linked Task** | TASK-XXX |` include the task spec in the
  generation prompt; Claude references the feature's acceptance criteria when writing assertions
- [ ] Phase B streams live to the Output panel — user sees Claude writing the spec file in real time
- [ ] After generation, Go runs `npx playwright test` directly without another Claude call
- [ ] `ECONNREFUSED` / `ERR_CONNECTION_REFUSED` → classified ENV → informative log, no bug file
- [ ] `Cannot find module` / `SyntaxError` → classified TEST → informative log, no bug file
- [ ] Wrong status codes / response body mismatches → classified BUG → `harness/bugs/BUG-NNN.md`
  created with Category, Root cause, Expected, Actual in the structured block
- [ ] Stop button correctly cancels the in-progress phase
- [ ] Test case file is patched with result (pass/fail + timestamp + Test Run History row)

---

## Technical Notes
- IPC event names unchanged: `test_status`, `engine_status`, `log_line`
- Phase B: `claude --dangerously-skip-permissions --print --verbose --output-format stream-json`
  with 5-minute context timeout; stream via `process.NewStreamer(tee, stderr).Stream(emitter)`
- Phase D: `claude --print --output-format stream-json` with 90 s timeout;
  use `cmd.Output()` (not streamed); parse with existing `extractFailureDetails`
- `classifyFailure` runs before Phase D — avoids a Claude call for trivially diagnosable env errors
- `runGeneratedTest` is a thin wrapper around the existing `streamCmd` helper
- `GetLinkedTaskContent` reuses the already-tested `findTaskFile` walk — no new directory walking

---

## Files to Create/Modify

```
CREATE:
- harness/tasks/Phase 10 — QA Test Suite/TASK-025 — QA Test Suite · Rework generate_and_run_test.md

MODIFY:
- src-tauri/src/commands.rs
- src/types/index.ts
- src/components/QATestSuite/QATestSuite.tsx
- src-tauri/binaries/loom-engine/task/reader.go
- src-tauri/binaries/loom-engine/main.go
```

---

## Claude Code Context

```
harness/claude.md
harness/tasks/Phase 10 — QA Test Suite/TASK-025 — QA Test Suite · Rework generate_and_run_test.md
src-tauri/src/commands.rs
src/types/index.ts
src/components/QATestSuite/QATestSuite.tsx
src-tauri/binaries/loom-engine/task/reader.go
src-tauri/binaries/loom-engine/main.go
src-tauri/binaries/loom-engine/process/streamer.go
src-tauri/binaries/loom-engine/ipc/emitter.go
```

---

## Dependencies
- **Blocked by:** TASK-024 (QA Test Suite base implementation) ✅
- **Blocks:** —

---

## Progress Log
| Date | Update |
|------|--------|
| 2026-05-09 | Task created — rework of QA generate_and_run_test pipeline |

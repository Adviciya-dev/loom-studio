# TASK-024: QA Test Suite · Test Case Manager

## Meta
| Field | Value |
|-------|-------|
| **Assignee** | — |
| **Status** | 📋 To Do |
| **Priority** | P1 |
| **Sprint** | Sprint 7 |
| **Story Points** | 13 |
| **PRD Reference** | harness/QA-AUTOMATION-TOOL-ARCHITECTURE.md |
| **Architecture Ref** | architecture.md |
| **Start Date** | — |
| **Due Date** | — |
| **Created** | 2026-05-03 |
| **Completed** | — |

---

## Description

Implement the **QA & Testing** tab (the `🧪 FlaskConical` sidebar icon, `appMode === 'qa'`) which currently shows a "coming soon" placeholder.

Users write test cases as Markdown files inside `harness/test_cases/` of their project. This feature scans that folder, parses each file into a structured `TestCase` object, and presents a test management UI — list view, per-test status badges, "Run All" / per-test run buttons, and a results report after execution.

Test execution is handled by the existing Go engine which spawns Playwright. The frontend receives live `test_status` events for real-time badge updates.

---

## Sub Tasks

### Layer 1 — Test Case File Format
Define the canonical Markdown schema for test case files in `harness/test_cases/`.

Each file (e.g. `TC-SMOKE-001.md`) must have:
```markdown
# TC-SMOKE-001: Login page loads with visible form

## Meta
| Field | Value |
|-------|-------|
| **Type** | Smoke |
| **Priority** | P0 |
| **Automated** | Yes |

## Steps
1. Navigate to /login
2. Inspect the page

## Expected Result
Login form is visible with email and password fields.
```

- [ ] Create `harness/test_cases/TC-SMOKE-001.md` as a sample/reference file using the format above
- [ ] Document the schema in `harness/test_cases/overview.md`

---

### Layer 2 — Tauri Backend: Read Test Cases
Add a new Rust command in `src-tauri/src/commands.rs`.

- [ ] `read_test_cases(path: String) -> Vec<HashMap<String, String>>`
  - Scans `<path>/harness/test_cases/` for `*.md` files
  - For each file, parses:
    - `id` — from the filename stem (`TC-SMOKE-001`) or `# TC-XXX:` heading
    - `title` — the rest of the `# TC-XXX: <title>` heading
    - `type` — value from the Meta table row `**Type**`
    - `priority` — value from the Meta table row `**Priority**`
    - `automated` — value from the Meta table row `**Automated**` (`"Yes"` / `"No"`)
    - `file_path` — absolute path to the file
  - Returns the list sorted by filename (alphabetically)
  - If the directory does not exist or is empty, returns `[]`
- [ ] Register `read_test_cases` in `src-tauri/src/lib.rs` `invoke_handler`

---

### Layer 3 — Go Engine: Test Execution IPC Actions
Add new action cases in `src-tauri/binaries/loom-engine/main.go`.

- [ ] `run_test_case` (fields: `test_id: string`, `project_path: string`)
  - Emit `test_status` → `{ test_id, status: "running" }` immediately
  - Run `npx playwright test --grep <test_id>` in the project directory
  - On completion: emit `test_status` → `{ test_id, status: "passed" | "failed", duration: string, error?: string }`

- [ ] `run_all_test_cases` (fields: `test_ids: string[]`, `project_path: string`)
  - Emit `test_run_started` → `{ total: number }`
  - Run tests sequentially (or 4 parallel workers matching arch doc)
  - Emit `test_status` for each test as it completes
  - After all tests: emit `test_run_complete` → `{ total, passed, failed, duration, failed_tests: Array<{ id, error }> }`

---

### Layer 4 — Frontend Events & Types

**`src/types.ts`** — add:
```typescript
export interface TestCase {
  id: string
  title: string
  type: string
  priority: string
  automated: string
  filePath: string
}

export type TestStatus = 'idle' | 'running' | 'passed' | 'failed'

export interface TestRunResult {
  total: number
  passed: number
  failed: number
  duration: string
  passRate: number
  failedTests: Array<{ id: string; title: string; error: string }>
}
```

**`src/lib/events.ts`** — add:
- [ ] `onTestStatus(cb)` — listens to `test_status` event → `{ testId, status, duration?, error? }`
- [ ] `onTestRunStarted(cb)` — listens to `test_run_started` → `{ total }`
- [ ] `onTestRunComplete(cb)` — listens to `test_run_complete` → `TestRunResult`

**`src/context/types.ts`** — add to `AppState`:
```typescript
testCases: TestCase[]
testStatuses: Record<string, TestStatus>
testRunResult: TestRunResult | null
isRunningTests: boolean
```

Add corresponding `AppAction` variants:
```typescript
| { type: 'SET_TEST_CASES'; cases: TestCase[] }
| { type: 'SET_TEST_STATUS'; testId: string; status: TestStatus }
| { type: 'SET_TEST_RUN_RESULT'; result: TestRunResult }
| { type: 'SET_IS_RUNNING_TESTS'; value: boolean }
| { type: 'CLEAR_TEST_RESULTS' }
```

- [ ] Add initial values in `initialState` (`testCases: []`, `testStatuses: {}`, `testRunResult: null`, `isRunningTests: false`)
- [ ] Add reducer cases in `src/context/reducer.ts`

---

### Layer 5 — QA Test Suite Component

Create `src/components/QATestSuite/QATestSuite.tsx` and `QATestSuite.module.css`.

Replace the "coming soon" placeholder in `App.tsx` with `<QATestSuite />`.

**Empty States:**
- No active project → centred message: "Select a project to view test cases"
- Active project but `testCases.length === 0` → centred message: "No test cases found" + hint path `harness/test_cases/`

**List View (default):**

Header row:
```
[🧪 Test Cases]    [▶ Run All (18)]    [🗑 Clear Results]
```

Filter chips: `All` · `Smoke` · `Functional` · `Regression` · `E2E`
Priority filter chips: `All` · `P0` · `P1` · `P2`

Test case row (per item):
```
[▶]  TC-SMOKE-001   Login page loads with visible form   [Smoke] [P0]   ● Passed
```
- `[▶]` run button: disabled while `isRunningTests`, starts single test
- Status badge: grey=idle, blue=running, green=passed, red=failed
- Clicking a row expands to show Steps + Expected Result (read from file or parsed)

**Report View** (shown after `run_all` completes):

Summary cards row:
```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ Total 18 │ │ Passed 15│ │ Failed 3 │ │ Rate 83% │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
```
Pass rate progress bar.

Failed tests detail list:
```
✗  TC-FUNC-005  Wrong password displays error
   Error: Timeout — locator not found
```

Footer buttons: `[↩ Back to List]` · `[↺ Re-run Failed]`

---

### Layer 6 — Wire Events in App.tsx

In `AppInner` `useEffect`, subscribe to:
- [ ] `onTestStatus` → dispatch `SET_TEST_STATUS`
- [ ] `onTestRunStarted` → dispatch `SET_IS_RUNNING_TESTS true`
- [ ] `onTestRunComplete` → dispatch `SET_TEST_RUN_RESULT` + `SET_IS_RUNNING_TESTS false`

---

### Layer 7 — Load Test Cases on Project Change

In `App.tsx` (or inside `QATestSuite.tsx`), whenever `activeProject` changes and `appMode === 'qa'`:
- [ ] Call `invoke<TestCase[]>('read_test_cases', { path: activeProject.path })`
- [ ] Dispatch `SET_TEST_CASES` with the result

---

## Acceptance Criteria
- [ ] Clicking 🧪 in sidebar switches to QA mode; other modes still work
- [ ] "No test cases found" empty state with harness path hint when folder is empty
- [ ] `harness/test_cases/*.md` files parsed and displayed in list view
- [ ] Filter chips correctly filter by type and priority
- [ ] Status badges update live as tests run (idle → running → passed/failed)
- [ ] "Run All" runs every test; per-test ▶ runs only that test
- [ ] "Run All" button disabled while tests are running; individual ▶ also disabled
- [ ] After all tests complete, report view shows summary cards + failed detail
- [ ] "Back to List" returns to list view; "Clear Results" resets all statuses
- [ ] "Re-run Failed" re-runs only failed tests
- [ ] Switching projects reloads test cases from the new project's harness

---

## Technical Notes
- `read_test_cases` is a synchronous Rust command (same pattern as `read_harness_tasks`). No engine event needed — just direct `invoke()`.
- Playwright may not be installed in every project. If `run_test_case` / `run_all_test_cases` fail with a "playwright not found" error, emit an `engine_error` event with `missing_dep:playwright` prefix so the ErrorBanner renders it.
- The test execution commands run through the Go engine (same exec pattern as all other engine actions) — do NOT spawn processes from Rust or the frontend directly.
- CSS Modules only — no inline styles. Match the visual language of `HarnessManager` (dark background, muted text, badge pill styles).
- TopBar in `'qa'` mode: hide TaskTabs and RunControls (same as `'harness'` mode — `isHarness` check in `TopBar.tsx` already covers `appMode === 'qa'`).

---

## Files to Create
```
CREATE:
src/components/QATestSuite/QATestSuite.tsx
src/components/QATestSuite/QATestSuite.module.css
harness/test_cases/TC-SMOKE-001.md            ← sample test case
```

## Files to Modify
```
MODIFY:
src/types.ts                                  ← TestCase, TestStatus, TestRunResult types
src/context/types.ts                          ← AppState fields + AppAction variants
src/context/reducer.ts                        ← new reducer cases
src/lib/events.ts                             ← onTestStatus, onTestRunStarted, onTestRunComplete
src/App.tsx                                   ← replace QA placeholder + wire events
src-tauri/src/commands.rs                     ← read_test_cases command
src-tauri/src/lib.rs                          ← register read_test_cases
src-tauri/binaries/loom-engine/main.go        ← run_test_case + run_all_test_cases actions
harness/test_cases/overview.md                ← document test case file schema
```

---

## UI Screens
```
Sidebar: 🧪 icon (3rd) → QA mode

TopBar (qa mode):
  ● ● ●  [ProjectSelector]               [⎇ branch]  [↑ push]

Main panel — List View:
  🧪 Test Cases                          [▶ Run All (3)]   [🗑 Clear]

  [All 3] [Smoke 1] [Functional 1] [Regression 1]
  [All]   [P0 1]    [P1 1]         [P2 1]

  ▶  TC-SMOKE-001  Login page loads with visible form    [Smoke][P0]  ● idle
  ▶  TC-FUNC-001   Login with valid credentials           [Func] [P1]  ● idle
  ▶  TC-REG-001    Login form rejects invalid email       [Reg]  [P2]  ● idle

Main panel — Report View (after Run All):
  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
  │ 3    │ │ 2    │ │ 1    │ │ 67%  │
  │Total │ │Passed│ │Failed│ │Rate  │
  └──────┘ └──────┘ └──────┘ └──────┘

  ████████████████░░░░░  67%

  Failed Tests:
  ✗  TC-REG-001  Login form rejects invalid email
     Error: Expected element to be visible

  [↩ Back to List]   [↺ Re-run Failed (1)]
```

---

## Dependencies
- **Blocked by:** TASK-001 (env setup) ✅
- **Blocked by:** TASK-023 (GitHub PR mode pattern — reference for appMode routing) ✅
- **Blocks:** —

---

## Claude Code Context
```
harness/claude.md
harness/tasks/Phase 10 — QA Test Suite/TASK-024 — QA Test Suite · Test Case Manager.md
harness/QA-AUTOMATION-TOOL-ARCHITECTURE.md
src/App.tsx
src/context/types.ts
src/context/reducer.ts
src/types.ts
src/lib/events.ts
src/lib/ipc.ts
src/components/Sidebar/Sidebar.tsx
src/components/TopBar/TopBar.tsx
src-tauri/src/commands.rs
src-tauri/src/lib.rs
src-tauri/binaries/loom-engine/main.go
src/components/HarnessManager/HarnessManager.tsx   ← reference for layout/split pattern
src/components/GitHubPR/GitHubPR.tsx               ← reference for appMode routing pattern
```

---

## Progress Log
| Date | Update |
|------|--------|
| 2026-05-03 | Task created — QA Test Suite feature scoped from QA-AUTOMATION-TOOL-ARCHITECTURE.md |

---

## Time Log
| Date | Hours | Note |
|------|-------|------|
| — | — | — |

---

## Review Notes
- **—**

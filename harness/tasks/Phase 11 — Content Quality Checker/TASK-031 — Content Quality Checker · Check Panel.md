# TASK-031: Content Quality Checker · Check Panel

## Meta
| Field | Value |
|-------|-------|
| **Assignee** | — |
| **Status** | ✅ Done |
| **Priority** | P1 |
| **Sprint** | Sprint 8 |
| **Story Points** | 8 |
| **Story Points** | 8 |
| **PRD Reference** | harness/content-review-prd.md |
| **Architecture Ref** | architecture.md |
| **Start Date** | — |
| **Due Date** | — |
| **Created** | 2026-05-11 |
| **Completed** | — |

---

## Description

Implement the **Check** sub-panel — the primary interface where a team member selects a client, pastes content, and runs the AI quality check. This panel handles the full check lifecycle: idle → running (with step-by-step progress) → result handed off to `ResultPanel`.

Phase 1 covers text input only. Image upload is a Phase 2 stub.

---

## Sub Tasks

### Layer 1 — Panel Layout

```
┌─────────────────────────────────────────────┐
│  Run a Quality Check                        │
│  ─────────────────────────────────────────  │
│                                             │
│  Your name                                  │
│  [Akshay                                 ]  │
│                                             │
│  Client *                                   │
│  [Select a client ▾                      ]  │
│                                             │
│  Content to check *                         │
│  ┌────────────────────────────────────────┐ │
│  │ Paste caption or post copy here...     │ │
│  │                                        │ │
│  │                                        │ │
│  └────────────────────────────────────────┘ │
│                                             │
│  [📎 Upload image — Phase 2]  (disabled)    │
│                                             │
│  [▶ Run Check]                              │
│                                             │
│  ── Progress ──────────────────────────── │
│  ✓ Building prompt                          │
│  ⟳ Running AI check...                     │
│                                             │
└─────────────────────────────────────────────┘
```

Create `src/components/ContentQualityChecker/CheckPanel.tsx`:

- [ ] "Your name" text input — pre-fills from `state.cqcUser`; on blur dispatches `SET_CQC_USER`
- [ ] Client `<select>` dropdown — options from `state.cqcClients`; on change dispatches `SET_CQC_SELECTED_CLIENT`
- [ ] Content `<textarea>` — local state (not in AppState); auto-resizes up to ~8 rows
- [ ] `[▶ Run Check]` button — disabled when: no client selected, no content entered, or `state.cqcCheckRunning === true`
- [ ] Upload image button — rendered but disabled with tooltip `"Image check coming in Phase 2"`
- [ ] If `state.cqcClients` is empty, show inline hint: `"No clients configured — add one in the Clients tab"`

---

### Layer 2 — Run Check Flow

On `[▶ Run Check]` click:

- [ ] Validate: client selected AND content non-empty. Show inline error messages if not.
- [ ] Dispatch `SET_CQC_CHECK_RUNNING true`
- [ ] Dispatch `SET_CQC_CHECK_RESULT null` (clear previous result)
- [ ] Call `invoke('cqc_run_text_check', { path: activeProject.path, client_id, text, user })`
- [ ] On success: dispatch `SET_CQC_CHECK_RESULT` with the result, dispatch `SET_CQC_CHECK_RUNNING false`, dispatch `SET_CQC_PROGRESS_STEP null`
- [ ] On error: dispatch `SET_CQC_CHECK_RUNNING false`, dispatch `SET_CQC_PROGRESS_STEP null`, show error banner with the error message

---

### Layer 3 — Progress Display

While `state.cqcCheckRunning === true`, show a progress section below the Run button.

Map `state.cqcProgressStep` to step labels:
```
building_prompt  → "Building prompt"
running_claude   → "Running AI check"
parsing_result   → "Parsing result"
saving_log       → "Saving to log"
```

Display each step as:
- `✓` green check — steps that have already passed (step index < current)
- `⟳` spinning indicator — the current step
- `○` dimmed dot — future steps not yet reached

- [ ] Render progress section only when `cqcCheckRunning === true`
- [ ] Steps always shown in the fixed order above regardless of which is current

---

### Layer 4 — Result Handoff

When `state.cqcActiveCheck` is non-null AND `state.cqcCheckRunning === false`, the CheckPanel should NOT render the result inline — instead, auto-switch the sub-view to `'check-result'` by dispatching `SET_CQC_SUB_VIEW 'check-result'`.

Wait — `ResultPanel` is its own sub-view. Revise approach:

- [ ] Add `'check-result'` to the `CqcSubView` union in `src/types/index.ts`
- [ ] In `ContentQualityChecker.tsx`, add a case for `'check-result'` that renders `<ResultPanel />`
- [ ] In `CqcTabBar`, hide (or disable) the tab for `'check-result'` — it is entered automatically, not manually
- [ ] When the check completes, dispatch `SET_CQC_SUB_VIEW 'check-result'`
- [ ] `ResultPanel` has a `[← New Check]` button that dispatches `SET_CQC_SUB_VIEW 'check'` and `SET_CQC_CHECK_RESULT null`

---

### Layer 5 — CSS

Create `src/components/ContentQualityChecker/CheckPanel.module.css`:

- [ ] `.panel` — padded, scrollable column
- [ ] `.field` — label + input/select/textarea pair, consistent spacing
- [ ] `.textarea` — min-height 160px, resizable vertically, monospace font
- [ ] `.runButton` — primary accent colour, full width, disabled styling
- [ ] `.progress` — section below run button, visible only when running
- [ ] `.progressStep` — flex row: icon + label
- [ ] `.stepDone` — green icon
- [ ] `.stepActive` — spinning icon + label (use CSS animation)
- [ ] `.stepPending` — dimmed

---

## Acceptance Criteria
- [ ] Client dropdown populated from `state.cqcClients`
- [ ] User name persists across sub-view switches (stored in AppState)
- [ ] Run button disabled when no client or empty content
- [ ] Progress steps animate correctly during a real check run
- [ ] On success, `state.cqcActiveCheck` is set and sub-view switches to `'check-result'`
- [ ] On error, an error message is shown inline; running state is cleared
- [ ] `[Upload image]` button is rendered but visibly disabled
- [ ] No TypeScript errors; component under 180 lines

---

## Technical Notes
- Keep the content textarea in local `useState`, not AppState — it is ephemeral input.
- The `invoke` call is async: wrap in try/catch, always clear `cqcCheckRunning` in both branches.
- The `cqcProgressStep` is updated by the `onCqcProgress` event listener wired in App.tsx (TASK-028), not by this component.

---

## Files to Create
```
CREATE:
src/components/ContentQualityChecker/CheckPanel.tsx
src/components/ContentQualityChecker/CheckPanel.module.css
```

## Files to Modify
```
MODIFY:
src/types/index.ts                                               ← add 'check-result' to CqcSubView
src/components/ContentQualityChecker/ContentQualityChecker.tsx  ← replace Check stub + add check-result case
```

---

## Dependencies
- **Blocked by:** TASK-029 (Sidebar Mode & Shell), TASK-030 (Clients Panel — provides cqcClients)
- **Blocks:** TASK-032 (Result Panel)

---

## Claude Code Context
```
harness/claude.md
harness/tasks/Phase 11 — Content Quality Checker/TASK-031 — Content Quality Checker · Check Panel.md
harness/content-review-prd.md
src/components/ContentQualityChecker/ContentQualityChecker.tsx
src/context/types.ts
src/types/index.ts
src/lib/events.ts
src/App.tsx
src-tauri/src/commands.rs
```

---

## Progress Log
| Date | Update |
|------|--------|
| 2026-05-11 | Task created — CQC Phase 11 Check panel & run flow |

---

## Time Log
| Date | Hours | Note |
|------|-------|------|
| — | — | — |

---

## Review Notes
- **—**

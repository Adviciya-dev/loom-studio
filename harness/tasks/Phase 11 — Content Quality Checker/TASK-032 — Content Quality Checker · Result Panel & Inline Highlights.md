# TASK-032: Content Quality Checker · Result Panel & Inline Highlights

## Meta
| Field | Value |
|-------|-------|
| **Assignee** | — |
| **Status** | ✅ Done |
| **Priority** | P1 |
| **Sprint** | Sprint 8 |
| **Story Points** | 13 |
| **PRD Reference** | harness/content-review-prd.md |
| **Architecture Ref** | architecture.md |
| **Start Date** | — |
| **Due Date** | — |
| **Created** | 2026-05-11 |
| **Completed** | — |

---

## Description

Implement the **Result Panel** — the richest UI component in the CQC feature. It displays the AI quality check result as inline-highlighted text (coloured underlines per issue type), an issue list, a view toggle, an "Apply fix" flow, and an export button.

This is the highest story-point task in Phase 11 because of the inline highlight rendering logic and the apply-fix mutation flow.

---

## Sub Tasks

### Layer 1 — Result Panel Shell

Create `src/components/ContentQualityChecker/ResultPanel.tsx`.

Reads `state.cqcActiveCheck` (a `CqcCheckResult`). If null, renders nothing (parent view switch prevents this).

```
┌─────────────────────────────────────────────┐
│  ✓ APPROVED  /  ✗ NEEDS REVIEW             │
│  "One high-severity brand name error found" │
│  ─────────────────────────────────────────  │
│  [Highlights]  [Issue List]          [↗ Export]  [← New Check] │
│  ─────────────────────────────────────────  │
│  <active view>                              │
└─────────────────────────────────────────────┘
```

- [ ] Status badge: green `✓ APPROVED` if `result.approved`, red `✗ NEEDS REVIEW` otherwise
- [ ] Summary text below badge
- [ ] Toggle buttons: `[Highlights]` / `[Issue List]` — local state `viewMode`
- [ ] `[↗ Export]` button — see Layer 4
- [ ] `[← New Check]` button — dispatches `SET_CQC_SUB_VIEW 'check'` and `SET_CQC_CHECK_RESULT null`

---

### Layer 2 — Inline Highlights View

The core UI: render `result.extracted_text` with coloured underlines for each issue.

**Algorithm:**
1. Start with the full `extracted_text` string
2. For each issue in `result.issues`, find the first occurrence of `issue.snippet` as a substring
3. Split the text into segments: `[plain, highlighted, plain, highlighted, ...]`
4. Render each highlighted segment as `<IssueHighlight issue={...}>` and each plain segment as a `<span>`
5. Handle overlapping snippets: if two issues share characters, the second takes priority (render in issue array order)

**Colour encoding by issue type:**
| `issue.type` | Underline class |
|---|---|
| `spelling` | Red (`--cqc-spelling`) |
| `grammar` | Amber (`--cqc-grammar`) |
| `brand` | Purple (`--cqc-brand`) |
| `fact` | Blue (`--cqc-fact`) |

Create `src/components/ContentQualityChecker/IssueHighlight.tsx`:

```tsx
interface Props {
  issue: CqcIssue
  children: string
  onApplyFix: (issue: CqcIssue) => void
}
```

- [ ] Renders `<span class={styles[issue.type]}>` with coloured bottom-border underline
- [ ] On hover (or focus), shows a tooltip containing:
  - Issue type badge (e.g., `BRAND`)
  - Severity badge (`HIGH` / `MEDIUM` / `LOW` with colour)
  - Explanation text
  - `[Apply fix: "suggested_fix"]` button — only if `issue.suggested_fix` is non-empty
- [ ] `[Apply fix]` calls `onApplyFix(issue)` and closes the tooltip
- [ ] Tooltip is positioned above the span; uses CSS `position: absolute` (no third-party tooltip library)
- [ ] Tooltip closes on click outside or `Escape` key

Create `src/components/ContentQualityChecker/IssueHighlight.module.css`:
- [ ] `.spelling` — `border-bottom: 2px solid var(--cqc-spelling)`
- [ ] `.grammar` — amber underline
- [ ] `.brand` — purple underline
- [ ] `.fact` — blue underline
- [ ] `.tooltip` — absolute positioned card with shadow
- [ ] `.typeBadge`, `.severityBadge` — small pill badges
- [ ] `.applyBtn` — small action button

---

### Layer 3 — Apply Fix Flow

When the user clicks `[Apply fix]` on an issue:

- [ ] Replace the first occurrence of `issue.snippet` in `result.extracted_text` with `issue.suggested_fix`
- [ ] Remove the applied issue from `result.issues`
- [ ] Update `state.cqcActiveCheck` via a new action `UPDATE_CQC_CHECK_TEXT`:
  ```typescript
  | { type: 'UPDATE_CQC_CHECK_TEXT'; text: string; removedIssueSnippet: string }
  ```
- [ ] The highlights view re-renders automatically with the updated text and fewer issues
- [ ] If all issues are resolved, update `result.approved` to `true` and show the green approved badge

Add `UPDATE_CQC_CHECK_TEXT` to:
- [ ] `AppAction` union in `src/context/types.ts`
- [ ] Reducer in `src/context/reducer.ts`

---

### Layer 4 — Issue List View

Alternative to the highlights view: a structured list of all issues.

```
┌─────────────────────────────────────────────┐
│  3 issues found                             │
│                                             │
│  [BRAND · HIGH]                             │
│  Snippet: "acme corp"                       │
│  → Fix: "AcmeCorp"                [Apply]   │
│  "Brand name spelled incorrectly"           │
│                                             │
│  [SPELLING · MEDIUM]                        │
│  Snippet: "recieve"                         │
│  → Fix: "receive"                 [Apply]   │
│  "Common spelling error"                    │
│                                             │
│  [FACT · LOW]                               │
│  Snippet: "founded 2001"                    │
│  (no fix suggested)                         │
│  "Incorrect founding year — should be 1995" │
└─────────────────────────────────────────────┘
```

- [ ] Sort issues: HIGH first, then MEDIUM, then LOW
- [ ] Each issue card: type+severity badges, snippet in monospace, explanation, optional Apply button
- [ ] Apply button triggers the same `UPDATE_CQC_CHECK_TEXT` flow as inline Apply

---

### Layer 5 — Export

`[↗ Export]` copies a plain-text summary to the clipboard:

```
Content Quality Check — Acme Corp — 2026-05-11
Status: NEEDS REVIEW
Summary: One high-severity brand name error found.

Issues:
1. [BRAND · HIGH] "acme corp" → Fix: "AcmeCorp"
   Brand name spelled incorrectly.

2. [SPELLING · MEDIUM] "recieve" → Fix: "receive"
   Common spelling error.
```

- [ ] Use `navigator.clipboard.writeText(...)` to copy
- [ ] Show brief "Copied!" confirmation on the Export button (1.5 second timeout, then resets)
- [ ] Client name pulled from `state.cqcClients.find(c => c.id === state.cqcSelectedClientId)`

---

### Layer 6 — CSS

Create `src/components/ContentQualityChecker/ResultPanel.module.css`:

- [ ] `.panel` — padded, scrollable
- [ ] `.statusRow` — badge + summary row
- [ ] `.approved` — green badge styling
- [ ] `.needsReview` — red badge styling
- [ ] `.controls` — toggle + export + new-check buttons row
- [ ] `.highlightsView` — content area, `white-space: pre-wrap`, readable line-height
- [ ] `.issueCard` — bordered card per issue in list view
- [ ] Define CSS custom properties at `:root` (or in a shared CSS file):
  - `--cqc-spelling: #ef4444`
  - `--cqc-grammar: #f59e0b`
  - `--cqc-brand: #8b5cf6`
  - `--cqc-fact: #3b82f6`

---

## Acceptance Criteria
- [ ] Approved/Needs Review badge matches `result.approved`
- [ ] Highlights view renders coloured underlines for every issue in `result.issues`
- [ ] Hovering/clicking a highlighted span opens the tooltip with correct type, severity, explanation
- [ ] `[Apply fix]` replaces the snippet in the text and removes the issue from the list
- [ ] After applying all fixes, status badge updates to Approved
- [ ] Issue List view renders all issues sorted by severity; Apply works from list view too
- [ ] Toggle between Highlights / Issue List works without losing state
- [ ] Export copies correctly formatted text to clipboard; "Copied!" feedback shown
- [ ] `[← New Check]` returns to Check panel and clears result
- [ ] No TypeScript errors; `ResultPanel.tsx` under 190 lines; `IssueHighlight.tsx` under 80 lines

---

## Technical Notes
- The highlight segmentation algorithm must handle: no issues (render plain text), adjacent issues (back-to-back snippets), duplicate snippets (mark first occurrence only per issue).
- Do NOT use a third-party tooltip or popover library — CSS position:absolute tooltip only.
- `UPDATE_CQC_CHECK_TEXT` mutates the in-memory `cqcActiveCheck` only; it does NOT re-run the check or update the DB log entry.
- The Export feature does not write any files — clipboard only.

---

## Files to Create
```
CREATE:
src/components/ContentQualityChecker/ResultPanel.tsx
src/components/ContentQualityChecker/ResultPanel.module.css
src/components/ContentQualityChecker/IssueHighlight.tsx
src/components/ContentQualityChecker/IssueHighlight.module.css
```

## Files to Modify
```
MODIFY:
src/types/index.ts          ← no changes needed (types already from TASK-028)
src/context/types.ts        ← add UPDATE_CQC_CHECK_TEXT action variant
src/context/reducer.ts      ← add UPDATE_CQC_CHECK_TEXT reducer case
src/components/ContentQualityChecker/ContentQualityChecker.tsx  ← replace check-result stub with <ResultPanel />
```

---

## Dependencies
- **Blocked by:** TASK-031 (Check Panel — provides cqcActiveCheck)
- **Blocks:** —

---

## Claude Code Context
```
harness/claude.md
harness/tasks/Phase 11 — Content Quality Checker/TASK-032 — Content Quality Checker · Result Panel & Inline Highlights.md
harness/content-review-prd.md
src/components/ContentQualityChecker/ContentQualityChecker.tsx
src/components/ContentQualityChecker/CheckPanel.tsx
src/context/types.ts
src/context/reducer.ts
src/types/index.ts
```

---

## Progress Log
| Date | Update |
|------|--------|
| 2026-05-11 | Task created — CQC Phase 11 Result panel & inline highlights |

---

## Time Log
| Date | Hours | Note |
|------|-------|------|
| — | — | — |

---

## Review Notes
- **—**

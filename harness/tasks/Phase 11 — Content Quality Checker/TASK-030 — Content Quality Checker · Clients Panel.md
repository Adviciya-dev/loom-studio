# TASK-030: Content Quality Checker · Clients Panel

## Meta
| Field | Value |
|-------|-------|
| **Assignee** | — |
| **Status** | ✅ Done |
| **Priority** | P1 |
| **Sprint** | Sprint 8 |
| **Story Points** | 8 |
| **PRD Reference** | harness/content-review-prd.md |
| **Architecture Ref** | architecture.md |
| **Start Date** | — |
| **Due Date** | — |
| **Created** | 2026-05-11 |
| **Completed** | — |

---

## Description

Implement the **Clients** sub-panel of the Content Quality Checker. This panel lets the team manage brand client profiles — the structured data that the AI uses to check content against. Each client profile stores brand spelling rules, required hashtags, banned words, tone expectations, and key facts.

The panel has two views: a client list and an inline edit form. All mutations call Tauri `cqc_*` commands, which relay to the Go engine and persist to SQLite.

---

## Sub Tasks

### Layer 1 — Load Clients on Panel Mount

In `ClientsPanel.tsx`:

- [ ] On mount (and whenever `activeProject` changes), call `invoke('cqc_list_clients', { path: activeProject.path })`
- [ ] Dispatch `SET_CQC_CLIENTS` with the result
- [ ] Show a loading spinner while fetching; show "No clients yet" empty state if array is empty

---

### Layer 2 — Client List View

```
┌─────────────────────────────────────────────┐
│  Clients                     [+ New Client] │
│  ─────────────────────────────────────────  │
│  ● Acme Corp                      [Edit]    │
│  ● Beta Brand                     [Edit]    │
│  ● Gamma Co                       [Edit]    │
└─────────────────────────────────────────────┘
```

- [ ] List all `state.cqcClients` sorted by name
- [ ] Each row: client name + `[Edit]` button
- [ ] `[+ New Client]` button in header opens the form in "create" mode (empty fields)
- [ ] `[Edit]` opens the form pre-filled with the selected client's data
- [ ] `[Delete]` icon (trash) on each row — clicking shows an inline confirmation (`"Delete {name}? This cannot be undone."`) with Confirm / Cancel buttons

---

### Layer 3 — Client Edit Form

```
┌─────────────────────────────────────────────┐
│  ← Back   Edit Client: Acme Corp            │
│  ─────────────────────────────────────────  │
│  Name *                                     │
│  [Acme Corp                              ]  │
│                                             │
│  Brand Name (correct spelling)              │
│  [AcmeCorp                               ]  │
│                                             │
│  Accepted spelling variants (comma-sep)     │
│  [Acme, ACME                             ]  │
│                                             │
│  Required hashtags (space-sep)              │
│  [#AcmeCorp #AcmeDeals                   ]  │
│                                             │
│  Banned words (comma-sep)                   │
│  [cheap, discount                        ]  │
│                                             │
│  Expected tone                              │
│  [Professional and friendly              ]  │
│                                             │
│  Key facts (one per line)                   │
│  ┌────────────────────────────────────────┐ │
│  │ Founded in 1995                        │ │
│  │ Headquarters: New York                 │ │
│  └────────────────────────────────────────┘ │
│                                             │
│  [Cancel]                       [Save]      │
└─────────────────────────────────────────────┘
```

- [ ] All fields are plain `<textarea>` or `<input>` elements (no rich editor)
- [ ] `Name` is required — show inline error if empty on save attempt
- [ ] `[Save]` calls `invoke('cqc_save_client', { path, client })` then dispatches `SET_CQC_CLIENTS` with updated list
- [ ] `[Cancel]` returns to list view without saving
- [ ] After save, return to list view and highlight the saved client row briefly

---

### Layer 4 — Delete Flow

- [ ] `[Delete]` click sets local state `confirmDeleteId = client.id`
- [ ] Shows inline confirmation row: `"Delete {name}?" [Confirm] [Cancel]`
- [ ] `[Confirm]` calls `invoke('cqc_delete_client', { path, id })` then removes the client from `state.cqcClients` via `SET_CQC_CLIENTS`
- [ ] `[Cancel]` clears `confirmDeleteId`

---

### Layer 5 — CSS

Create `src/components/ContentQualityChecker/ClientsPanel.module.css`:

- [ ] `.panel` — full height, scrollable
- [ ] `.header` — title + add button row
- [ ] `.clientRow` — flex row, name left, actions right
- [ ] `.confirmRow` — warning-coloured inline confirmation row
- [ ] `.form` — stacked field layout
- [ ] `.field` — label + input/textarea pair
- [ ] `.fieldError` — red text below invalid field
- [ ] `.formActions` — right-aligned Cancel / Save button row

---

## Acceptance Criteria
- [ ] Clients load from engine on panel mount; list renders correctly
- [ ] `[+ New Client]` → form with empty fields; save creates a new client (appears in list)
- [ ] `[Edit]` → form pre-filled; save updates the client (list refreshed)
- [ ] Empty `Name` field shows validation error; form does not submit
- [ ] `[Delete]` → confirmation row appears; `[Confirm]` removes client from list
- [ ] `[Cancel]` on confirmation does not delete
- [ ] Switching away and back to Clients tab reloads the list
- [ ] No TypeScript errors; component under 200 lines (extract form to `ClientForm.tsx` if needed)

---

## Technical Notes
- Keep form state in local `useState` — do not store the in-progress edit form in `AppState`.
- Do NOT call `cqc_list_clients` repeatedly — load once on mount and trust the local state after mutations.
- Component split: `ClientsPanel.tsx` (list + routing between views) + `ClientForm.tsx` (the form itself). Both under 200 lines.

---

## Files to Create
```
CREATE:
src/components/ContentQualityChecker/ClientsPanel.tsx
src/components/ContentQualityChecker/ClientForm.tsx
src/components/ContentQualityChecker/ClientsPanel.module.css
```

## Files to Modify
```
MODIFY:
src/components/ContentQualityChecker/ContentQualityChecker.tsx   ← replace Clients stub with <ClientsPanel />
```

---

## Dependencies
- **Blocked by:** TASK-029 (Sidebar Mode & Shell)
- **Blocks:** TASK-031 (Check Panel — needs client list to populate the selector)

---

## Claude Code Context
```
harness/claude.md
harness/tasks/Phase 11 — Content Quality Checker/TASK-030 — Content Quality Checker · Clients Panel.md
harness/content-review-prd.md
src/components/ContentQualityChecker/ContentQualityChecker.tsx
src/context/types.ts
src/types/index.ts
src-tauri/src/commands.rs   ← reference for invoke call signatures
```

---

## Progress Log
| Date | Update |
|------|--------|
| 2026-05-11 | Task created — CQC Phase 11 Clients panel CRUD |

---

## Time Log
| Date | Hours | Note |
|------|-------|------|
| — | — | — |

---

## Review Notes
- **—**

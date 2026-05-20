# TASK-039: Site Audit · Intake Form

## Meta
| Field | Value |
|-------|-------|
| **Assignee** | — |
| **Status** | 🔲 To Do |
| **Priority** | P0 |
| **Sprint** | Sprint 9 |
| **Story Points** | 8 |
| **PRD Reference** | harness/site-audit-prd.md §5.1 §5.2 §5.3 §5.5 |
| **Architecture Ref** | harness/site-audit-prd.md §10.1 §10.4 |
| **Start Date** | — |
| **Due Date** | — |
| **Created** | 2026-05-17 |
| **Completed** | — |

---

## Description

Implement `IntakeForm.tsx` — the Phase 1 right-panel component. This is the most complex Phase 1 task. It owns all intake form fields, inline validation, the OS folder picker, draft auto-save to `intake.draft.json`, duplicate session detection, and writing the final `intake.json` via `auditSaveIntake`.

After this task Phase 1 is functionally complete end-to-end: user can open Site Audit, create a session, fill the form, save it, and see it appear in the session list.

---

## Sub Tasks

### Layer 1 — All form fields

Implement every field exactly as specified in PRD §5.1. Below is the complete field list with component type and validation rule.

| Field | Component | Required | Validation |
|-------|-----------|----------|------------|
| Site URL | `<input type="url">` | Yes | Well-formed URL; auto-prefix `https://` if omitted; show "Enter a valid URL (e.g. https://example.com)" on failure |
| Site name | `<input type="text">` | Yes | Non-empty; "This field is required" |
| CMS / Stack | `<select>` + conditional `<input>` | Yes | One of 7 options; if "Other" selected, a required free-text input "Describe your stack" appears below |
| Industry | `<input type="text">` | Yes | Non-empty |
| Niche + keywords | `<textarea>` | Yes | Non-empty |
| Target market | `<input type="text">` | Yes | Non-empty |
| Competitors | Dynamic URL list | No | Max 5 rows; each URL validated same as Site URL if non-empty; "Enter a valid URL" on failure |
| Local repo | Read-only path display + **Browse** button | No | Validated by `audit_open_folder` command; shows "Could not find a valid project at this path" on `INVALID_REPO_PATH` error |
| Business goal | `<textarea>` | Yes | Non-empty |
| Budget / timeline | `<input type="text">` | No | No validation |

**CMS Select options:**
```
WordPress, Next.js, Nuxt, Laravel, Shopify, Custom, Other
```
Values: `wordpress`, `nextjs`, `nuxt`, `laravel`, `shopify`, `custom`, `other`

When `cms === 'other'`: render a `<input type="text">` below the select with placeholder "Describe your stack". This field is **required** — save is blocked if empty.

**Competitors dynamic list:**
- Default: 1 empty row
- `+ Add competitor` button appends a row (disabled when 5 rows exist)
- Each row: URL `<input>` + trash button (remove row)
- Remove is always allowed; at least 0 rows is valid (the field is optional)
- Empty rows are filtered out before validation and save

- [ ] Render all 10 fields with correct component types
- [ ] Conditional "Describe your stack" input appears only when `cms === 'other'`
- [ ] Competitors list supports add/remove up to 5 rows
- [ ] Empty competitor rows are excluded from the saved payload

---

### Layer 2 — Form state management

Use `useState` for the entire form. Do not use a form library. Keep all form state in a single `IntakeFormState` object:

```typescript
interface IntakeFormState {
  siteUrl: string
  siteName: string
  cms: CmsOption
  cmsOther: string
  industry: string
  nicheKeywords: string
  targetMarket: string
  competitors: string[]
  localRepoPath: string | null
  businessGoal: string
  budgetTimeline: string
}

const INITIAL_FORM_STATE: IntakeFormState = {
  siteUrl: '',
  siteName: '',
  cms: 'wordpress',
  cmsOther: '',
  industry: '',
  nicheKeywords: '',
  targetMarket: '',
  competitors: [''],
  localRepoPath: null,
  businessGoal: '',
  budgetTimeline: '',
}
```

When `activeAuditSession` changes (user switches sessions in the left panel), reload the form:
1. If `activeAuditSession.intakePath` is readable, load the intake fields from `intake.json`
2. Otherwise reset to `INITIAL_FORM_STATE`

- [ ] Form state managed with `useState<IntakeFormState>`
- [ ] Form reloads when `activeAuditSession` changes (via `useEffect`)
- [ ] Restoring from `intake.json` uses `auditLoadSession` invoke wrapper

---

### Layer 3 — Inline validation

Validation runs on **save** (not on every keystroke). Individual field errors show on **blur** (field loses focus) for a better UX — but save is always the definitive gate.

```typescript
interface FormErrors {
  siteUrl?: string
  siteName?: string
  cmsOther?: string
  industry?: string
  nicheKeywords?: string
  targetMarket?: string
  competitors: (string | undefined)[]  // per-row error
  localRepoPath?: string
  businessGoal?: string
}
```

**Validation rules:**

```typescript
function validateForm(form: IntakeFormState): FormErrors {
  const errors: FormErrors = { competitors: [] }

  if (!isValidUrl(form.siteUrl)) {
    errors.siteUrl = 'Enter a valid URL (e.g. https://example.com)'
  }
  if (!form.siteName.trim()) {
    errors.siteName = 'This field is required'
  }
  if (form.cms === 'other' && !form.cmsOther.trim()) {
    errors.cmsOther = 'This field is required'
  }
  if (!form.industry.trim()) errors.industry = 'This field is required'
  if (!form.nicheKeywords.trim()) errors.nicheKeywords = 'This field is required'
  if (!form.targetMarket.trim()) errors.targetMarket = 'This field is required'
  if (!form.businessGoal.trim()) errors.businessGoal = 'This field is required'

  form.competitors.forEach((url, i) => {
    if (url.trim() && !isValidUrl(url)) {
      errors.competitors[i] = 'Enter a valid URL'
    }
  })

  return errors
}

function isValidUrl(url: string): boolean {
  // normalise first: prefix https:// if missing scheme
  const normalised = normaliseUrl(url)
  try { new URL(normalised); return true } catch { return false }
}

function normaliseUrl(url: string): string {
  if (!url.trim()) return ''
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return 'https://' + url
  }
  return url
}

function hasErrors(errors: FormErrors): boolean {
  return !!(
    errors.siteUrl || errors.siteName || errors.cmsOther ||
    errors.industry || errors.nicheKeywords || errors.targetMarket ||
    errors.businessGoal || errors.competitors.some(Boolean)
  )
}
```

Each field shows its error message below it when `errors.fieldName` is set. Error messages appear in red with the same helper-text style as other form components in the project.

- [ ] `validateForm` function validates all fields per the rules above
- [ ] Error messages appear inline below the relevant field
- [ ] Save is blocked when `hasErrors(validate(form))` is true
- [ ] URL normalisation (add `https://`) runs before saving — the stored `siteUrl` is the normalised value

---

### Layer 4 — Folder picker

The **Browse** button next to the Local repo field calls `auditOpenFolder()`:

```typescript
async function handleBrowseRepo() {
  try {
    const path = await auditOpenFolder()
    if (path === null) return   // user cancelled — no-op
    setForm(f => ({ ...f, localRepoPath: path }))
    setErrors(e => ({ ...e, localRepoPath: undefined }))
  } catch (err) {
    if (String(err) === 'INVALID_REPO_PATH') {
      setErrors(e => ({ ...e, localRepoPath: 'Could not find a valid project at this path' }))
      setForm(f => ({ ...f, localRepoPath: null }))
    }
  }
}
```

The local repo field UI:
- Shows the selected path in a read-only `<input>` (greyed, truncated)
- Shows a **Browse** button to open the picker
- Shows a **×** clear button when a path is selected
- Shows the error message "Could not find a valid project at this path" below when validation fails

- [ ] Browse button opens folder picker via `auditOpenFolder()`
- [ ] Cancel from OS dialog is a no-op (path unchanged)
- [ ] `INVALID_REPO_PATH` error shows the validation message and clears the path
- [ ] Clear button removes the path

---

### Layer 5 — Draft auto-save

On each field blur (field loses focus), if the form has unsaved changes, write the draft to `intake.draft.json`:

```typescript
// Draft is written to: {project_path}/audits/{session_id}/intake.draft.json
// Use the existing Tauri FS write command or add a dedicated audit_save_draft command.
// For simplicity: debounce using a 300 ms timeout on onChange (not only blur).

const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

function saveDraft(form: IntakeFormState) {
  if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
  draftTimerRef.current = setTimeout(async () => {
    if (!activeAuditSession || !activeProject) return
    const draft = {
      ...form,
      sessionId: activeAuditSession.id,
      savedAt: new Date().toISOString(),
    }
    await invoke('audit_save_draft', {
      projectPath: activeProject.path,
      sessionId: activeAuditSession.id,
      draft,
    })
  }, 300)
}
```

Add a `audit_save_draft` Tauri command to `commands.rs` (simple file write — no envelope, no phase update):

```rust
#[tauri::command]
pub async fn audit_save_draft(
    project_path: String,
    session_id: String,
    draft: serde_json::Value,
) -> Result<(), String>
// Writes draft JSON to {project_path}/audits/{session_id}/intake.draft.json (no atomic rename needed)
```

On app mount / session switch, check for `intake.draft.json`:
- If it exists and the session phase is `'intake'`, restore the form from it and show a banner: **"Unsaved draft restored"** (dismissible)
- Draft is deleted on successful `auditSaveIntake` (TASK-035 already handles this)

- [ ] Draft auto-saves with 300 ms debounce on each form change
- [ ] `audit_save_draft` Tauri command writes `intake.draft.json`
- [ ] Draft is restored on session load if phase is `'intake'` and draft file exists
- [ ] "Unsaved draft restored" banner appears when draft is restored (dismissible)

---

### Layer 6 — Duplicate session detection

Before creating a new session (in `SiteAudit.tsx` `handleNewAudit`, now that the form is ready), check for a duplicate `siteUrl`:

Since the form `siteUrl` is filled **after** the session is created, the duplicate check fires in `IntakeForm` at save time (not at session creation time):

```typescript
async function handleSave() {
  const normalisedForm = { ...form, siteUrl: normaliseUrl(form.siteUrl) }
  const errors = validateForm(normalisedForm)
  if (hasErrors(errors)) { setErrors(errors); return }

  // Duplicate check: is there another session (different ID) with the same siteUrl?
  const duplicate = auditSessions.find(
    s => s.id !== activeAuditSession?.id && s.siteUrl === normalisedForm.siteUrl
  )
  if (duplicate) {
    setShowDuplicateDialog(true)
    setPendingDuplicate(duplicate)
    return
  }

  await doSave(normalisedForm)
}
```

**Duplicate dialog:**
```
"You already have an audit for {siteUrl}. Start a new one or continue the existing session?"
[Continue existing]   [Start new]
```
- **Continue existing**: dispatch `AUDIT_ACTIVE_SESSION_SET` with the duplicate session; discard the current unsaved session if it has no intake saved yet
- **Start new**: proceed with `doSave(normalisedForm)` ignoring the duplicate

- [ ] Duplicate detection runs at save time, comparing against `auditSessions`
- [ ] Duplicate dialog renders with the two buttons
- [ ] "Continue existing" switches to the duplicate session
- [ ] "Start new" proceeds with the save ignoring the duplicate

---

### Layer 7 — Save & post-save state

```typescript
async function doSave(form: IntakeFormState) {
  if (!activeAuditSession || !activeProject) return
  setSaving(true)
  try {
    await auditSaveIntake(activeProject.path, activeAuditSession.id, form)
    dispatch({ type: 'AUDIT_INTAKE_SAVED', payload: form as AuditIntake })
    // Refresh session list so the card shows updated siteName/siteUrl
    const sessions = await auditListSessions(activeProject.path)
    dispatch({ type: 'AUDIT_SESSIONS_LOADED', payload: sessions })
    setIsDirty(false)
  } catch (err) {
    // Show error toast/banner — do not clear the form
  } finally {
    setSaving(false)
  }
}
```

**Post-save behaviour:**
- `Start Audit` button (rendered below the form) becomes enabled
- If phase > `'intake'` (audit has already run), show the warning banner:
  > "Audit data exists for this session. Re-saving will not automatically re-run the audit. To apply changes, start a new audit."
  The banner is informational only — save still proceeds.

- [ ] `doSave` calls `auditSaveIntake` and refreshes session list on success
- [ ] `Start Audit` button is enabled after a successful save
- [ ] `Start Audit` button is always disabled until `intake.json` exists (check `activeAuditSession.phase !== 'intake'` OR the session has been saved at least once — track with a `hasSaved` flag or check `activeAuditSession.updatedAt`)
- [ ] Phase > intake warning banner appears when applicable

---

### Layer 8 — CSS layout in `IntakeForm.module.css`

The form renders in the right panel (full height, scrollable). Layout:

```
┌──────────────────────────────────────────────────────┐
│  Site Audit — Intake                                 │ ← header
│  {Session label: siteName or "New audit"}            │
├──────────────────────────────────────────────────────┤
│  [Warning banner if phase > intake]                  │ ← conditional
│  [Draft restored banner]                             │ ← conditional
├──────────────────────────────────────────────────────┤
│  Site URL *                                          │
│  [input]                                             │
│  [error message]                                     │
│                                                      │
│  Site name *                                         │
│  [input]                                             │
│                                                      │
│  CMS / Stack *                                       │
│  [select]                                            │
│  [conditional: Describe your stack input]            │
│                                                      │
│  ... (all other fields) ...                          │
│                                                      │
│  Competitors                                         │
│  [url input row 1]  [×]                              │
│  [url input row 2]  [×]                              │
│  [+ Add competitor]                                  │
│                                                      │
│  Local repo                                          │
│  [read-only path input]  [Browse]  [×]               │
│  [error message]                                     │
│                                                      │
├──────────────────────────────────────────────────────┤
│  [Save & Enable Audit]   [Start Audit ▶]             │ ← footer
└──────────────────────────────────────────────────────┘
```

- [ ] Create `IntakeForm.module.css` with form layout, field groups, error styles, footer button bar
- [ ] Footer is sticky at the bottom of the right panel
- [ ] Form body is scrollable; footer does not scroll

---

## Acceptance Criteria

- [ ] All 10 fields render with correct component types (input / select / textarea)
- [ ] `cms === 'other'` reveals the "Describe your stack" input; selecting any other CMS hides it
- [ ] Competitor list supports 0–5 rows; `+ Add competitor` is disabled at 5 rows
- [ ] Empty competitor rows are stripped before save
- [ ] Required field validation shows inline messages on save attempt
- [ ] Site URL and each competitor URL are normalised (https:// prepended if missing) before validation
- [ ] Invalid URL shows "Enter a valid URL (e.g. https://example.com)" for Site URL, "Enter a valid URL" for competitors
- [ ] Browse button opens native folder dialog; cancelling is a no-op
- [ ] `INVALID_REPO_PATH` response shows error message and clears the path field
- [ ] Draft auto-saves with 300 ms debounce; draft file written to `intake.draft.json`
- [ ] Draft is restored on session load when `phase === 'intake'` and draft file exists; "Unsaved draft restored" banner appears
- [ ] Duplicate siteUrl shows confirmation dialog before save proceeds
- [ ] "Continue existing" in duplicate dialog switches to the existing session
- [ ] Saving writes `intake.json` via `auditSaveIntake`, refreshes session list, enables `Start Audit`
- [ ] Re-saving after audit has started shows the warning banner; save still succeeds
- [ ] `Start Audit` button is disabled until intake has been saved at least once
- [ ] `pnpm build` produces no TypeScript or lint errors

---

## Technical Notes

- **No form library** — plain `useState` + `useRef` as specified. The form state is simple enough that a library adds more complexity than it removes.
- URL normalisation must run before both validation and save. The stored `siteUrl` in `intake.json` is always the normalised value.
- The `Start Audit` button is in the footer of `IntakeForm.tsx` but its click handler will be wired to Phase 2 in a future task. For now, render it as disabled with label "Start Audit" and no handler.
- Keep `IntakeForm.tsx` under 200 lines by extracting helpers: `useFormDraft.ts` (draft logic), `validateIntake.ts` (validation), and sub-components `CompetitorList.tsx` and `RepoPicker.tsx` if needed.
- `audit_save_draft` Tauri command added in this task — add it to `generate_handler!` in `lib.rs` alongside the commands from TASK-035.

---

## Files to Create / Replace

```
REPLACE (placeholder from TASK-037):
src/components/SiteAudit/IntakeForm.tsx
src/components/SiteAudit/IntakeForm.module.css

CREATE (extract helpers if needed):
src/components/SiteAudit/CompetitorList.tsx
src/components/SiteAudit/RepoPicker.tsx
src/lib/validateIntake.ts     (or inline in IntakeForm.tsx)
```

## Files to Modify

```
MODIFY:
src-tauri/src/commands.rs   ← add audit_save_draft command
src-tauri/src/lib.rs        ← register audit_save_draft in generate_handler!
src/lib/events.ts           ← add auditSaveDraft invoke wrapper
```

---

## Dependencies

- **Blocked by:** TASK-034 (AuditIntake type, CmsOption type, all action types)
- **Blocked by:** TASK-035 (auditSaveIntake, auditOpenFolder, auditListSessions wrappers)
- **Blocked by:** TASK-037 (shell must mount and provide activeAuditSession context)
- **Parallel with:** TASK-038 (session list can be built independently)
- **Completes Phase 1** when done

---

## Claude Code Context

```
harness/claude.md
harness/tasks/Phase 12 — Site Audit/TASK-039 — Site Audit · Intake Form.md
harness/site-audit-prd.md
src/components/SiteAudit/SiteAudit.tsx
src/types/index.ts
src/context/types.ts
src/context/reducer.ts
src-tauri/src/commands.rs
src-tauri/src/lib.rs
src/lib/events.ts
src/components/HarnessManager/FileModal.tsx
```

---

## Progress Log

| Date | Update |
|------|--------|
| 2026-05-17 | Task created — Phase 12 Site Audit intake form (largest Phase 1 task) |

---

## Time Log

| Date | Hours | Note |
|------|-------|------|
| — | — | — |

---

## Review Notes

- **—**

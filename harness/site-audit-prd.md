# Product Requirements Document
## Site Audit Tool

| Field | Value |
|---|---|
| Module name | Site Audit |
| Parent product | Loom Studio |
| Document version | 1.4 |
| Date | May 17, 2026 |
| Status | Draft — for internal review |
| Owner | Agency owner |
| Tech stack | Tauri (Rust) + Go CLI + Claude Code CLI |

---

## 1. Background and problem

Agencies and freelancers routinely need to audit client websites before starting a project, proposing a retainer, or reporting results. Today that process is fragmented: one person runs Lighthouse, another opens a spreadsheet of issues, a third writes a goal plan in Notion — and none of it is connected. Critical issues are missed, goal plans are vague, and there is no repeatable workflow across clients.

The Site Audit tool brings the full audit lifecycle into Loom Studio: intake → audit → report → goal plan. Every step is user-driven and recorded locally, so audits are reproducible and goal tasks flow directly into the workspace.

---

## 2. Goal

Add a complete, interactive site auditing tool to Loom Studio that takes a client site from a blank form to a prioritised action plan, using Claude Code CLI for AI analysis and the existing Go engine for orchestration.

### Success criteria

- An auditor can complete intake, run a full audit, and produce a report in a single session without leaving Loom Studio
- Audits against both live URLs and local code repositories are supported
- Every audit run produces a structured, human-readable report stored locally
- Goal tasks generated from the report can be saved directly to the local task store and opened in the Workspace
- Each of the four phases (intake → audit → report → goal plan) is triggered explicitly by the user — nothing runs automatically

### Non-goals (v1)

- Automated scheduling or recurring audits
- Cloud sync or sharing audit reports externally
- Multi-site batch auditing in one session
- Real-time monitoring or alerts
- Integration with third-party tools (SEMrush, Ahrefs, etc.)

---

## 3. Users

| Role | Responsibilities | Pain today |
|---|---|---|
| Agency owner / strategist | Owns the audit deliverable, signs off on goal plan | Coordinates across multiple tools; no single source of truth |
| Developer / technical auditor | Runs code and performance analysis | Manually runs CLI tools and pastes results into documents |
| Account manager | Presents findings and action plan to client | Reformats raw audit output into a readable format manually |

---

## 4. User flow — four explicit phases

Each phase is a discrete step gated by a user action. The system never advances automatically.

```
Phase 1: Intake form
  ↓  [user clicks "Save & Enable Audit"]
Phase 2: Audit execution
  ↓  [user clicks "Start Audit"]
Phase 3: Report generation
  ↓  [user clicks "Generate Report"]
Phase 4: Goal planning & task creation
  ↓  [user clicks "Save Tasks"]
```

---

## 5. Phase 1 — Intake form

### 5.1 Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| Site URL | URL input | Yes | Validated as a well-formed URL; https:// prefixed if omitted |
| Site name | Text | Yes | Used as the audit session label |
| CMS / Stack | Select + conditional text | Yes | WordPress, Next.js, Nuxt, Laravel, Shopify, Custom, Other. Selecting **Other** reveals a required free-text input "Describe your stack" stored as `cmsOther` |
| Industry | Text | Yes | Free text (e.g. "Real estate", "E-commerce") |
| Niche + keywords | Textarea | Yes | Primary niche and 3–10 target keywords, one per line |
| Target market | Text | Yes | Description of the intended audience |
| Competitors | URL list | No | Up to 5 competitor URLs; add/remove rows. Each entry is validated as a well-formed URL with the same rules as Site URL (https:// prefixed if omitted; invalid URLs show "Enter a valid URL" inline) |
| Local repo | Folder picker | No | Native OS folder dialog backed by `audit_open_folder` Tauri command. After selection the engine validates: (a) path exists on disk, (b) directory is non-empty. If validation fails, shows "Could not find a valid project at this path" and clears the field |
| Business goal | Textarea | Yes | What the site is trying to achieve |
| Budget / timeline | Text | No | Free text (e.g. "₹50k / 3 months") |

### 5.2 Behaviour

- An active project must be open before a new audit can be created. If no project is active, **+ New Audit** is disabled with tooltip "Open a project first".
- The form validates required fields inline before allowing save. Validation messages:
  - Empty required field → "This field is required"
  - Malformed Site URL → "Enter a valid URL (e.g. https://example.com)"
  - Malformed competitor URL → "Enter a valid URL"
  - Local repo path fails validation → "Could not find a valid project at this path"
- "Save" writes the intake record to `{project_path}/audits/{session_id}/intake.json`
- Once saved, the **Start Audit** button becomes enabled
- The form remains editable after save; re-saving updates the file and re-enables the button
- If the user edits intake **after Phase 2 has started or completed**, a warning banner appears: "Audit data exists for this session. Re-saving will not automatically re-run the audit. To apply changes, start a new audit." Re-saving is still allowed but does not invalidate existing raw output or reports.
- Draft auto-save: while the form is dirty (unsaved changes), the draft is written to `{session_id}/intake.draft.json` on each field blur. On app reopen the draft is restored and the form reopens in edit state with a "Unsaved draft restored" notice.
- If a local repo path is provided, it is used in Phase 2 in addition to the live URL

### 5.3 Session ID strategy

- Session IDs are UUID v4 strings generated client-side via `crypto.randomUUID()` at the moment **+ New Audit** is clicked
- The session ID is included in `intake.json` and `intake.draft.json` as the `sessionId` field
- The session ID is never displayed raw to the user; the audit label shown in the left panel is `{siteName} — {shortDate}`

### 5.4 Session discovery

- `audit_list_sessions` reads the directory `{project_path}/audits/` and returns all subdirectories that contain an `intake.json` file
- A central index file is not used; discovery is by glob so no index can become stale
- Results are sorted by `intake.json → createdAt` descending (newest first)
- The command is called on mode switch to 'audit' and after each `audit_save_intake`

### 5.5 Duplicate session handling

- When the user clicks **+ New Audit**, if an existing session already has the same `siteUrl`, a confirmation dialog appears: "You already have an audit for {siteUrl}. Start a new one or continue the existing session?" — buttons: **Continue existing** / **Start new**

### 5.6 Session list panel

`SessionList.tsx` displays:
- Each session as a card showing: site name (bold), site URL (muted), phase badge (`Intake` / `Running` / `Cancelled` / `Report` / `Goals` / `Complete`), and relative date ("3 days ago"). `Complete` badge is shown when `phase === 'complete'` (tasks saved at least once).
- Active session is highlighted with the accent border
- Hover shows no extra action — clicking the card switches the active session
- Empty state: illustration + "No audits yet" + "Start your first site audit →" button that triggers **+ New Audit**

---

## 6. Phase 2 — Audit execution

### 6.1 Audit dimensions

The engine runs checks across these dimensions based on intake data:

| Dimension | Source | Method |
|---|---|---|
| Performance | Live URL | Lighthouse CLI via Go `os/exec` |
| SEO on-page | Live URL | HTML fetch + Claude analysis |
| Accessibility | Live URL | Lighthouse a11y category (built-in; no separate install) |
| Technical health | Live URL | HTTP headers, robots.txt, sitemap, redirects |
| Code quality | Local repo (if provided) | Claude Code CLI traversal of source files |
| Content & copy | Live URL + local repo | Claude analysis against keywords and target market |
| Competitor gap | Competitor URLs (if provided) | Claude comparison summary |
| Security basics | Live URL | HTTP security headers check |

### 6.2 Concurrency model

`runner.go` runs dimensions in **parallel** using a worker pool capped at **3 concurrent dimensions**. This keeps total runtime under 3 minutes for typical sites while preventing CPU/network saturation.

Execution order within the pool is non-deterministic but the UI renders all 8 rows from the start. Dependencies (e.g. content analysis requires the HTML fetch to complete) are handled internally in `runner.go` by sequencing dependent sub-steps — they are not exposed as separate dimension rows.

### 6.3 Engine prerequisites

Before spawning any audit work `runner.go` checks that all required host tools are present:

| Tool | Check | Failure behaviour |
|---|---|---|
| `lighthouse` | `which lighthouse` | Dimension `performance` and `accessibility` are skipped; rows show `Skipped` with tooltip "Lighthouse not found — run `npm i -g lighthouse`" |
| `claude` | `which claude` | Dimensions requiring Claude CLI are skipped; alert banner: "Claude Code CLI not found — install from claude.ai/cli" |
| `git` | `which git` | Code quality dimension skips git-based analysis only; does not block the dimension |

The check runs once at **audit_start**, not at app launch. Results are emitted as an `audit_log_line` at level `warn` before the first dimension begins.

### 6.4 User interaction

- User clicks **Start Audit** — no audit begins before this action
- A progress log streams into the right panel (same `LogLine` component reused from Workspace)
- Each dimension shows as a status row: `[ ] Pending → [~] Running → [✓] Done / [!] Error / [–] Skipped`
- User can see live log output from the Go engine (same `onLogLine` event pattern)
- **Log level display:** `error` lines render in red, `warn` in amber, `info` in default text colour — no filter toggle in v1
- **Estimated duration:** A static label below the progress header reads "Estimated time: 2–4 minutes" from the moment the audit starts; no dynamic countdown in v1
- **Score display:** Each dimension's score (`nn/100`) is populated and shown in the status row as soon as that dimension reaches `done`. Scores are not withheld until all dimensions finish.
- **Skipped dimensions:** Rows for skipped dimensions (competitor gap when no URLs provided; code quality when no local repo) remain visible but show `[–] Skipped` in muted text. They are not hidden.
- **Error detail:** Clicking an `[!] Error` row expands an inline detail area showing the `errorMessage` string. The rest of the dimensions are unaffected and continue running.
- If any dimension errors, it is marked with a warning; the rest continue
- A **Cancel** button stops the audit mid-run
- Once all non-skipped dimensions complete (with done or error), the **Generate Report** button becomes enabled; cancelled sessions do not enable this button

### 6.5 Cancel behaviour

When the user clicks **Cancel**:

1. Tauri sends `{ "action": "audit_cancel", "sessionId": "…" }` to the engine stdin
2. `runner.go` receives the signal and calls `cancel()` on the Go context that was passed to all worker goroutines
3. Each in-flight worker receives the cancellation and terminates; child processes (Lighthouse, Claude CLI) are killed via `cmd.Process.Kill()` before the goroutine exits — no orphaned processes
4. The session `phase` is set to `'cancelled'` and written to `intake.json`
5. Partial `raw/` files from completed dimensions are **kept** — they are valid outputs and may be useful for debugging
6. Incomplete `raw/` files from in-flight dimensions are **deleted** to avoid corrupt partial JSON
7. The session list card shows a `Cancelled` phase badge
8. **Generate Report** remains disabled for a cancelled session. The user must start a new audit (or re-run — see §6.6)

### 6.6 Audit re-run

A **Re-run Audit** button appears on the Phase 2 panel after an audit completes or is cancelled:

- Clicking it sets the session phase back to `'intake'`, deletes all files under `raw/`, and re-enables **Start Audit**
- A confirmation dialog appears first: "This will delete all existing audit data for this session. Continue?"
- The existing `intake.json` is preserved; the user may edit intake before re-running

### 6.7 Raw output file schemas

Each dimension writes a structured JSON file to `{session_id}/raw/`. These schemas are the contract between `runner.go` / `claude_analyst.go` and `report_builder.go`.

```jsonc
// performance.json — Lighthouse JSON report (subset)
{
  "score": 0.82,                    // 0–1 float from Lighthouse
  "metrics": {
    "fcp": 1800,                    // ms
    "lcp": 2500,
    "tbt": 120,
    "cls": 0.05,
    "si": 2200,
    "tti": 3100
  },
  "opportunities": [                // Lighthouse opportunities array (raw)
    { "id": "render-blocking-resources", "title": "…", "savings_ms": 450 }
  ]
}

// seo.json — Claude HTML analysis
{
  "score": 72,                      // 0–100 integer assigned by Claude
  "title": "Current page title",
  "metaDescription": "…",
  "h1": ["…"],
  "canonicalUrl": "…",
  "openGraph": { "title": "…", "image": "…" },
  "issues": [
    { "severity": "high" | "medium" | "low", "description": "…" }
  ]
}

// accessibility.json — Lighthouse a11y category output
{
  "score": 0.91,                    // 0–1 float
  "audits": [                       // failing audits only
    { "id": "color-contrast", "title": "…", "description": "…" }
  ]
}

// technical.json — HTTP header + robots + sitemap checks
{
  "score": 65,
  "redirectChain": ["http://…", "https://…"],
  "robotsTxt": { "found": true, "disallowedPaths": ["/admin"] },
  "sitemapXml": { "found": true, "urlCount": 142 },
  "httpVersion": "HTTP/2",
  "issues": [{ "severity": "high" | "medium" | "low", "description": "…" }]
}

// code_audit.json — Claude Code CLI output
{
  "score": 68,
  "findings": [
    { "severity": "high" | "medium" | "low", "file": "src/…", "description": "…" }
  ],
  "summary": "…"
}

// content.json — Claude content analysis
{
  "score": 74,
  "keywordCoverage": { "found": ["seo", "audit"], "missing": ["conversion"] },
  "readabilityGrade": "Grade 10",
  "issues": [{ "severity": "high" | "medium" | "low", "description": "…" }]
}

// competitors.json — Claude competitor gap
{
  "score": null,                    // no numeric score for gap analysis
  "competitors": [
    {
      "url": "https://competitor.com",
      "strengths": ["…"],
      "gaps": ["…"]
    }
  ],
  "summary": "…"
}

// security.json — HTTP security headers
{
  "score": 55,
  "headers": {
    "strictTransportSecurity": true,
    "contentSecurityPolicy": false,
    "xFrameOptions": true,
    "xContentTypeOptions": true,
    "referrerPolicy": false
  },
  "issues": [{ "severity": "high" | "medium" | "low", "description": "…" }]
}
```

### 6.8 HTTP fetch error handling

When `html_fetcher.go` or `header_checker.go` makes an HTTP request and receives a non-2xx response:

| Status | Handling |
|---|---|
| 403 / 407 (bot protection) | Dimension is marked `error`; `errorMessage`: "Site blocked automated access (403). Manual review required." |
| 429 (rate limit) | Retry once after 5 s; if still 429, mark `error`: "Rate limited (429). Try again later." |
| 5xx | Mark `error`: "Server error ({status}). The site may be down." |
| Timeout (> 30 s) | Mark `error`: "Request timed out after 30 s." |

Non-fatal: other dimensions that do not depend on the live URL (code quality, competitor gap) are unaffected and continue.

### 6.9 Local repo audit detail

When a local repo path is present:

- Go engine spawns `claude` CLI with the repo path as working directory
- Passes a structured prompt covering: file structure overview, dependency audit, dead code, security anti-patterns, performance bottlenecks, and alignment with the stated business goal
- Claude Code CLI output is streamed and captured as structured JSON matching the `code_audit.json` schema in §6.7
- The output is stored as `{session_id}/raw/code_audit.json`

---

## 7. Phase 3 — Report generation

### 7.1 Report structure

User clicks **Generate Report**. The engine:

1. Reads all raw audit outputs from `{session_id}/raw/`
2. Passes them to Claude with the report-assembly prompt (§7.3)
3. Writes the streaming output to `{session_id}/report.md`
4. Emits `audit_report_ready` — Tauri reads the file via `audit_read_report` and dispatches `AUDIT_REPORT_READY` with `{ reportPath, markdown }`

The report contains:

```
# Site Audit Report — {Site name}
Date: {ISO date}
Audited by: Loom Studio

## Executive Summary
[3–5 sentence overview for non-technical readers]

## Score Card
| Dimension       | Score  | Status |
|-----------------|--------|--------|
| Performance     | xx/100 | ●      |
| SEO             | xx/100 | ●      |
| Accessibility   | xx/100 | ●      |
| Technical health| xx/100 | ●      |
| Code quality    | N/A    | –      |  ← "N/A" when skipped; "Error" when dimension errored
| Content         | xx/100 | ●      |
| Security        | xx/100 | ●      |
| Competitor gap  | –      | –      |  ← row omitted when no competitors provided

## Critical Issues
[Numbered list of blockers — things that must be fixed]

## Dimension Findings
### Performance
### SEO
### Accessibility
### Technical Health
### Code Quality          ← section omitted when skipped
### Content & Copy
### Competitor Gap        ← section omitted when no competitors provided
### Security

## Recommended Actions
[Prioritised list mapped to dimensions]

## Intake Reference
[Echoes back the intake form fields for traceability]
```

**Scorecard null-score convention:**
- Dimension `skipped` → score cell shows `N/A`, status cell shows `–`
- Dimension `error` → score cell shows `Error`, status cell shows `!`
- These rows are still present in the table (not omitted) so the report is consistent

### 7.2 Behaviour

- **Generate Report** is enabled only when at least the following raw files exist: `performance.json` or `seo.json` (minimum 1 URL-based dimension must have completed successfully). If this minimum is not met, the button is disabled with tooltip "Not enough audit data to generate a report."
- Clicking **Generate Report** a second time (report already on disk) shows a confirmation: "A report already exists for this session. Regenerate it?" — buttons **Regenerate** / **Cancel**. Regeneration overwrites `report.md`.
- While the report is being generated, the right panel shows a spinner and the status message "Generating report… this may take 30–60 seconds."
- If report generation fails (Claude process crash, API error, malformed output), an error banner appears: "Report generation failed. {error message}" with a **Retry** button. The session phase does not advance to `'report'`.
- Once `report.md` exists, it is rendered in a read-only Markdown viewer using `react-markdown` with the `remark-gfm` plugin (tables, strikethrough, task lists) and `remark-slug` for anchor-linked section headers. Code blocks use a monospace pre element with a copy button.
- A fixed sidebar-of-contents (TOC) panel lists the top-level headings and scroll-spies the active section.
- A **Copy Report** button copies the full markdown to the clipboard.
- A **Export as Markdown** button copies the existing `report.md` file to a user-chosen path via native Save dialog (no re-render).
- Navigation: a **← View Audit Log** button at the top of the report panel switches the right panel back to the Phase 2 log and dimension status without losing the report. Switching back shows a **View Report →** button.
- The **Proceed to Goal Planning** button becomes enabled once the report exists on disk.

### 7.3 Report-assembly prompt

`report_builder.go` invokes Claude CLI in one-shot (`--print`) mode with the session's `raw/` directory as CWD:

```
claude --dangerously-skip-permissions \
  --output-format stream-json \
  --print "<PROMPT>" \
  --cwd {session_id}/raw/
```

**Prompt template (passed as `--print` argument):**

```
You are a senior web-strategy consultant producing a site audit report for a client.
You have access to the following audit data files in the current directory:
  performance.json, seo.json, accessibility.json, technical.json,
  code_audit.json (if present), content.json, competitors.json (if present),
  security.json

Intake context:
  Site: {siteName} ({siteUrl})
  CMS: {cms}{cmsOther}
  Industry: {industry}
  Keywords: {nicheKeywords}
  Target market: {targetMarket}
  Business goal: {businessGoal}

Instructions:
1. Read each available JSON file.
2. For missing/skipped files, mark the dimension as N/A in the scorecard and omit its findings section.
3. For errored dimensions (files with an "error" key), mark as Error in the scorecard and note it briefly.
4. Write the report in the exact markdown structure below. Do not add extra top-level sections.
5. Target length: 1500–2000 words total (≈ 150–250 words per dimension findings section).
6. Executive Summary must be non-technical and client-readable — avoid jargon.
7. Score integers in the scorecard come from the "score" field in each JSON file;
   Lighthouse float scores (0–1) must be multiplied by 100 and rounded.
8. Recommended Actions must be numbered and ordered by impact.

Output the full report in markdown. Output nothing else — no preamble, no explanation.

[REPORT STRUCTURE]
# Site Audit Report — {siteName}
... (full structure as defined in §7.1)
```

The prompt is constructed in `report_builder.go` by substituting the intake fields. The `--cwd` flag ensures Claude can read the raw JSON files by relative path without the engine embedding them in the prompt, avoiding context window overflow for large Lighthouse payloads.

---

## 8. Phase 4 — Goal planning & task creation

### 8.1 Goal plan structure

User clicks **Proceed to Goal Planning**. The engine passes the report to Claude with a task-planning prompt (§8.4). Claude returns a JSON array of tasks organised into six buckets:

| Bucket key | Label | Description |
|---|---|---|
| `critical` | Critical tasks | Must-fix issues — site is broken or severely penalised without these |
| `this_week` | This week | High-urgency improvements achievable in 7 days |
| `high_priority` | High priority | Important but not urgent — target within 30 days |
| `this_month` | This month | Broader improvements for the current month |
| `ongoing` | Ongoing tasks | Recurring work (e.g. content publishing, link building, monitoring) |
| `content_links` | Content + links | Specific content creation and link-building actions |

Each task in the plan:

```json
{
  "title": "Fix missing meta descriptions on 12 product pages",
  "bucket": "this_week",
  "dimension": "SEO",
  "effort": "Medium",
  "owner": null,
  "notes": "Pages identified: /product/a, /product/b …",
  "linked_report_section": "SEO"
}
```

### 8.2 Owner assignment

- Each task card shows an **Assign owner** dropdown (free-text or select from a stored team list)
- Team members can be added inline; names persist to `{project_path}/team.json`
- Owner assignment is optional — tasks can be saved unassigned

**`team.json` schema:**

```json
{
  "version": 1,
  "members": [
    { "name": "Alice", "role": "Developer" },
    { "name": "Bob",   "role": "Content" }
  ]
}
```

- `GoalPlanner.tsx` reads this file on mount via `audit_read_team` Tauri command; writes via `audit_save_team`
- Adding a new member inline appends to the array and writes the file immediately
- `role` is optional free-text for display only; does not affect task logic

### 8.3 Goal plan behaviour

**Generation:**
- User clicks **Proceed to Goal Planning** — nothing generates before this action
- While the plan is being generated, the right panel shows a spinner and "Generating goal plan… this may take 30–60 seconds."
- If generation fails (Claude crash, timeout, malformed JSON), an error banner appears: "Goal plan generation failed. {error message}" with a **Retry** button. Session phase does not advance.
- `goal_planner.go` emits `audit_goals_ready` with the parsed `GoalTask[]` once the plan is ready

**Re-generation:**
- If a `goal_plan.json` already exists for the session, clicking **Proceed to Goal Planning** shows a confirmation dialog: "A goal plan already exists for this session. Regenerate it?" — buttons **Regenerate** / **Cancel**. Regeneration overwrites `goal_plan.json`.

**Persistence:**
- The generated task list is written to `{session_id}/goal_plan.json` immediately when `audit_goals_ready` fires
- While the user edits tasks in the Phase 4 panel, changes are auto-saved to `goal_plan.json` on each edit (debounced 500 ms). This is the draft store; it is separate from the final TASK-XXX.md write.
- On app reopen, Phase 4 loads from `goal_plan.json` — the user can continue editing without regenerating

**Editing:**
- User reviews the generated task list and can edit tasks before saving
- **Inline edit UX:** each field on a `GoalTaskCard` is click-to-edit. Clicking a title, notes, or owner cell activates an inline text input; clicking bucket or effort activates a select dropdown. A pencil icon appears on card hover to hint editability.
- User can delete individual tasks (trash icon, no confirmation needed)
- User can add a manual task to any bucket via an **+ Add task** button in each bucket section
- **Manual task defaults:** `title = ""` (input focused immediately), `bucket = current section`, `effort = "Medium"`, `owner = null`, `notes = ""`

**Saving:**
- **Save Tasks** routes through the Go engine (`audit_save_tasks` stdin command); Go writes each TASK-XXX.md and emits `audit_tasks_saved` — Tauri does not write task files directly
- If a session already has saved tasks (`taskCount > 0`), Phase 4 reopens showing the `goal_plan.json` state with a "Tasks previously saved" notice; **Save Tasks** remains enabled for additional saves
- After save, a toast confirms: "N tasks saved to Workspace." The toast auto-dismisses after 4 seconds; no Undo action in v1.
- An **Open in Workspace** button switches the app to `appMode: 'run'` with the active project loaded

### 8.4 Goal planner Claude prompt

`goal_planner.go` invokes Claude CLI in one-shot (`--print`) mode with the session directory as CWD so Claude can read `report.md` by relative path:

```
claude --dangerously-skip-permissions \
  --output-format stream-json \
  --print "<PROMPT>" \
  --cwd {session_id}/
```

**Prompt template:**

```
You are a senior web strategist creating an actionable goal plan from a completed site audit.

Audit context:
  Site: {siteName} ({siteUrl})
  Industry: {industry}
  Business goal: {businessGoal}
  Budget / timeline: {budgetTimeline}

The audit report is in report.md in the current directory. Read it before generating tasks.

Instructions:
1. Read report.md.
2. Generate a task list organised into these exact buckets (use these exact key strings):
   critical, this_week, high_priority, this_month, ongoing, content_links
3. Each task must have these fields:
   title (string), bucket (one of the six keys above), dimension (audit dimension name),
   effort ("Low" | "Medium" | "High"), owner (null), notes (string),
   linked_report_section (string matching a section heading in report.md)
4. Generate 15–25 tasks total. At least 2 tasks per non-empty bucket.
5. Prioritise tasks that directly address Critical Issues listed in the report.
6. Keep titles concise and actionable (verb + object, under 10 words).

Output ONLY a valid JSON array of task objects. No preamble, no trailing text, no markdown fences.
Example:
[{"title":"Fix missing meta descriptions","bucket":"critical","dimension":"SEO","effort":"High","owner":null,"notes":"…","linked_report_section":"SEO"}]
```

### 8.5 Claude output parsing strategy

`goal_planner.go` collects the full streamed output then:

1. Strips leading/trailing whitespace
2. Attempts `json.Unmarshal` into `[]GoalTask`
3. **On success:** validates each task has a non-empty `title` and a valid `bucket` value; drops invalid tasks with a `warn` log line
4. **On malformed JSON** (truncated output, extra text wrapper): logs the raw output as a `warn` line and emits `audit_error` with message "Goal plan JSON was malformed — please retry"; session stays in `'goals'` phase; the error banner + Retry are shown in the UI (see §8.3)
5. Minimum threshold: at least 1 valid task. Zero valid tasks after parsing → treated as malformed.

### 8.6 TASK-XXX.md frontmatter schema

`task_writer.go` writes each `GoalTask` as a markdown file with YAML frontmatter:

```yaml
---
id: TASK-{NNN}
title: "{task.title}"
type: "{bucket_type}"          # see mapping table below
status: open
effort: "{task.effort}"
priority: "{bucket_priority}"  # see mapping table below
due: "{due_date}"              # ISO date; blank for ongoing/content_links
owner: "{task.owner}"          # blank string if null
dimension: "{task.dimension}"
linked_report_section: "{task.linkedReportSection}"
session_id: "{session_id}"
created_at: "{ISO timestamp}"
---

{task.notes}
```

**Bucket → frontmatter mapping:**

| Bucket key | `type` | `priority` | `due` |
|---|---|---|---|
| `critical` | `task` | `critical` | today + 3 days |
| `this_week` | `task` | `high` | today + 7 days |
| `high_priority` | `task` | `high` | today + 30 days |
| `this_month` | `task` | `medium` | today + 30 days |
| `ongoing` | `recurring` | `low` | *(blank)* |
| `content_links` | `task` | `medium` | today + 30 days |

**TASK-XXX numbering strategy:**
- `task_writer.go` globs `{project_path}/harness/tasks/TASK-*.md` and parses the highest existing number
- New tasks are numbered sequentially from `max + 1`; if no existing tasks, numbering starts at TASK-001
- All tasks in a single save batch are numbered atomically before any files are written, preventing gaps or collisions with concurrent saves

### 8.7 `goal_plan.json` lifecycle

`goal_plan.json` stores the full task list as it exists in the Phase 4 editor (generated + manually added tasks).

**Schema:**
```json
{
  "version": 1,
  "sessionId": "{uuid}",
  "generatedAt": "{ISO timestamp}",
  "savedAt": "{ISO timestamp | null}",
  "tasks": []
}
```

- Written by `goal_planner.go` when `audit_goals_ready` fires
- Updated by debounced (500 ms) auto-save as the user edits in Phase 4
- `savedAt` is set by `task_writer.go` after TASK-XXX.md files are written; used to show "Tasks previously saved" notice
- On session reload, `SiteAudit.tsx` reads `goal_plan.json` to restore Phase 4 state
- Source of truth for Phase 4 editing; TASK-XXX.md files are the output (not the source)

---

## 9. Navigation & app mode

### 9.1 Sidebar entry

A new mode entry **Site Audit** is added to the Sidebar below Content Quality Checker.

```
Sidebar modes (appMode):
  'run'      → Workspace
  'harness'  → Harness Manager
  'qa'       → QA & Testing
  'github'   → GitHub PR
  'cqc'      → Content Quality Checker
  'audit'    → Site Audit          ← NEW
```

### 9.2 Panel layout

```
┌──────────────┬────────────────────────────────────────────────┐
│  Left panel  │  Right panel                                   │
│  (320 px)    │  (flex)                                        │
│              │                                                │
│  Audit list  │  Phase 1: Intake form                          │
│  (sessions)  │  ── or ──                                      │
│              │  Phase 2: Progress log + dimension status      │
│  [+ New]     │  ── or ──                                      │
│              │  Phase 3: Report viewer                        │
│              │  ── or ──                                      │
│              │  Phase 4: Goal plan editor                     │
└──────────────┴────────────────────────────────────────────────┘
```

- Left panel lists all saved audit sessions for the active project, sorted by date
- Clicking a session loads its current phase state
- **+ New Audit** starts a fresh session

---

## 10. Technical architecture

### 10.1 System overview

```
┌─────────────────────────────────────────────────────────────┐
│  React Frontend (src/components/SiteAudit/)                 │
│  IntakeForm · AuditProgress · ReportViewer · GoalPlanner    │
└──────────────────────┬──────────────────────────────────────┘
                       │ invoke('audit_*') / Tauri IPC
┌──────────────────────▼──────────────────────────────────────┐
│  Tauri Rust Commands  (src-tauri/src/commands.rs)           │
│  audit_save_intake · audit_start · audit_cancel             │
│  audit_generate_report · audit_generate_goal_plan           │
│  audit_save_tasks · audit_list_sessions · audit_open_folder │
└──────────────────────┬──────────────────────────────────────┘
                       │ JSON commands over stdin
┌──────────────────────▼──────────────────────────────────────┐
│  Go Engine  (src-tauri/binaries/loom-engine/)               │
│  audit/runner.go — orchestrates all dimensions              │
│  audit/lighthouse.go — Lighthouse CLI wrapper               │
│  audit/html_fetcher.go — HTTP fetch + header checks         │
│  audit/claude_analyst.go — Claude Code CLI invocation       │
│  audit/report_builder.go — assemble + write report.md      │
│  audit/goal_planner.go — task generation via Claude         │
│  audit/store.go — read/write session JSON files             │
└─────────────────┬───────────────────────────────────────────┘
                  │                    │
    ┌─────────────▼──────┐   ┌─────────▼──────────────────────┐
    │  Claude Code CLI   │   │  OS tools                      │
    │  (code analysis,   │   │  Lighthouse CLI                │
    │   report writing,  │   │  curl / net/http               │
    │   goal planning)   │   │  git (local repo context)      │
    └────────────────────┘   └────────────────────────────────┘
```

### 10.2 State additions (src/context/types.ts)

```typescript
// New AppState fields
auditSessions: AuditSession[]
activeAuditSession: AuditSession | null
auditPhase: 'intake' | 'running' | 'report' | 'goals'
auditDimensions: AuditDimensionStatus[]
auditLog: LogLine[]

// New types
interface AuditSession {
  id: string                     // UUID v4 — crypto.randomUUID()
  version: number                // schema version, starts at 1
  projectId: string
  siteName: string
  siteUrl: string
  createdAt: string              // ISO 8601 timestamp
  updatedAt: string              // ISO 8601 timestamp — updated on each save
  phase: AuditPhase
  intakePath: string             // path to intake.json
  reportPath: string | null      // path to report.md
  taskCount: number              // tasks saved to harness
}

interface AuditIntake {
  siteUrl: string
  siteName: string
  cms: CmsOption
  cmsOther: string               // only populated when cms === 'other'
  industry: string
  nicheKeywords: string
  targetMarket: string
  competitors: string[]          // max 5; each validated as well-formed URL
  localRepoPath: string | null   // validated: path exists + non-empty dir
  businessGoal: string
  budgetTimeline: string
}

type CmsOption =
  | 'wordpress' | 'nextjs' | 'nuxt' | 'laravel'
  | 'shopify' | 'custom' | 'other'

type AuditPhase = 'intake' | 'running' | 'report' | 'goals' | 'cancelled' | 'complete'
// 'cancelled' — audit was started but the user cancelled before all dimensions completed
// 'complete'  — tasks have been saved to harness/tasks/ at least once

interface AuditDimensionStatus {
  key: string
  label: string
  status: 'pending' | 'running' | 'done' | 'error' | 'skipped'
  // 'skipped' — dimension was not run (e.g. no competitors provided, no local repo)
  score: number | null
  // score is populated as soon as the dimension reaches 'done'; null for 'skipped' and 'error'
  errorMessage: string | null
  // non-null when status === 'error'; shown in the expanded row detail
}

interface GoalTask {
  id: string
  title: string
  bucket: GoalBucket
  dimension: string
  effort: 'Low' | 'Medium' | 'High'
  owner: string | null
  notes: string
  linkedReportSection: string
}

type GoalBucket =
  | 'critical' | 'this_week' | 'high_priority'
  | 'this_month' | 'ongoing' | 'content_links'
```

### 10.3 New AppAction types

```typescript
// Intake
| { type: 'AUDIT_SESSION_CREATED'; payload: AuditSession }
| { type: 'AUDIT_INTAKE_SAVED'; payload: AuditIntake }

// Execution
| { type: 'AUDIT_STARTED' }
| { type: 'AUDIT_DIMENSION_STATUS'; payload: AuditDimensionStatus }
| { type: 'AUDIT_LOG_LINE'; payload: LogLine }
| { type: 'AUDIT_COMPLETED' }
| { type: 'AUDIT_CANCELLED' }

// Report
| { type: 'AUDIT_REPORT_READY'; payload: { reportPath: string; markdown: string } }

// Goals
| { type: 'AUDIT_GOALS_READY'; payload: GoalTask[] }
| { type: 'AUDIT_GOAL_TASK_UPDATED'; payload: GoalTask }
| { type: 'AUDIT_GOAL_TASK_REMOVED'; payload: string }
| { type: 'AUDIT_TASKS_SAVED'; payload: { count: number } }
// reducer: sets activeAuditSession.phase → 'complete', increments activeAuditSession.taskCount by count, shows auto-dismiss toast
```

### 10.4 Tauri commands (src-tauri/src/commands.rs additions)

```rust
// Intake
#[tauri::command] audit_save_intake(project_path, session_id, intake: AuditIntake)
#[tauri::command] audit_list_sessions(project_path) -> Vec<AuditSession>
#[tauri::command] audit_load_session(project_path, session_id) -> AuditSession

// Execution
#[tauri::command] audit_start(project_path, session_id)
#[tauri::command] audit_cancel(project_path, session_id)

// Report
#[tauri::command] audit_generate_report(project_path, session_id)
#[tauri::command] audit_read_report(project_path, session_id) -> String
#[tauri::command] audit_export_report(project_path, session_id, dest_path)

// Goals
#[tauri::command] audit_generate_goal_plan(project_path, session_id)
#[tauri::command] audit_read_goal_plan(project_path, session_id) -> GoalPlanJson
#[tauri::command] audit_save_tasks(project_path, session_id, tasks: Vec<GoalTask>)
// audit_save_tasks routes to Go engine via stdin; engine writes TASK-XXX.md files and emits audit_tasks_saved

// Team
#[tauri::command] audit_read_team(project_path) -> TeamJson
#[tauri::command] audit_save_team(project_path, team: TeamJson)
```

All commands route to the Go engine via `engineCommand(payload)` using the existing stdin pipe, except file reads/writes which go through Tauri's built-in FS access.

### 10.5 Go engine commands (stdin → engine routing)

```json
// Start audit
{ "action": "audit_start", "projectPath": "…", "sessionId": "…" }

// Cancel
{ "action": "audit_cancel", "sessionId": "…" }

// Generate report
{ "action": "audit_generate_report", "projectPath": "…", "sessionId": "…" }

// Generate goal plan
{ "action": "audit_generate_goal_plan", "projectPath": "…", "sessionId": "…" }

// Save tasks
{ "action": "audit_save_tasks", "projectPath": "…", "sessionId": "…", "tasks": […] }
```

### 10.6 Go engine events (stdout → Tauri → React)

| Event | Payload | Triggers |
|---|---|---|
| `audit_dimension_status` | `{ key, label, status, score }` | Per-dimension progress update |
| `audit_log_line` | `{ timestamp, level, content }` | Streaming log for the progress panel |
| `audit_completed` | `{ sessionId }` | All dimensions done |
| `audit_cancelled` | `{ sessionId }` | Audit stopped by user |
| `audit_report_ready` | `{ sessionId, reportPath }` | Report written to disk; Tauri immediately calls `audit_read_report` and dispatches `AUDIT_REPORT_READY` with `{ reportPath, markdown }` |
| `audit_goals_ready` | `{ sessionId, tasks[] }` | Goal plan ready for review |
| `audit_tasks_saved` | `{ sessionId, count }` | Tasks written to harness/ |
| `audit_error` | `{ sessionId, dimension, message }` | Non-fatal dimension error |

### 10.7 File structure on disk

```
{project_path}/
  audits/
    {session_id}/
      intake.json           ← Phase 1 output (includes sessionId, version, createdAt, updatedAt)
      intake.draft.json     ← Auto-saved draft while form is dirty; deleted on successful save
      raw/
        performance.json    ← Lighthouse output
        seo.json            ← Claude HTML analysis
        accessibility.json  ← axe/Lighthouse a11y
        technical.json      ← HTTP headers, robots, sitemap
        code_audit.json     ← Claude Code CLI output (if local repo)
        content.json        ← Claude content analysis
        competitors.json    ← Competitor gap analysis
        security.json       ← Security header checks
      report.md             ← Phase 3 output
      goal_plan.json        ← Phase 4 raw tasks before save
```

### 10.8 Go engine module structure

```
src-tauri/binaries/loom-engine/
  audit/
    runner.go           ← Orchestrates dimensions in parallel (worker pool, max 3 concurrent)
    store.go            ← Read/write intake.json, session index
    lighthouse.go       ← Spawn Lighthouse CLI, parse JSON output
    html_fetcher.go     ← HTTP GET, extract meta tags, headings, links
    header_checker.go   ← Inspect HTTP response headers (security, redirects)
    robots_checker.go   ← Fetch and parse robots.txt + sitemap.xml
    claude_analyst.go   ← Build prompts, invoke Claude CLI, capture output
    report_builder.go   ← Assemble raw/ files into report.md via Claude
    goal_planner.go     ← Pass report to Claude, parse task JSON response
    task_writer.go      ← Write GoalTask[] as TASK-XXX.md files
```

### 10.9 Claude Code CLI invocation pattern

Follows the existing harness pattern from `invokeClaudeHarness`:

```
claude --dangerously-skip-permissions \
  --output-format stream-json \
  --print "<structured audit prompt>" \
  [--cwd {local_repo_path}]
```

For code audits the `--cwd` flag points to the local repository so Claude sees the actual source tree. For report writing and goal planning it runs in the session's `raw/` directory.

### 10.10 New frontend components

```
src/components/SiteAudit/
  SiteAudit.tsx             ← Top-level shell, phase router
  SiteAudit.module.css
  SessionList.tsx           ← Left panel: saved sessions list
  SessionList.module.css
  IntakeForm.tsx            ← Phase 1 form
  IntakeForm.module.css
  AuditProgress.tsx         ← Phase 2 log + dimension status rows
  AuditProgress.module.css
  DimensionRow.tsx          ← Single dimension status row
  ReportViewer.tsx          ← Phase 3 markdown render
  ReportViewer.module.css
  GoalPlanner.tsx           ← Phase 4 task list editor
  GoalPlanner.module.css
  GoalTaskCard.tsx          ← Individual editable task card
  BucketSection.tsx         ← Groups tasks by bucket label
```

---

## 11. Acceptance criteria

### Phase 1 — Intake form

- [ ] **+ New Audit** is disabled when no project is active
- [ ] All required fields show inline validation messages before save is allowed
- [ ] Site URL and each competitor URL are normalised (https:// prefixed if omitted) and validated
- [ ] Selecting CMS = "Other" reveals a required free-text field; saving without it filled blocks save
- [ ] Folder picker opens OS native dialog via `audit_open_folder` and validates the selected path exists and is non-empty
- [ ] Competitors field allows adding and removing rows up to a maximum of 5
- [ ] Duplicate site URL triggers a "Continue existing or start new?" dialog
- [ ] Intake is written to `audits/{session_id}/intake.json` (including `sessionId`, `version`, `createdAt`, `updatedAt`) on save
- [ ] `intake.draft.json` is written on each field blur; restored on app reopen
- [ ] Start Audit button is disabled until intake is saved
- [ ] Re-saving updated intake re-enables Start Audit
- [ ] Editing intake after audit has run shows the warning banner; save still succeeds without wiping audit data

### Phase 1 — Session list

- [ ] Sessions load from `audits/*/intake.json` on mode switch to 'audit'
- [ ] Sessions are sorted newest-first by `createdAt`
- [ ] Active session is highlighted with accent border
- [ ] Clicking a session card switches the active session and loads its current phase
- [ ] Empty state shows illustration + "No audits yet" + Start button

### Phase 2 — Audit

- [ ] Audit does not begin until the user clicks Start Audit
- [ ] All 8 dimension rows render immediately when audit starts; skipped rows show `[–] Skipped` in muted text (not hidden)
- [ ] Dimensions run in parallel (up to 3 concurrent); each row's status updates independently as its dimension completes
- [ ] Score (`nn/100`) is shown in a dimension row as soon as that dimension reaches `done`, not after all dimensions finish
- [ ] Log lines stream into the panel in real time; `error` lines render red, `warn` lines amber
- [ ] Clicking an `[!] Error` row expands an inline area showing the error message
- [ ] A static "Estimated time: 2–4 minutes" label shows below the header from the moment the audit starts
- [ ] Prerequisites check runs at `audit_start`: missing Lighthouse shows `Skipped` badge on performance/accessibility rows with tooltip; missing Claude CLI shows an alert banner
- [ ] HTTP fetch errors (403, 429, 5xx, timeout) mark the relevant dimension as `error` with an actionable message; other dimensions are unaffected
- [ ] Cancel kills all in-flight child processes (Lighthouse, Claude CLI) before the engine exits — no orphaned processes
- [ ] After cancel: completed `raw/` files are kept; incomplete in-flight files are deleted; session phase is set to `'cancelled'`
- [ ] Session list card shows `Cancelled` badge for a cancelled session
- [ ] Generate Report is disabled for a cancelled session
- [ ] Re-run Audit button appears after audit completes or is cancelled; clicking it shows a confirmation dialog before wiping `raw/` and resetting to intake
- [ ] If a local repo is provided, the code_audit dimension appears in the status list
- [ ] If no competitors are provided, the competitor gap dimension shows `Skipped`

### Phase 3 — Report

- [ ] **Generate Report** is enabled only when at least one URL-based raw file exists (`performance.json` or `seo.json`)
- [ ] **Generate Report** is disabled with tooltip "Not enough audit data to generate a report" when the minimum threshold is not met
- [ ] Clicking **Generate Report** a second time (report already exists) shows a "Regenerate it?" confirmation dialog before overwriting
- [ ] While generating, the right panel shows a spinner and "Generating report… this may take 30–60 seconds."
- [ ] If generation fails, an error banner appears with the error message and a **Retry** button; session phase does not advance
- [ ] Report is rendered using `react-markdown` with `remark-gfm` (tables, task lists) and anchor-linked headings; code blocks include a copy button
- [ ] A TOC sidebar scroll-spies active section headings
- [ ] Skipped dimensions appear in the scorecard as `N/A` / `–`; errored dimensions appear as `Error` / `!`; skipped dimension findings sections are omitted
- [ ] A **Copy Report** button copies full markdown to clipboard
- [ ] **Export as Markdown** copies the existing `report.md` to a user-chosen path via native Save dialog (no re-render)
- [ ] A **← View Audit Log** button switches the right panel back to Phase 2; a **View Report →** button restores the report view
- [ ] `audit_report_ready` event causes Tauri to call `audit_read_report` and dispatch `AUDIT_REPORT_READY` with `{ reportPath, markdown }`
- [ ] **Proceed to Goal Planning** is disabled until `report.md` exists on disk

### Phase 4 — Goal planning

**Generation**
- [ ] Goal plan is generated only when the user clicks **Proceed to Goal Planning** — nothing runs automatically
- [ ] While generating, the right panel shows a spinner and "Generating goal plan… this may take 30–60 seconds."
- [ ] If `goal_plan.json` already exists, clicking **Proceed to Goal Planning** shows a "Regenerate it?" confirmation dialog before overwriting
- [ ] If Claude fails (crash, timeout, malformed JSON), an error banner appears with the error message and a **Retry** button; session phase does not advance
- [ ] Malformed or truncated Claude JSON (that cannot be parsed as `[]GoalTask`) shows the error banner; raw output is logged as a `warn` line
- [ ] Zero valid tasks after parsing is treated as a parse failure (same error path as malformed JSON)

**Display and editing**
- [ ] Tasks appear grouped under all six bucket headings: Critical, This week, High priority, This month, Ongoing, Content + links
- [ ] Each field on a task card is click-to-edit; a pencil icon appears on hover to signal editability
- [ ] Title and notes fields activate an inline text input on click; bucket and effort activate a select dropdown
- [ ] User can delete individual tasks (trash icon; no confirmation dialog)
- [ ] User can add a manual task to any bucket via **+ Add task**; defaults: `title = ""` (focused), `bucket = current section`, `effort = "Medium"`, `owner = null`, `notes = ""`
- [ ] **Assign owner** dropdown in each card shows existing team members from `team.json`; new names can be typed inline and persist to `team.json` immediately

**Persistence**
- [ ] Generated task list is written to `goal_plan.json` as soon as `audit_goals_ready` fires
- [ ] Edits to the task list auto-save to `goal_plan.json` on each change, debounced 500 ms
- [ ] On app reopen, Phase 4 loads from `goal_plan.json` — no regeneration needed
- [ ] If a session already has saved tasks (`taskCount > 0`), Phase 4 reopens showing the `goal_plan.json` state with a "Tasks previously saved" notice; **Save Tasks** remains enabled

**Saving**
- [ ] **Save Tasks** routes through the Go engine (`audit_save_tasks` stdin command); Go engine writes TASK-XXX.md files and emits `audit_tasks_saved` — Tauri does not write task files directly
- [ ] `task_writer.go` globs `harness/tasks/TASK-*.md` and assigns numbers atomically from `max + 1` (starting at TASK-001 if no existing tasks); no collisions with concurrent saves
- [ ] Each TASK-XXX.md is written with YAML frontmatter per the bucket → `type` / `priority` / `due` mapping in §8.6
- [ ] After save, `AUDIT_TASKS_SAVED` reducer sets `activeAuditSession.phase → 'complete'` and increments `activeAuditSession.taskCount` by `count`
- [ ] Session list card shows `Complete` badge once `phase === 'complete'`
- [ ] A toast appears: "N tasks saved to Workspace." Auto-dismisses after 4 seconds; no Undo action in v1
- [ ] **Open in Workspace** switches `appMode` to `'run'` with the active project loaded

---

## 12. Out of scope (v1)

- Automated re-auditing on a schedule
- Diff between two audit sessions
- CI/CD integration (audit on deploy)
- Exporting to PDF or Google Docs
- Multi-user collaboration or shared sessions
- Score trend charts over time

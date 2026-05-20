# Product Requirements Document
## Content Quality Checker Module

| Field | Value |
|---|---|
| Module name | Content Quality Checker (CQC) |
| Parent product | [Internal agency operations app] |
| Document version | 1.1 |
| Date | May 11, 2026 |
| Status | Draft — for internal review |
| Owner | [Agency owner] |
| Tech stack | Tauri (Rust) + Go CLI + Claude Code CLI |

---

## 1. Background and problem

The agency manages content production for multiple clients across social media, posters, and other digital assets. Quality issues are reaching clients and, in some cases, going live publicly. Recurring problems include:

- Spelling mistakes in captions and post copy
- Spelling mistakes baked into poster designs (Canva, Photoshop output)
- Wrong client brand-name spelling (e.g. "RealtyOne" written as "Realty One" or "Realtyone")
- Missing required hashtags
- Use of banned or competitor words
- Incorrect facts — wrong phone numbers, outdated prices, wrong dates, wrong addresses
- Inconsistent tone of voice across team members

Today, catching these issues depends on individual team members being careful, plus an informal manager review. The process is unreliable: mistakes slip through, and when they do, there is no record of who checked what.

The cost is direct: client trust erodes after every visible mistake, retainers get questioned, and the team spends time on rework and damage control instead of new work.

## 2. Goal

Add an AI-powered quality-checking layer to the existing internal app that every piece of content passes through before being sent to a client or published. The layer should be fast enough that the team actually uses it, strict enough to catch the common mistakes, and accountable enough that there is always a record of what was checked.

### Success criteria

- A team member can check a caption or poster in under 10 seconds end to end
- The tool catches the four highest-frequency issue types: brand-name misspelling, generic spelling and grammar errors, missing required hashtags, and contradiction with stored client facts
- Every check produces a log entry tied to a team member, with timestamp
- Adoption: 100% of client-facing content goes through the checker within 30 days of launch
- Quality outcome: 80% reduction in client-reported quality issues within 60 days

### Non-goals (for v1)

- Replacing human judgment on tone or creative direction
- Auto-publishing approved content to social platforms
- Multi-language checking (English first; Malayalam, Hindi, Tamil come in v2)
- Image generation or correction — only detection
- Performance analytics on published content

## 3. Users

| Role | Responsibilities | Pain today |
|---|---|---|
| Content writer / designer | Creates the captions and posters | No reliable self-check before submitting |
| Account manager | Approves before sending to client | Spends time spotting mistakes that should never have reached them |
| Agency owner | Final escalation when mistakes reach clients | Has no audit trail to identify where the gap occurred |

The tool is internal-only. Clients do not see it directly, though the activity log can optionally be shared as a quality-assurance receipt.

## 4. Architecture overview

The module fits cleanly into the existing layered architecture.

```
┌─────────────────────────────────────────────────────┐
│  Tauri Frontend (existing React/Vue/Svelte app)     │
│  New route: /quality-checker                        │
└──────────────────────┬──────────────────────────────┘
                       │ invoke('cqc_*')
┌──────────────────────▼──────────────────────────────┐
│  Tauri Rust Commands (src-tauri/src/commands/cqc.rs)│
│  Thin wrappers, spawn Go CLI, stream events back    │
└──────────────────────┬──────────────────────────────┘
                       │ exec mycli quality ...
┌──────────────────────▼──────────────────────────────┐
│  Go CLI (mycli quality <subcommand>)                │
│  - Builds prompts                                   │
│  - Manages client rules (SQLite)                    │
│  - Invokes Claude Code CLI                          │
│  - Parses JSON, validates, returns                  │
└──────────────────────┬──────────────────────────────┘
                       │ exec claude -p ... --output-format json
┌──────────────────────▼──────────────────────────────┐
│  Claude Code CLI                                    │
│  Already authenticated via your existing setup      │
└─────────────────────────────────────────────────────┘
```

### Why this layering

- The Go CLI does the real work, which means the same `mycli quality check` command works from the Tauri UI, from a developer's terminal, or from a future automation script (Slack bot, CI hook on the design repo, etc.).
- The Rust layer stays thin — easier to maintain and matches the pattern already used by the dev-management module.
- Claude Code CLI is the single AI integration point; no API keys need to live in the Tauri app or in any new place.

## 5. Functional requirements

### 5.1 Client profiles

Each client has a stored profile containing the rules the AI checks against.

| Field | Type | Purpose | Required |
|---|---|---|---|
| id | UUID | Internal identifier | Yes |
| name | Text | Display name | Yes |
| brand_spelling | Text | Canonical spelling of the brand name (e.g. "RealtyOne") | Yes |
| brand_spelling_variants | Text (comma-separated) | Common wrong variants to flag (e.g. "Realty One, realtyone, Realtyone") | No |
| required_hashtags | Text (comma-separated) | Hashtags that must appear in every post | No |
| banned_words | Text (comma-separated) | Words that must never appear (competitors, off-brand terms) | No |
| tone | Text | Tone description (e.g. "professional, warm, no slang") | No |
| key_facts | Text (free-form) | Facts the AI should verify against: address, phone, prices, dates, offers | No |
| created_at | Timestamp | Auto | Yes |
| updated_at | Timestamp | Auto | Yes |

CRUD operations: create, read, update, delete, list. Soft delete preferred so the activity log retains client context.

### 5.2 Text check

**Input**: a piece of text (caption, post body, ad copy) plus a selected client.

**Behavior**:
1. The Go CLI builds a strict prompt that includes the text, the client rules, and an instruction to return JSON.
2. Claude Code CLI is invoked with `--output-format json` and the prompt.
3. Output is parsed into the standard issue schema (see 5.5).
4. Result is rendered in the UI and logged.

### 5.3 Image check (poster, graphic)

**Input**: an image file (PNG, JPG, WebP) plus a selected client.

**Behavior**:
1. The image path is passed to Claude Code CLI via the appropriate flag.
2. The same prompt is used, with an additional instruction: "First extract all visible text in the image, then run the same checks."
3. Extracted text is included in the response so the team can confirm what was read.
4. Result is rendered, logged, and the image reference is stored.

The first text extraction is the highest-value feature of v1. Catching a typo before the poster goes to the client saves the most time.

### 5.4 Activity log

Every check produces a log entry. The log is the audit trail.

| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| client_id | FK | Reference to the client profile |
| user | Text | The team member running the check (selected or set in app prefs) |
| content_type | Enum | "text" or "image" |
| content_preview | Text | First 200 chars of the text, or the filename for images |
| issue_count | Integer | Total issues found |
| issues_json | JSON | Full issue list for later review |
| created_at | Timestamp | |

The log view shows: recent checks, filterable by client, by user, by date range, by clean/not-clean. Stats: total checks today/week/month, issues caught, clean approvals.

### 5.5 Issue schema

The AI returns issues in this shape:

```json
{
  "extracted_text": "string — the text that was checked (echo for text, OCR for image)",
  "issues": [
    {
      "type": "spelling | grammar | brand | fact",
      "snippet": "the exact text that is the problem",
      "explanation": "what's wrong and what to change it to",
      "suggested_fix": "the replacement text, when the AI can confidently suggest one (omit for fact issues that need human verification)",
      "severity": "high | medium | low"
    }
  ],
  "summary": "one-sentence overall assessment",
  "approved": true | false
}
```

- `spelling`: a misspelled word
- `grammar`: a grammatical error
- `brand`: a brand-rule violation (wrong brand spelling, missing hashtag, banned word, wrong tone)
- `fact`: a factual claim that contradicts the stored key facts, or one that should be verified before publishing

### 5.6 Approval flow

A check produces one of two outcomes:

- **Clean**: zero issues. Marked as "Approved" in the log. The team member can confidently publish.
- **Issues found**: one or more issues. Marked as "Needs revision". The team member fixes and re-checks. The original check is preserved in the log; the re-check is a new log entry.

No human reviewer is needed for v1. The AI is the gate. If the agency owner wants a second-pair-of-eyes step later, that becomes a v2 feature (route to a reviewer after a clean AI check).

### 5.7 Output presentation

How the check result is displayed to the team member is one of the most important UX decisions in the module. The default view determines whether the team actually uses the tool or works around it.

Three presentation styles were considered:

| Style | Description | Best for |
|---|---|---|
| **Inline highlighting** | Problem words underlined in the original text, Grammarly-style. Hover or tap to see the fix. | Daily use — fastest path from "see issue" to "apply fix" |
| **Issue list** | Original content on top, ordered list of issues below with type, snippet, and fix. | Users who prefer reading a list; fallback for images |
| **Formal report** | Document-style layout with header, summary, findings sections, generated timestamp. | Exporting as a record; sharing with clients as QA proof |

#### Decision: inline highlighting as default, with toggle and export

**Default view (text checks): inline highlighting.** The original text is rendered with `<span>` wrappers around the problem snippets. Color of the underline encodes issue type (red for spelling, amber for grammar, purple for brand, blue for fact). Hover or tap reveals a tooltip with the explanation and suggested fix. A single tap on the tooltip applies the fix in place.

**Default view (image checks): issue list.** Since highlighting cannot overlay a poster image cleanly, image checks show the extracted text in a box with inline highlights applied to that extracted text, followed by the same issue list used in the toggle view. If image overlay highlighting becomes a frequent request, it can be added in v2.

**Toggle to list view.** A small control near the result lets the user switch to the issue-list view. State is persisted per user — some team members will prefer the list permanently.

**Export as report.** A button on every check result generates the formal-report view (option C) as a PDF or markdown file. The report includes: client name, content type, checker name, timestamp, summary, full findings list, and a "Generated by CQC" footer. The exported file is saved to the activity log as the formal record. This export feature serves two cases: showing a client the QA process, and providing an audit trail when investigating a mistake that slipped through.

#### Rationale

The team will run checks 20-50 times per day. At that frequency, every second of friction matters. Inline highlighting puts the user's eye on the problem in roughly one second; a list view requires reading the list, then scanning back up to find the location in the content — an extra 3-5 seconds per issue. Over a day, the difference between the two views compounds into real friction, and friction is what makes internal tools get abandoned.

A formal-report view as the default would look professional in a screenshot, but every section header and signature line between the team member and the fix is a screen to scroll past. The report is genuinely useful, but as an on-demand export, not the default.

#### Implementation notes for the frontend

- The AI response already returns each issue's `snippet` (the exact problem text). The frontend uses these snippets to wrap matching substrings in the rendered content with the appropriate underline class.
- If a snippet appears multiple times in the content, only the first occurrence is highlighted by default. The issue list shows the count.
- The tooltip contains: issue type badge, the explanation, and a "Apply fix" button when the AI has provided a clear replacement.
- Keyboard navigation: `Tab` cycles through highlighted issues; `Enter` opens the tooltip; `A` applies the fix.

## 6. User flows

### 6.1 Run a text check

1. User opens the Quality Checker tab in the app
2. Selects a client from the dropdown
3. Pastes the caption into the text area
4. Clicks "Run check"
5. Sees a spinner with a status line ("Checking spelling…", "Checking brand rules…")
6. Sees the result: either an "Approved" badge, or the original text with problem words underlined in color (red/amber/purple/blue by issue type)
7. Hovers or taps any underlined word to see the explanation and suggested fix; taps "Apply fix" to replace in place
8. Re-runs the check after applying fixes (or switches to list view via the toggle if preferred)

### 6.2 Run a poster check

1. User opens the tab and selects a client
2. Switches to the "Image" mode
3. Drags a PNG or JPG onto the drop zone (or clicks to upload)
4. Sees a preview of the image
5. Clicks "Run check"
6. Sees the extracted text and the issue list
7. If issues: re-exports the design from Canva or Photoshop with the fix and uploads again

### 6.3 Set up a new client

1. User opens the "Client rules" tab
2. Clicks "Add client"
3. Fills in name, canonical brand spelling, hashtags, banned words, tone, and key facts
4. Saves
5. Client is now selectable in the check flow

### 6.4 Review activity

1. User (or owner) opens the "Activity log" tab
2. Sees stats and recent checks
3. Filters by client or user or date range
4. Clicks any entry to see the full issue list and the original content

## 7. Component-level specifications

### 7.1 Go CLI commands

```
mycli quality check --client=<id> --text="..."
mycli quality check --client=<id> --image=<path>
mycli quality client list
mycli quality client add --name="..." --brand-spelling="..." [--tone=...] [--key-facts=...]
mycli quality client update <id> [flags]
mycli quality client delete <id>
mycli quality log list [--client=<id>] [--user=<name>] [--since=<date>] [--limit=<n>]
mycli quality log show <id>
```

All commands take an optional `--output=json` flag for programmatic consumption (the Tauri layer always uses this).

### 7.2 Storage

SQLite database file in the existing app data directory. Schema:

```sql
CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  brand_spelling TEXT,
  brand_spelling_variants TEXT,
  required_hashtags TEXT,
  banned_words TEXT,
  tone TEXT,
  key_facts TEXT,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

CREATE TABLE check_log (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  user TEXT NOT NULL,
  content_type TEXT NOT NULL,
  content_preview TEXT,
  image_path TEXT,
  issue_count INTEGER NOT NULL,
  issues_json TEXT,
  summary TEXT,
  approved INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_log_client ON check_log(client_id);
CREATE INDEX idx_log_created ON check_log(created_at DESC);
```

### 7.3 Tauri Rust commands

Located in `src-tauri/src/commands/cqc.rs`:

- `cqc_run_text_check(client_id, text, user) -> CheckResult`
- `cqc_run_image_check(client_id, image_path, user) -> CheckResult`
- `cqc_list_clients() -> Vec<Client>`
- `cqc_get_client(id) -> Client`
- `cqc_save_client(client) -> Client`
- `cqc_delete_client(id) -> ()`
- `cqc_list_log(filter) -> Vec<LogEntry>`
- `cqc_get_log_entry(id) -> LogEntry`

Each command spawns the Go CLI with `--output=json`, captures stdout, deserializes into the corresponding Rust struct, and returns. Errors from Go (non-zero exit, malformed JSON, claude CLI failure) are mapped to a single `CqcError` enum surfaced to the frontend.

For streaming progress, the Rust layer can listen on Go stdout line-by-line and emit Tauri events (`cqc:progress`) while the check runs.

### 7.4 Frontend

A new route in the existing app, e.g. `/quality-checker`. Three sub-views matching the user flows in section 6:

- **Check**: client selector, content-type toggle, input area or drop zone, run button, result panel
- **Clients**: list + detail editor
- **Log**: stats cards + filterable table

The result panel (the most-used component) contains:

- **Status badge**: "Approved" (green) or "N issues" (red)
- **Content display with inline highlights**: original text rendered with `<span class="issue-{type}">` wrappers around problem snippets, underlined in the type's color
- **Tooltip** on highlight hover/tap: type badge, explanation, "Apply fix" button (shown only when `suggested_fix` is present)
- **View toggle**: "Highlights / List" switch, persisted per user
- **Export button**: generates the formal report (PDF or markdown) and saves the path to the activity log
- **Re-check button**: re-runs the check against the current (possibly edited) content

Styling matches the existing app's conventions. No new design system.

## 8. Prompt design

The prompt the Go CLI builds for Claude Code CLI is the most important part of the system. It must produce strict, parseable JSON every time.

### Template (text check)

```
You are a strict proofreader for a digital marketing agency. Check the
content below against the client rules. Respond with ONLY valid JSON.

CLIENT: {client.name}

CLIENT RULES:
- Correct brand spelling: {client.brand_spelling}
- Common wrong variants to flag: {client.brand_spelling_variants}
- Required hashtags: {client.required_hashtags}
- Banned words: {client.banned_words}
- Tone: {client.tone}
- Key facts (verify any numbers, dates, addresses, prices against these):
  {client.key_facts}

CONTENT:
"""
{content}
"""

Check for:
1. Spelling mistakes (especially in brand name)
2. Grammar errors
3. Brand rule violations (wrong brand spelling, missing required hashtags,
   banned words used, wrong tone)
4. Factual claims that contradict the key facts, OR factual claims that
   should be verified before publishing (prices, dates, offers, statistics)

Be strict — this is the final gate before client publishing.

Respond with ONLY this JSON structure, no preamble, no markdown:
{
  "extracted_text": "...",
  "issues": [
    {
      "type": "spelling | grammar | brand | fact",
      "snippet": "exact problem text",
      "explanation": "what's wrong and the fix",
      "suggested_fix": "the corrected text (omit this field for fact issues that need human verification)",
      "severity": "high | medium | low"
    }
  ],
  "summary": "one sentence",
  "approved": true | false
}

Important: the "snippet" must be the exact substring as it appears in the
content, so the frontend can locate and highlight it. Do not paraphrase.
```

### Template (image check)

Same as above, with the image attached and this added instruction at the top:

```
First, extract ALL text visible in the attached image (poster/graphic).
Then check that extracted text against the rules below.
```

### Prompt-tuning principles

- Always say "respond with ONLY valid JSON, no preamble" — Claude Code CLI in non-interactive mode usually complies but reinforcement helps
- Always echo back the extracted text so the team can verify the AI read it correctly
- Use the word "strict" — for quality-gate use cases, false positives are cheaper than false negatives
- Keep the client rules section short and structured; long key-facts blobs reduce accuracy

## 9. Non-functional requirements

| Requirement | Target |
|---|---|
| Latency (text check) | < 5 seconds end to end on a typical caption |
| Latency (image check) | < 10 seconds end to end on a typical poster |
| Offline behavior | Client rules CRUD works offline; checking requires network (Claude CLI) |
| Storage growth | Log retention of last 1000 entries per client; older entries archived to a separate file |
| Concurrency | At least 3 simultaneous checks supported (multiple team members) |
| Cross-platform | Whatever the existing Tauri app supports (likely macOS, Windows) |

## 10. Risks and open questions

| Risk | Mitigation |
|---|---|
| AI misses subtle issues (e.g. cultural tone) | The tool is a first gate, not the only one. Account managers still spot-check. |
| AI flags false positives, team starts ignoring it | Tune prompts during rollout; let users mark a flag as "false positive" to refine over time |
| Image OCR fails on stylized fonts | Show extracted text prominently so the team can spot missed content and rerun on a screenshot if needed |
| Claude CLI cost grows with adoption | Monitor usage in the existing app's billing dashboard; consider caching identical recent checks |
| Brand-spelling variants get missed | First two weeks after launch: track which mistakes still slipped through, add them to the variants field |

Open questions to resolve before build:

1. **Image format support** — does Claude Code CLI handle WebP and SVG, or only PNG and JPG in the version you have installed? Need to verify.
2. **User identity** — does the existing app already have a logged-in user concept, or does the team enter their name each session?
3. **Notification on issues** — should a high-severity issue trigger anything beyond an in-app result (Slack ping, email)?
4. **Re-check loop** — when a team member fixes and re-runs, should the new check be linked to the previous one as a "revision chain" in the log?

## 11. Rollout plan

### Phase 1 — internal alpha (week 1–2)
- Build core flow: text check + client profiles + log
- Owner and one account manager use it on real client work
- Tune prompts based on observed misses

### Phase 2 — image check + team rollout (week 3–4)
- Add image-check mode
- Enable for full team
- Define the rule: no client-facing content goes out without a check
- Set up weekly review of the log: which mistakes are still slipping through?

### Phase 3 — refinement (week 5–8)
- Add filters and bulk-check based on team feedback
- Add the "mark as false positive" feedback loop
- Measure success criteria (adoption %, client-reported issues)

### Phase 4 — v2 features (post-launch)
- Multi-language (Malayalam, Hindi, Tamil)
- Reviewer routing (AI clean → human approver)
- Slack integration for posting clean results
- Bulk batch checking (paste 10 captions, get 10 results)
- Auto-suggest fix mode (one-click apply)

## 12. Out of scope for v1

- Public-facing API
- Multi-tenant SaaS version for other agencies
- Mobile app
- Real-time collaboration (two people editing the same client profile)
- Auto-posting to social platforms
- A/B testing of content variants
- Performance prediction (will this post do well?)

## 13. Acceptance criteria

The module is ready to ship when:

- A client profile can be created with all the fields in 5.1
- Pasting a caption with a brand misspelling, a banned word, and a wrong phone number produces three correctly-classified issues
- Uploading a poster image with a typo produces an issue that quotes the typo from the image
- Every check produces a log entry that survives an app restart
- The log shows accurate counts in the stat cards
- The Go CLI commands in 7.1 all work from a terminal independent of Tauri
- Latency targets in section 9 are met on a typical home or office network

---

*End of PRD.*
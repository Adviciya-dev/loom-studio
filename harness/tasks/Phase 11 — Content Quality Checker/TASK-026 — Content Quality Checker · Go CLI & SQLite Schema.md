# TASK-026: Content Quality Checker · Go CLI & SQLite Schema

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

Implement the Go CLI backend for the **Content Quality Checker (CQC)** feature. This task covers the SQLite schema for storing client brand profiles and audit log entries, plus the `quality` subcommand group in the Go engine.

The Go CLI receives `quality` actions from Tauri, invokes the Claude CLI with a structured prompt, parses the JSON response, persists the result to SQLite, and emits structured events back to the frontend.

---

## Sub Tasks

### Layer 1 — SQLite Schema

Add two new tables to the existing SQLite database (same file/connection used by other engine modules).

```sql
CREATE TABLE IF NOT EXISTS cqc_clients (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  brand_spelling          TEXT NOT NULL DEFAULT '',
  brand_spelling_variants TEXT NOT NULL DEFAULT '',
  required_hashtags       TEXT NOT NULL DEFAULT '',
  banned_words            TEXT NOT NULL DEFAULT '',
  tone                    TEXT NOT NULL DEFAULT '',
  key_facts               TEXT NOT NULL DEFAULT '',
  deleted_at  TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cqc_log (
  id              TEXT PRIMARY KEY,
  client_id       TEXT NOT NULL REFERENCES cqc_clients(id),
  user            TEXT NOT NULL,
  content_type    TEXT NOT NULL CHECK(content_type IN ('text','image')),
  content_preview TEXT NOT NULL DEFAULT '',
  image_path      TEXT,
  issue_count     INTEGER NOT NULL DEFAULT 0,
  issues_json     TEXT NOT NULL DEFAULT '[]',
  summary         TEXT NOT NULL DEFAULT '',
  approved        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL
);
```

- [ ] Create `src-tauri/binaries/loom-engine/cqc/db.go` — `InitSchema()`, helpers `uuidv4()`, `nowISO()`
- [ ] Call `cqc.InitSchema(db)` from engine startup

---

### Layer 2 — Go Structs & Types

Create `src-tauri/binaries/loom-engine/cqc/types.go`.

```go
type Client struct {
  ID                     string  `json:"id"`
  Name                   string  `json:"name"`
  BrandSpelling          string  `json:"brand_spelling"`
  BrandSpellingVariants  string  `json:"brand_spelling_variants"`
  RequiredHashtags       string  `json:"required_hashtags"`
  BannedWords            string  `json:"banned_words"`
  Tone                   string  `json:"tone"`
  KeyFacts               string  `json:"key_facts"`
  DeletedAt              *string `json:"deleted_at"`
  CreatedAt              string  `json:"created_at"`
  UpdatedAt              string  `json:"updated_at"`
}

type Issue struct {
  Type          string `json:"type"`           // spelling | grammar | brand | fact
  Snippet       string `json:"snippet"`
  Explanation   string `json:"explanation"`
  SuggestedFix  string `json:"suggested_fix,omitempty"`
  Severity      string `json:"severity"`       // high | medium | low
}

type CheckResult struct {
  ExtractedText string  `json:"extracted_text"`
  Issues        []Issue `json:"issues"`
  Summary       string  `json:"summary"`
  Approved      bool    `json:"approved"`
}

type LogEntry struct {
  ID             string  `json:"id"`
  ClientID       string  `json:"client_id"`
  User           string  `json:"user"`
  ContentType    string  `json:"content_type"`
  ContentPreview string  `json:"content_preview"`
  ImagePath      *string `json:"image_path,omitempty"`
  IssueCount     int     `json:"issue_count"`
  IssuesJSON     string  `json:"issues_json"`
  Summary        string  `json:"summary"`
  Approved       bool    `json:"approved"`
  CreatedAt      string  `json:"created_at"`
}
```

- [ ] Create `src-tauri/binaries/loom-engine/cqc/types.go` with all structs above

---

### Layer 3 — Client CRUD

Create `src-tauri/binaries/loom-engine/cqc/clients.go`.

- [ ] `ListClients(db) ([]Client, error)` — SELECT WHERE deleted_at IS NULL ORDER BY name
- [ ] `SaveClient(db, c Client) (Client, error)` — INSERT or UPDATE (upsert by ID). If `c.ID == ""` generate a new UUID and set `created_at`. Always update `updated_at`.
- [ ] `DeleteClient(db, id string) error` — soft delete: SET `deleted_at = nowISO()` WHERE id = ?

---

### Layer 4 — Quality Check Execution

Create `src-tauri/binaries/loom-engine/cqc/checker.go`.

**Text check flow:**
1. Load client by ID from DB
2. Build Claude CLI prompt (see prompt template below)
3. Run `claude --print --output-format json "<prompt>"` as subprocess
4. Parse stdout as `CheckResult` JSON
5. Persist result to `cqc_log`
6. Return `CheckResult`

**Prompt template:**
```
You are a content quality checker for a marketing agency.

Client profile:
- Brand name (correct spelling): {{brand_spelling}}
- Accepted brand spelling variants: {{brand_spelling_variants}}
- Required hashtags: {{required_hashtags}}
- Banned words: {{banned_words}}
- Expected tone: {{tone}}
- Key facts that must be accurate: {{key_facts}}

Content to review:
"""
{{content}}
"""

Respond ONLY with valid JSON matching this schema:
{
  "extracted_text": "...",
  "issues": [
    {
      "type": "spelling|grammar|brand|fact",
      "snippet": "exact text from content",
      "explanation": "...",
      "suggested_fix": "...",
      "severity": "high|medium|low"
    }
  ],
  "summary": "one-sentence summary",
  "approved": true|false
}

Return approved=true only if there are zero high-severity issues.
```

- [ ] `RunTextCheck(db, clientID, text, user string) (CheckResult, error)`
- [ ] `RunImageCheck(db, clientID, imagePath, user string) (CheckResult, error)` — Phase 2 stub: return error "image check not yet implemented"
- [ ] During execution emit progress events via the existing engine event emitter: `cqc:progress` with `{ step: "building_prompt" | "running_claude" | "parsing_result" | "saving_log" }`

---

### Layer 5 — Log Queries

Create `src-tauri/binaries/loom-engine/cqc/log.go`.

- [ ] `ListLog(db, clientID, user, since string, limit int) ([]LogEntry, error)` — filter by optional params
- [ ] `GetLogEntry(db, id string) (LogEntry, error)`

---

### Layer 6 — Wire into Engine Actions

In `src-tauri/binaries/loom-engine/main.go` add cases to the action dispatcher:

- [ ] `"cqc_list_clients"` → `cqc.ListClients(db)` → emit result as JSON
- [ ] `"cqc_save_client"` → `cqc.SaveClient(db, client)` → emit saved client
- [ ] `"cqc_delete_client"` → `cqc.DeleteClient(db, id)` → emit `{ok: true}`
- [ ] `"cqc_run_text_check"` → `cqc.RunTextCheck(...)` → emit result
- [ ] `"cqc_run_image_check"` → `cqc.RunImageCheck(...)` → emit error for now
- [ ] `"cqc_list_log"` → `cqc.ListLog(...)` → emit result
- [ ] `"cqc_get_log_entry"` → `cqc.GetLogEntry(...)` → emit result

---

## Acceptance Criteria
- [ ] `cqc_clients` and `cqc_log` tables created on engine startup (idempotent)
- [ ] Client list/save/soft-delete round-trips work correctly via engine actions
- [ ] Text check builds correct Claude CLI prompt from client profile
- [ ] `CheckResult` JSON parsed and returned; log entry persisted to DB
- [ ] `cqc:progress` events emitted at each step (verify via engine log)
- [ ] Log list/get queries work with optional filters
- [ ] Image check returns clear "not yet implemented" error (no crash)

---

## Technical Notes
- SQLite connection: reuse same `*sql.DB` instance already opened by the engine — do NOT open a second connection.
- Claude CLI invocation: same exec pattern as existing engine subprocess calls. Capture stdout only; log stderr as engine warning.
- JSON parsing: if Claude returns malformed JSON, emit `engine_error` with message and return error to caller.
- IDs: use `crypto/rand` UUID v4 — no external package needed.

---

## Files to Create
```
CREATE:
src-tauri/binaries/loom-engine/cqc/types.go
src-tauri/binaries/loom-engine/cqc/db.go
src-tauri/binaries/loom-engine/cqc/clients.go
src-tauri/binaries/loom-engine/cqc/checker.go
src-tauri/binaries/loom-engine/cqc/log.go
```

## Files to Modify
```
MODIFY:
src-tauri/binaries/loom-engine/main.go   ← add cqc action cases + InitSchema call
```

---

## Dependencies
- **Blocked by:** TASK-001 (env setup) ✅
- **Blocks:** TASK-027 (Tauri IPC Commands)

---

## Claude Code Context
```
harness/claude.md
harness/tasks/Phase 11 — Content Quality Checker/TASK-026 — Content Quality Checker · Go CLI & SQLite Schema.md
harness/content-review-prd.md
src-tauri/binaries/loom-engine/main.go
src-tauri/binaries/loom-engine/task/types.go
src-tauri/binaries/loom-engine/task/reader.go
```

---

## Progress Log
| Date | Update |
|------|--------|
| 2026-05-11 | Task created — CQC Phase 11 Go CLI & SQLite backend |

---

## Time Log
| Date | Hours | Note |
|------|-------|------|
| — | — | — |

---

## Review Notes
- **—**

# TASK-036: Site Audit · Go Engine store.go

## Meta
| Field | Value |
|-------|-------|
| **Assignee** | — |
| **Status** | 🔲 To Do |
| **Priority** | P0 |
| **Sprint** | Sprint 9 |
| **Story Points** | 5 |
| **PRD Reference** | harness/site-audit-prd.md §5.3 §5.4 §10.7 §10.8 |
| **Architecture Ref** | harness/site-audit-prd.md §10.1 |
| **Start Date** | — |
| **Due Date** | — |
| **Created** | 2026-05-17 |
| **Completed** | — |

---

## Description

Create the Go engine `audit` package starting with the foundational file — `store.go`. This file owns all on-disk session I/O for the audit module: reading intake, writing session state updates, draft auto-save, and team.json management.

`store.go` is not the session-discovery endpoint (that is handled by the Rust `audit_list_sessions` command in TASK-035). Its role is to be the Go engine's authoritative I/O layer so that `runner.go`, `report_builder.go`, and `goal_planner.go` never touch the filesystem directly — they call `store.go` functions.

Also wire the `audit` package into `main.go` so that future audit actions can be dispatched.

---

## Sub Tasks

### Layer 1 — Package structure

Create the `audit` sub-package directory and all files listed below. Files outside `audit/` that need modification are in Layer 5.

```
src-tauri/binaries/loom-engine/
  audit/
    store.go       ← this task
    types.go       ← this task (Go structs mirroring TypeScript types)
    runner.go      ← TASK placeholder (empty file with package declaration only)
    lighthouse.go  ← TASK placeholder
    html_fetcher.go ← TASK placeholder
    header_checker.go ← TASK placeholder
    robots_checker.go ← TASK placeholder
    claude_analyst.go ← TASK placeholder
    report_builder.go ← TASK placeholder
    goal_planner.go   ← TASK placeholder
    task_writer.go    ← TASK placeholder
```

Create the placeholder files now (just `package audit` header) so the Go module compiles end-to-end. Implement only `store.go` and `types.go` in this task.

- [ ] Create `audit/` directory and all placeholder `.go` files with `package audit` header
- [ ] Implement `audit/types.go` (Layer 2)
- [ ] Implement `audit/store.go` (Layers 3 + 4)

---

### Layer 2 — Go structs in `audit/types.go`

Mirror the TypeScript types from TASK-034. Use `json` struct tags matching the `intake.json` field names.

```go
package audit

// AuditPhase matches the TypeScript AuditPhase union.
type AuditPhase string

const (
    PhaseIntake    AuditPhase = "intake"
    PhaseRunning   AuditPhase = "running"
    PhaseReport    AuditPhase = "report"
    PhaseGoals     AuditPhase = "goals"
    PhaseCancelled AuditPhase = "cancelled"
    PhaseComplete  AuditPhase = "complete"
)

// AuditIntake mirrors the TypeScript AuditIntake interface.
type AuditIntake struct {
    SiteURL       string   `json:"siteUrl"`
    SiteName      string   `json:"siteName"`
    CMS           string   `json:"cms"`
    CMSOther      string   `json:"cmsOther"`
    Industry      string   `json:"industry"`
    NicheKeywords string   `json:"nicheKeywords"`
    TargetMarket  string   `json:"targetMarket"`
    Competitors   []string `json:"competitors"`
    LocalRepoPath *string  `json:"localRepoPath"`
    BusinessGoal  string   `json:"businessGoal"`
    BudgetTimeline string  `json:"budgetTimeline"`
}

// SessionFile is the schema of intake.json on disk (envelope + intake fields).
type SessionFile struct {
    SessionID  string     `json:"sessionId"`
    Version    int        `json:"version"`
    ProjectID  string     `json:"projectId"`
    SiteName   string     `json:"siteName"`
    SiteURL    string     `json:"siteUrl"`
    Phase      AuditPhase `json:"phase"`
    CreatedAt  string     `json:"createdAt"`
    UpdatedAt  string     `json:"updatedAt"`
    ReportPath *string    `json:"reportPath"`
    TaskCount  int        `json:"taskCount"`
    Intake     AuditIntake `json:"intake"`
}

// TeamMember is one entry in team.json.
type TeamMember struct {
    Name string `json:"name"`
    Role string `json:"role"`
}

// TeamFile is the schema of team.json.
type TeamFile struct {
    Version int          `json:"version"`
    Members []TeamMember `json:"members"`
}

// GoalTask mirrors the TypeScript GoalTask interface.
type GoalTask struct {
    ID                  string  `json:"id"`
    Title               string  `json:"title"`
    Bucket              string  `json:"bucket"`
    Dimension           string  `json:"dimension"`
    Effort              string  `json:"effort"`
    Owner               *string `json:"owner"`
    Notes               string  `json:"notes"`
    LinkedReportSection string  `json:"linkedReportSection"`
}

// GoalPlanFile is the schema of goal_plan.json.
type GoalPlanFile struct {
    Version     int        `json:"version"`
    SessionID   string     `json:"sessionId"`
    GeneratedAt string     `json:"generatedAt"`
    SavedAt     *string    `json:"savedAt"`
    Tasks       []GoalTask `json:"tasks"`
}
```

- [ ] Create `audit/types.go` with all structs above

---

### Layer 3 — Session file I/O in `audit/store.go`

```go
package audit

import (
    "encoding/json"
    "fmt"
    "os"
    "path/filepath"
    "time"
)

// sessionDir returns {projectPath}/audits/{sessionId}/
func sessionDir(projectPath, sessionID string) string {
    return filepath.Join(projectPath, "audits", sessionID)
}

// SessionPath returns the path to intake.json for a session.
func SessionPath(projectPath, sessionID string) string {
    return filepath.Join(sessionDir(projectPath, sessionID), "intake.json")
}

// RawDir returns the path to the raw/ subdirectory for a session.
func RawDir(projectPath, sessionID string) string {
    return filepath.Join(sessionDir(projectPath, sessionID), "raw")
}

// ReportPath returns the path to report.md for a session.
func ReportPath(projectPath, sessionID string) string {
    return filepath.Join(sessionDir(projectPath, sessionID), "report.md")
}

// GoalPlanPath returns the path to goal_plan.json for a session.
func GoalPlanPath(projectPath, sessionID string) string {
    return filepath.Join(sessionDir(projectPath, sessionID), "goal_plan.json")
}

// LoadSession reads intake.json and returns a SessionFile.
// Returns an error if the file does not exist or cannot be parsed.
func LoadSession(projectPath, sessionID string) (*SessionFile, error) {
    data, err := os.ReadFile(SessionPath(projectPath, sessionID))
    if err != nil {
        return nil, fmt.Errorf("read intake.json: %w", err)
    }
    var s SessionFile
    if err := json.Unmarshal(data, &s); err != nil {
        return nil, fmt.Errorf("parse intake.json: %w", err)
    }
    return &s, nil
}

// SaveSessionPhase updates only the phase and updatedAt fields in intake.json.
// Used by runner.go and goal_planner.go to advance the session phase.
func SaveSessionPhase(projectPath, sessionID string, phase AuditPhase) error {
    s, err := LoadSession(projectPath, sessionID)
    if err != nil {
        return err
    }
    s.Phase = phase
    s.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
    return writeSessionFile(projectPath, sessionID, s)
}

// IncrementTaskCount adds n to the session's TaskCount and sets UpdatedAt.
func IncrementTaskCount(projectPath, sessionID string, n int) error {
    s, err := LoadSession(projectPath, sessionID)
    if err != nil {
        return err
    }
    s.TaskCount += n
    s.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
    return writeSessionFile(projectPath, sessionID, s)
}

// writeSessionFile atomically writes s to intake.json.
func writeSessionFile(projectPath, sessionID string, s *SessionFile) error {
    data, err := json.MarshalIndent(s, "", "  ")
    if err != nil {
        return fmt.Errorf("marshal session: %w", err)
    }
    dir := sessionDir(projectPath, sessionID)
    if err := os.MkdirAll(dir, 0o755); err != nil {
        return fmt.Errorf("mkdir session dir: %w", err)
    }
    tmp := SessionPath(projectPath, sessionID) + ".tmp"
    if err := os.WriteFile(tmp, data, 0o644); err != nil {
        return fmt.Errorf("write tmp: %w", err)
    }
    return os.Rename(tmp, SessionPath(projectPath, sessionID))
}

// EnsureRawDir creates {session}/raw/ if it does not exist.
func EnsureRawDir(projectPath, sessionID string) error {
    return os.MkdirAll(RawDir(projectPath, sessionID), 0o755)
}

// DeleteRawDir removes the entire raw/ directory for a session (used by re-run).
func DeleteRawDir(projectPath, sessionID string) error {
    return os.RemoveAll(RawDir(projectPath, sessionID))
}
```

- [ ] Implement all functions above in `audit/store.go`

---

### Layer 4 — Team file I/O in `audit/store.go`

Add team management functions to the same `store.go` file:

```go
// teamPath returns {projectPath}/team.json
func teamPath(projectPath string) string {
    return filepath.Join(projectPath, "team.json")
}

// LoadTeam reads team.json. Returns an empty TeamFile (version 1, no members) if the file does not exist.
func LoadTeam(projectPath string) (*TeamFile, error) {
    data, err := os.ReadFile(teamPath(projectPath))
    if os.IsNotExist(err) {
        return &TeamFile{Version: 1, Members: []TeamMember{}}, nil
    }
    if err != nil {
        return nil, fmt.Errorf("read team.json: %w", err)
    }
    var t TeamFile
    if err := json.Unmarshal(data, &t); err != nil {
        return nil, fmt.Errorf("parse team.json: %w", err)
    }
    return &t, nil
}

// SaveTeam writes team.json atomically.
func SaveTeam(projectPath string, t *TeamFile) error {
    data, err := json.MarshalIndent(t, "", "  ")
    if err != nil {
        return fmt.Errorf("marshal team.json: %w", err)
    }
    tmp := teamPath(projectPath) + ".tmp"
    if err := os.WriteFile(tmp, data, 0o644); err != nil {
        return fmt.Errorf("write team tmp: %w", err)
    }
    return os.Rename(tmp, teamPath(projectPath))
}
```

- [ ] Append team I/O functions to `audit/store.go`

---

### Layer 5 — Wire into `main.go`

In `src-tauri/binaries/loom-engine/main.go`, add the audit action dispatcher. The existing engine reads action JSON from stdin; add an `"audit_"` prefix case:

```go
// Inside the action switch/if block in main.go:
case strings.HasPrefix(action, "audit_"):
    handleAuditAction(action, payload, projectPath, sessionID, emit)
```

Create a dispatcher function (can live at the bottom of `main.go` or in a new `audit/dispatcher.go`):

```go
func handleAuditAction(action, payload, projectPath, sessionID string, emit func(string, interface{})) {
    switch action {
    case "audit_read_team":
        team, err := audit.LoadTeam(projectPath)
        if err != nil {
            emit("engine_error", map[string]string{"message": err.Error()})
            return
        }
        emit("audit_team_ready", team)

    case "audit_save_team":
        var team audit.TeamFile
        if err := json.Unmarshal([]byte(payload), &team); err != nil {
            emit("engine_error", map[string]string{"message": "invalid team JSON"})
            return
        }
        if err := audit.SaveTeam(projectPath, &team); err != nil {
            emit("engine_error", map[string]string{"message": err.Error()})
            return
        }
        emit("audit_team_saved", map[string]bool{"ok": true})

    // Other audit actions (audit_start, audit_generate_report, etc.) will be added by later tasks.
    default:
        emit("engine_error", map[string]string{"message": "unknown audit action: " + action})
    }
}
```

- [ ] Add audit action prefix routing to `main.go`
- [ ] Implement `audit_read_team` and `audit_save_team` dispatcher cases
- [ ] Ensure all placeholder files in `audit/` compile (no unused imports in placeholders)

---

## Acceptance Criteria

- [ ] `go build ./...` succeeds from `src-tauri/binaries/loom-engine/` with no errors
- [ ] All placeholder files in `audit/` compile (each contains only `package audit` declaration)
- [ ] `LoadSession` reads and parses a valid `intake.json` without error
- [ ] `SaveSessionPhase` updates `phase` and `updatedAt` while preserving all other fields
- [ ] `IncrementTaskCount` correctly adds to `taskCount` without overwriting other fields
- [ ] Both session writes use the `.tmp` → rename atomic pattern
- [ ] `LoadTeam` returns an empty `TeamFile{Version: 1, Members: []}` when `team.json` does not exist
- [ ] `SaveTeam` writes valid JSON atomically
- [ ] `audit_read_team` and `audit_save_team` engine actions work end-to-end
- [ ] Unknown audit actions emit `engine_error` with a descriptive message

---

## Technical Notes

- Use `time.RFC3339` (not `time.RFC3339Nano`) for ISO timestamps — keeps the format consistent with the Rust side.
- The `audit` package must not import the `main` package — the dispatcher can live in `main.go` or a `dispatcher.go` file at the root of the `loom-engine` module.
- Do not add SQLite or any external database in this task — all session state is in flat JSON files per the PRD architecture.
- `EnsureRawDir` and `DeleteRawDir` will be called by `runner.go` in a future task — implement them now so they are ready.

---

## Files to Create

```
CREATE:
src-tauri/binaries/loom-engine/audit/types.go
src-tauri/binaries/loom-engine/audit/store.go
src-tauri/binaries/loom-engine/audit/runner.go          (placeholder: package audit)
src-tauri/binaries/loom-engine/audit/lighthouse.go      (placeholder: package audit)
src-tauri/binaries/loom-engine/audit/html_fetcher.go    (placeholder: package audit)
src-tauri/binaries/loom-engine/audit/header_checker.go  (placeholder: package audit)
src-tauri/binaries/loom-engine/audit/robots_checker.go  (placeholder: package audit)
src-tauri/binaries/loom-engine/audit/claude_analyst.go  (placeholder: package audit)
src-tauri/binaries/loom-engine/audit/report_builder.go  (placeholder: package audit)
src-tauri/binaries/loom-engine/audit/goal_planner.go    (placeholder: package audit)
src-tauri/binaries/loom-engine/audit/task_writer.go     (placeholder: package audit)
```

## Files to Modify

```
MODIFY:
src-tauri/binaries/loom-engine/main.go   ← add audit action prefix routing + team handlers
```

---

## Dependencies

- **Blocked by:** TASK-034 (TypeScript types used as reference for Go struct field names)
- **Blocks:** All Phase 2 Go engine tasks (runner.go, lighthouse.go, etc.) that import this package

---

## Claude Code Context

```
harness/claude.md
harness/tasks/Phase 12 — Site Audit/TASK-036 — Site Audit · Go Engine store.go.md
harness/site-audit-prd.md
src-tauri/binaries/loom-engine/main.go
src-tauri/binaries/loom-engine/task/types.go
src-tauri/binaries/loom-engine/task/reader.go
```

---

## Progress Log

| Date | Update |
|------|--------|
| 2026-05-17 | Task created — Phase 12 Go engine audit package foundation |

---

## Time Log

| Date | Hours | Note |
|------|-------|------|
| — | — | — |

---

## Review Notes

- **—**

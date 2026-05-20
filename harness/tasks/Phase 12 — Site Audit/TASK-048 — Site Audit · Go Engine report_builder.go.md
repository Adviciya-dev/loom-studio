---
id: TASK-048
title: "Site Audit · Go Engine report_builder.go"
type: task
status: open
effort: Medium
priority: high
phase: 3
area: engine
---

## Goal

Implement `report_builder.go` to read all raw audit output files, construct the Claude CLI prompt with intake context, invoke Claude in one-shot mode, stream the markdown response to `report.md`, update the session phase, and emit `audit_report_ready`.

## Files to modify

- `src-tauri/binaries/loom-engine/audit/report_builder.go`
- `src-tauri/binaries/loom-engine/main.go` (register `audit_generate_report` action)

---

## Function signature

```go
// BuildReport is the Phase 3 entry point. Called from main.go on "audit_generate_report".
func BuildReport(ctx context.Context, projectPath, sessionID string, emitter *ipc.Emitter) {
    emit := func(event string, payload any) { emitter.Emit(event, payload) }
    // ...
}
```

---

## Implementation steps

### 1 — Load session

```go
session, err := LoadSession(projectPath, sessionID)
if err != nil {
    emitAuditLog(emit, "ERROR", "report_builder: failed to load session: "+err.Error())
    emitter.Emit("audit_error", map[string]string{"sessionId": sessionID, "dimension": "", "message": err.Error()})
    return
}
intake := session.Intake
```

### 2 — Discover available raw files

Check which raw files exist so the prompt lists only present files and skipped sections are correctly noted.

```go
rawDir := RawDir(projectPath, sessionID)
availableFiles := []string{}
for _, name := range []string{
    "performance.json", "seo.json", "accessibility.json", "technical.json",
    "code_audit.json", "content.json", "competitors.json", "security.json",
} {
    if _, err := os.Stat(filepath.Join(rawDir, name)); err == nil {
        availableFiles = append(availableFiles, name)
    }
}
if len(availableFiles) == 0 {
    msg := "No raw audit files found — cannot generate report"
    emitAuditLog(emit, "ERROR", msg)
    emitter.Emit("audit_error", map[string]string{"sessionId": sessionID, "dimension": "", "message": msg})
    return
}
```

### 3 — Build the Claude prompt

Construct the prompt string from §7.3 of the PRD, substituting intake fields.

```go
cmsLabel := intake.CMS
if intake.CMS == "other" && intake.CMSOther != "" {
    cmsLabel = intake.CMSOther
}

fileList := strings.Join(availableFiles, ", ")

prompt := fmt.Sprintf(`You are a senior web-strategy consultant producing a site audit report for a client.
You have access to the following audit data files in the current directory:
  %s

Intake context:
  Site: %s (%s)
  CMS: %s
  Industry: %s
  Keywords: %s
  Target market: %s
  Business goal: %s

Instructions:
1. Read each available JSON file.
2. For missing/skipped files, mark the dimension as N/A in the scorecard and omit its findings section.
3. For errored dimensions (files with an "error" key), mark as Error in the scorecard and note it briefly.
4. Write the report in the exact markdown structure below. Do not add extra top-level sections.
5. Target length: 1500–2000 words total (approx 150–250 words per dimension findings section).
6. Executive Summary must be non-technical and client-readable — avoid jargon.
7. Score integers in the scorecard come from the "score" field in each JSON file; Lighthouse float scores (0–1) must be multiplied by 100 and rounded.
8. Recommended Actions must be numbered and ordered by impact.

Output the full report in markdown. Output nothing else — no preamble, no explanation.

[REPORT STRUCTURE]
# Site Audit Report — %s
Date: %s
Audited by: Loom Studio

## Executive Summary

## Score Card
| Dimension        | Score  | Status |
|------------------|--------|--------|
| Performance      | xx/100 | ●      |
| SEO              | xx/100 | ●      |
| Accessibility    | xx/100 | ●      |
| Technical Health | xx/100 | ●      |
| Code Quality     | N/A    | –      |
| Content          | xx/100 | ●      |
| Security         | xx/100 | ●      |

## Critical Issues

## Dimension Findings
### Performance
### SEO
### Accessibility
### Technical Health
### Content & Copy
### Security

## Recommended Actions

## Intake Reference
`,
    fileList,
    intake.SiteName, intake.SiteURL,
    cmsLabel,
    intake.Industry,
    intake.NicheKeywords,
    intake.TargetMarket,
    intake.BusinessGoal,
    intake.SiteName,
    time.Now().Format("2006-01-02"),
)
```

Include `### Code Quality` and `### Competitor Gap` sections in the prompt only when `code_audit.json` and `competitors.json` are respectively in `availableFiles`. Keep the instruction conditional:

```go
if slices.Contains(availableFiles, "code_audit.json") {
    prompt = strings.Replace(prompt, "### Technical Health\n", "### Technical Health\n### Code Quality\n", 1)
}
if slices.Contains(availableFiles, "competitors.json") {
    prompt = strings.Replace(prompt, "### Security\n", "### Competitor Gap\n### Security\n", 1)
}
```

### 4 — Invoke Claude CLI

Reuse the `invokeClaude` function from `claude_analyst.go`. Pass `rawDir` as the `cwd` so Claude can read raw files by relative path.

```go
emitAuditLog(emit, "INFO", "Generating report via Claude…")

markdown, err := invokeClaude(ctx, prompt, rawDir, emit)
if err != nil {
    msg := "Report generation failed: " + err.Error()
    emitAuditLog(emit, "ERROR", msg)
    emitter.Emit("audit_error", map[string]string{"sessionId": sessionID, "dimension": "", "message": msg})
    return
}

markdown = strings.TrimSpace(markdown)
if markdown == "" {
    msg := "Claude returned an empty report — please retry"
    emitAuditLog(emit, "ERROR", msg)
    emitter.Emit("audit_error", map[string]string{"sessionId": sessionID, "dimension": "", "message": msg})
    return
}
```

### 5 — Write report.md

```go
reportPath := ReportPath(projectPath, sessionID)
if err := os.WriteFile(reportPath, []byte(markdown), 0644); err != nil {
    msg := "Failed to write report.md: " + err.Error()
    emitAuditLog(emit, "ERROR", msg)
    emitter.Emit("audit_error", map[string]string{"sessionId": sessionID, "dimension": "", "message": msg})
    return
}
```

### 6 — Update session phase to 'report'

```go
if err := SaveSessionPhase(projectPath, sessionID, PhaseReport); err != nil {
    emitAuditLog(emit, "WARN", "Could not update session phase: "+err.Error())
}
```

### 7 — Emit `audit_report_ready`

```go
emitter.Emit("audit_report_ready", map[string]string{
    "sessionId":  sessionID,
    "reportPath": reportPath,
})
emitAuditLog(emit, "INFO", "Report ready: "+reportPath)
```

---

## main.go wiring

In the `switch action` block of `main.go`, add a case for `audit_generate_report`:

```go
case "audit_generate_report":
    projectPath, _ := cmd["projectPath"].(string)
    sessionID, _   := cmd["sessionId"].(string)
    go audit.BuildReport(context.Background(), projectPath, sessionID, emitter)
```

---

## Acceptance criteria

- [ ] `BuildReport` is exported and callable from `main.go`
- [ ] When no raw files exist, `audit_error` is emitted and function returns without panicking
- [ ] Claude is invoked with `--cwd` set to the session's `raw/` directory so it reads files by relative path
- [ ] Prompt includes `code_audit.json` and `competitors.json` sections only when those files exist in `raw/`
- [ ] `report.md` is written to `{projectPath}/audits/{sessionID}/report.md`
- [ ] Session phase is updated to `'report'` in `intake.json` after successful write
- [ ] `audit_report_ready` is emitted with `{ sessionId, reportPath }` after successful write
- [ ] Claude crash, empty response, or write error emits `audit_error` and does not advance phase
- [ ] `audit_generate_report` action is wired in `main.go`; no other actions are broken
- [ ] `go build ./...` passes with no errors

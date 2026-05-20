package audit

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"github.com/loom/engine/ipc"
)

// BuildReport is the Phase 3 entry point. Called from main.go on "audit_generate_report".
// It reads all available raw audit files, invokes Claude to synthesise a markdown report,
// writes report.md, updates the session phase, and emits audit_report_ready.
func BuildReport(ctx context.Context, projectPath, sessionID string, emitter *ipc.Emitter) {
	emit := func(event string, payload any) { emitter.Emit(event, payload) }

	// 1 — Load session
	session, err := LoadSession(projectPath, sessionID)
	if err != nil {
		msg := "report_builder: failed to load session: " + err.Error()
		emitAuditLog(emit, "ERROR", msg)
		emitter.Emit("audit_error", map[string]string{"sessionId": sessionID, "dimension": "", "message": err.Error()})
		return
	}
	intake := session.Intake

	// 2 — Discover available raw files
	rawDir := RawDir(projectPath, sessionID)
	rawFiles := []string{
		"performance.json", "seo.json", "accessibility.json", "technical.json",
		"code_audit.json", "content.json", "competitors.json", "security.json",
	}
	var availableFiles []string
	for _, name := range rawFiles {
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
	emitAuditLog(emit, "INFO", fmt.Sprintf("Found %d raw files: %s", len(availableFiles), strings.Join(availableFiles, ", ")))

	// 3 — Build Claude prompt
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

	// Conditionally insert Code Quality and Competitor Gap sections.
	if slices.Contains(availableFiles, "code_audit.json") {
		prompt = strings.Replace(prompt, "### Technical Health\n", "### Technical Health\n### Code Quality\n", 1)
	}
	if slices.Contains(availableFiles, "competitors.json") {
		prompt = strings.Replace(prompt, "### Security\n", "### Competitor Gap\n### Security\n", 1)
	}

	// 4 — Invoke Claude (cwd = rawDir so Claude reads files by relative path)
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

	// 5 — Write report.md
	reportPath := ReportPath(projectPath, sessionID)
	if err := os.WriteFile(reportPath, []byte(markdown), 0o644); err != nil {
		msg := "Failed to write report.md: " + err.Error()
		emitAuditLog(emit, "ERROR", msg)
		emitter.Emit("audit_error", map[string]string{"sessionId": sessionID, "dimension": "", "message": msg})
		return
	}

	// 6 — Update session phase to 'report'
	if err := SaveSessionPhase(projectPath, sessionID, PhaseReport); err != nil {
		emitAuditLog(emit, "WARN", "Could not update session phase: "+err.Error())
	}

	// 7 — Emit audit_report_ready
	emitter.Emit("audit_report_ready", map[string]string{
		"sessionId":  sessionID,
		"reportPath": reportPath,
	})
	emitAuditLog(emit, "INFO", "Report ready: "+reportPath)
}

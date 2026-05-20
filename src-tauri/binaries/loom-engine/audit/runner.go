package audit

import (
	"context"
	"fmt"
	"os/exec"
	"sync"
	"time"

	"github.com/loom/engine/ipc"
)

// EmitFn is the event-emission function passed to each dimension worker.
type EmitFn func(event string, payload any)

// DimensionResult holds the output of a completed audit dimension.
type DimensionResult struct {
	Score int // 0–100
}

// Dimension describes a single audit dimension and its run function.
type Dimension struct {
	Key   string
	Label string
	Run   func(ctx context.Context, session *SessionFile, projectPath string, emit EmitFn) (DimensionResult, error)
}

// runnerCancelFuncs maps sessionId → context cancel function for live cancellation.
var runnerCancelFuncs sync.Map

// RunAudit is the Phase 2 entry point. Called from main.go on "audit_start".
func RunAudit(parentCtx context.Context, projectPath, sessionID string, emitter *ipc.Emitter) {
	emit := func(event string, payload any) { emitter.Emit(event, payload) }

	// Clear stale sync.Once entries so re-runs on the same session work correctly.
	cleanupLHOnce(sessionID)
	cleanupHCOnce(sessionID)

	session, err := LoadSession(projectPath, sessionID)
	if err != nil {
		emitAuditLog(emit, "ERROR", "Failed to load session: "+err.Error())
		return
	}

	// ── Prerequisite checks ───────────────────────────────────────────────
	hasLighthouse := ensureLighthouse(emit)
	hasClaude := depOK(emit, "claude",
		"claude not found — SEO, content, competitors and code_quality will be skipped")
	if _, err := exec.LookPath("git"); err != nil {
		emitAuditLog(emit, "WARN", "git not found — code_quality git steps will be skipped")
	}

	intake := session.Intake
	hasCompetitors := len(intake.Competitors) > 0
	hasLocalRepo := intake.LocalRepoPath != nil && *intake.LocalRepoPath != ""

	// ── Shared HTML result (SEO + content both need the fetched HTML) ───────
	sharedHTML := &SharedHTMLResult{}

	// ── Dimension list ────────────────────────────────────────────────────
	// SEO and content share the HTML fetch via sharedHTML.
	seoRun := func(ctx context.Context, s *SessionFile, pp string, emit EmitFn) (DimensionResult, error) {
		return runSEO(ctx, s, pp, emit, sharedHTML)
	}
	contentRun := func(ctx context.Context, s *SessionFile, pp string, emit EmitFn) (DimensionResult, error) {
		return runContent(ctx, s, pp, emit, sharedHTML)
	}

	allDimensions := []Dimension{
		{Key: "performance",   Label: "Performance",     Run: runPerformance},
		{Key: "seo",           Label: "SEO On-page",      Run: seoRun},
		{Key: "accessibility", Label: "Accessibility",    Run: runAccessibility},
		{Key: "technical",     Label: "Technical Health", Run: runTechnical},
		{Key: "code_quality",  Label: "Code Quality",     Run: runCodeQuality},
		{Key: "content",       Label: "Content & Copy",   Run: contentRun},
		{Key: "competitors",   Label: "Competitor Gap",   Run: runCompetitors},
		{Key: "security",      Label: "Security",         Run: runSecurity},
	}

	skipIf := map[string]bool{
		"performance":   !hasLighthouse,
		"seo":           !hasClaude,
		"accessibility": !hasLighthouse,
		"technical":     false,
		"code_quality":  !hasLocalRepo || !hasClaude,
		"content":       !hasClaude,
		"competitors":   !hasCompetitors || !hasClaude,
		"security":      false,
	}

	var active []Dimension
	for _, d := range allDimensions {
		if skipIf[d.Key] {
			emitDimensionStatus(emit, d.Key, d.Label, "skipped", nil, nil)
		} else {
			emitDimensionStatus(emit, d.Key, d.Label, "pending", nil, nil)
			active = append(active, d)
		}
	}

	// ── Cancellable context ───────────────────────────────────────────────
	ctx, cancel := context.WithCancel(parentCtx)
	runnerCancelFuncs.Store(sessionID, cancel)
	defer func() {
		cancel()
		runnerCancelFuncs.Delete(sessionID)
	}()

	_ = SaveSessionPhase(projectPath, sessionID, PhaseRunning)

	// ── Worker pool: max 3 concurrent goroutines ──────────────────────────
	sem := make(chan struct{}, 3)
	var wg sync.WaitGroup

	for _, dim := range active {
		wg.Add(1)
		go func(d Dimension) {
			defer wg.Done()
			// Acquire semaphore slot or bail if cancelled.
			select {
			case sem <- struct{}{}:
			case <-ctx.Done():
				return
			}
			defer func() { <-sem }()

			emitDimensionStatus(emit, d.Key, d.Label, "running", nil, nil)
			emitAuditLog(emit, "INFO", "▶ Starting "+d.Label+"…")
			result, err := d.Run(ctx, session, projectPath, emit)
			if err != nil {
				if ctx.Err() != nil {
					return // cancelled — no error event
				}
				msg := err.Error()
				emitAuditLog(emit, "ERROR", "✗ "+d.Label+" failed: "+msg)
				emitDimensionStatus(emit, d.Key, d.Label, "error", nil, &msg)
				return
			}
			emitAuditLog(emit, "INFO", fmt.Sprintf("✓ %s complete — score: %d/100", d.Label, result.Score))
			emitDimensionStatus(emit, d.Key, d.Label, "done", &result.Score, nil)
		}(dim)
	}

	wg.Wait()

	// ── Final event ───────────────────────────────────────────────────────
	if ctx.Err() != nil {
		_ = SaveSessionPhase(projectPath, sessionID, PhaseCancelled)
		emit("audit_cancelled", map[string]string{"sessionId": sessionID})
	} else {
		_ = SaveSessionPhase(projectPath, sessionID, PhaseReport)
		emit("audit_completed", map[string]string{"sessionId": sessionID})
	}
}

// CancelAudit cancels a running audit by session ID.
func CancelAudit(sessionID string) {
	if fn, ok := runnerCancelFuncs.Load(sessionID); ok {
		fn.(context.CancelFunc)()
	}
}

// depOK checks whether a binary exists on PATH, emitting a warn log if not.
func depOK(emit EmitFn, name, warnMsg string) bool {
	if _, err := exec.LookPath(name); err != nil {
		emitAuditLog(emit, "WARN", warnMsg)
		return false
	}
	return true
}

// ensureLighthouse checks for the lighthouse binary and installs it via npm
// if it is not found. Returns true if lighthouse is available after the check.
func ensureLighthouse(emit EmitFn) bool {
	if _, err := exec.LookPath("lighthouse"); err == nil {
		return true
	}

	// Try to find npm first
	npm, err := exec.LookPath("npm")
	if err != nil {
		emitAuditLog(emit, "WARN",
			"Lighthouse not found and npm is unavailable — performance and accessibility will be skipped")
		return false
	}

	emitAuditLog(emit, "INFO", "Lighthouse not found — installing via npm (npm install -g lighthouse)…")
	cmd := exec.Command(npm, "install", "-g", "lighthouse")
	out, err := cmd.CombinedOutput()
	if err != nil {
		emitAuditLog(emit, "WARN",
			fmt.Sprintf("Lighthouse install failed: %v\n%s", err, string(out)))
		return false
	}

	// Verify it is now on PATH
	if _, err := exec.LookPath("lighthouse"); err != nil {
		emitAuditLog(emit, "WARN",
			"Lighthouse was installed but still not found on PATH — skipping performance and accessibility")
		return false
	}

	emitAuditLog(emit, "INFO", "✓ Lighthouse installed successfully")
	return true
}

// emitDimensionStatus emits an audit_dimension_status event.
func emitDimensionStatus(emit EmitFn, key, label, status string, score *int, errorMessage *string) {
	emit("audit_dimension_status", map[string]any{
		"key":          key,
		"label":        label,
		"status":       status,
		"score":        score,
		"errorMessage": errorMessage,
	})
}

// emitAuditLog emits a log_line event so audit output appears in the global
// Output panel alongside all other engine log output.
func emitAuditLog(emit EmitFn, level, content string) {
	emit("log_line", map[string]any{
		"timestamp": time.Now().Format("15:04:05"),
		"level":     level,
		"content":   content,
	})
}

package audit

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"os/exec"
	"sync"
	"time"
)

// ── Lighthouse JSON structs ───────────────────────────────────────────────────

type lhrRoot struct {
	Categories map[string]lhrCategory `json:"categories"`
	Audits     map[string]lhrAudit    `json:"audits"`
}

type lhrCategory struct {
	Score     *float64     `json:"score"`
	AuditRefs []lhrAuditRef `json:"auditRefs"`
}

type lhrAuditRef struct {
	ID string `json:"id"`
}

type lhrAudit struct {
	ID               string           `json:"id"`
	Title            string           `json:"title"`
	Description      string           `json:"description"`
	Score            *float64         `json:"score"`
	ScoreDisplayMode string           `json:"scoreDisplayMode"`
	NumericValue     *float64         `json:"numericValue"`
	Details          *lhrAuditDetails `json:"details"`
}

type lhrAuditDetails struct {
	Type             string   `json:"type"`
	OverallSavingsMs *float64 `json:"overallSavingsMs"`
}

// ── Output schemas ────────────────────────────────────────────────────────────

type perfOutput struct {
	Score         float64      `json:"score"`
	Metrics       perfMetrics  `json:"metrics"`
	Opportunities []perfOpportunity `json:"opportunities"`
}

type perfMetrics struct {
	FCP *float64 `json:"fcp,omitempty"`
	LCP *float64 `json:"lcp,omitempty"`
	TBT *float64 `json:"tbt,omitempty"`
	CLS *float64 `json:"cls,omitempty"`
	SI  *float64 `json:"si,omitempty"`
	TTI *float64 `json:"tti,omitempty"`
}

type perfOpportunity struct {
	ID        string  `json:"id"`
	Title     string  `json:"title"`
	SavingsMs float64 `json:"savings_ms"`
}

type a11yOutput struct {
	Score  float64      `json:"score"`
	Audits []a11yAudit  `json:"audits"`
}

type a11yAudit struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description"`
}

// ── Single-invocation coordinator ─────────────────────────────────────────────

type lhOnce struct {
	once sync.Once
	err  error
}

var (
	lhOnceMu sync.Mutex
	lhOnceMap = map[string]*lhOnce{}
)

func getLHOnce(sessionID string) *lhOnce {
	lhOnceMu.Lock()
	defer lhOnceMu.Unlock()
	if o, ok := lhOnceMap[sessionID]; ok {
		return o
	}
	o := &lhOnce{}
	lhOnceMap[sessionID] = o
	return o
}

func cleanupLHOnce(sessionID string) {
	lhOnceMu.Lock()
	delete(lhOnceMap, sessionID)
	lhOnceMu.Unlock()
}

// ── Exported run function ─────────────────────────────────────────────────────

// RunLighthouse runs the Lighthouse CLI once for both performance and
// accessibility categories and writes performance.json + accessibility.json
// into sessionRawPath. Safe to call concurrently — only one invocation runs.
func RunLighthouse(ctx context.Context, siteURL, sessionRawPath string, emit EmitFn) error {
	// Wrap with a 120 s hard timeout on top of the parent context.
	ctx, cancel := context.WithTimeout(ctx, 120*time.Second)
	defer cancel()

	emitAuditLog(emit, "INFO", "Running Lighthouse for "+siteURL)

	args := []string{
		siteURL,
		"--output", "json",
		"--output-path", "stdout",
		"--only-categories=performance,accessibility",
		"--chrome-flags=--headless --no-sandbox",
		"--quiet",
	}

	cmd := exec.Command("lighthouse", args...)
	var stdoutBuf, stderrBuf bytes.Buffer
	cmd.Stdout = &stdoutBuf
	cmd.Stderr = &stderrBuf

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start lighthouse: %w", err)
	}

	// Kill process on context cancellation.
	done := make(chan struct{})
	defer close(done)
	go func() {
		select {
		case <-ctx.Done():
			if cmd.Process != nil {
				cmd.Process.Kill() //nolint:errcheck
			}
		case <-done:
		}
	}()

	if err := cmd.Wait(); err != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return fmt.Errorf("lighthouse exited: %w\n%s", err, stderrBuf.String())
	}

	raw := stdoutBuf.Bytes()
	if len(raw) == 0 {
		return fmt.Errorf("Lighthouse produced no output")
	}

	var lhr lhrRoot
	if err := json.Unmarshal(raw, &lhr); err != nil {
		return fmt.Errorf("parse Lighthouse output: %w", err)
	}

	if err := os.MkdirAll(sessionRawPath, 0o755); err != nil {
		return fmt.Errorf("mkdir raw: %w", err)
	}

	if err := writePerformanceJSON(lhr, sessionRawPath, emit); err != nil {
		return err
	}
	return writeAccessibilityJSON(lhr, sessionRawPath, emit)
}

// ── Extraction helpers ────────────────────────────────────────────────────────

func writePerformanceJSON(lhr lhrRoot, rawDir string, emit EmitFn) error {
	cat := lhr.Categories["performance"]
	score := 0.0
	if cat.Score != nil {
		score = *cat.Score
	}

	metrics := perfMetrics{
		FCP: auditNumeric(lhr.Audits, "first-contentful-paint"),
		LCP: auditNumeric(lhr.Audits, "largest-contentful-paint"),
		TBT: auditNumeric(lhr.Audits, "total-blocking-time"),
		CLS: auditNumeric(lhr.Audits, "cumulative-layout-shift"),
		SI:  auditNumeric(lhr.Audits, "speed-index"),
		TTI: auditNumeric(lhr.Audits, "interactive"),
	}

	var opps []perfOpportunity
	for id, a := range lhr.Audits {
		if a.Details != nil && a.Details.Type == "opportunity" &&
			a.Details.OverallSavingsMs != nil && *a.Details.OverallSavingsMs > 0 {
			opps = append(opps, perfOpportunity{
				ID:        id,
				Title:     a.Title,
				SavingsMs: *a.Details.OverallSavingsMs,
			})
		}
	}
	if opps == nil {
		opps = []perfOpportunity{}
	}

	out := perfOutput{Score: score, Metrics: metrics, Opportunities: opps}
	path := rawDir + "/performance.json"
	if err := writeJSONAtomic(path, out); err != nil {
		return fmt.Errorf("write performance.json: %w", err)
	}
	emitAuditLog(emit, "INFO", "Wrote performance.json (score="+fmt.Sprintf("%.2f", score)+")")
	return nil
}

func writeAccessibilityJSON(lhr lhrRoot, rawDir string, emit EmitFn) error {
	cat := lhr.Categories["accessibility"]
	score := 0.0
	if cat.Score != nil {
		score = *cat.Score
	}

	var audits []a11yAudit
	for _, ref := range cat.AuditRefs {
		a, ok := lhr.Audits[ref.ID]
		if !ok || a.ScoreDisplayMode == "notApplicable" {
			continue
		}
		if a.Score != nil && *a.Score >= 1.0 {
			continue
		}
		audits = append(audits, a11yAudit{ID: ref.ID, Title: a.Title, Description: a.Description})
	}
	if audits == nil {
		audits = []a11yAudit{}
	}

	out := a11yOutput{Score: score, Audits: audits}
	path := rawDir + "/accessibility.json"
	if err := writeJSONAtomic(path, out); err != nil {
		return fmt.Errorf("write accessibility.json: %w", err)
	}
	emitAuditLog(emit, "INFO", "Wrote accessibility.json (score="+fmt.Sprintf("%.2f", score)+")")
	return nil
}

func auditNumeric(audits map[string]lhrAudit, id string) *float64 {
	if a, ok := audits[id]; ok && a.NumericValue != nil {
		v := *a.NumericValue
		return &v
	}
	return nil
}

func writeJSONAtomic(path string, v any) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// ── Dimension run functions ───────────────────────────────────────────────────

func runPerformance(ctx context.Context, session *SessionFile, projectPath string, emit EmitFn) (DimensionResult, error) {
	rawDir := RawDir(projectPath, session.SessionID)
	o := getLHOnce(session.SessionID)
	o.once.Do(func() {
		if err := EnsureRawDir(projectPath, session.SessionID); err != nil {
			o.err = err
			return
		}
		o.err = RunLighthouse(ctx, session.Intake.SiteURL, rawDir, emit)
		// Clean up the once entry after a short delay so a re-run on the same session
		// is possible. In practice sessions are not re-run during the same process lifetime.
		go func() {
			time.Sleep(5 * time.Second)
			cleanupLHOnce(session.SessionID)
		}()
	})
	if o.err != nil {
		return DimensionResult{}, o.err
	}
	return scoreFromFile(rawDir+"/performance.json", "performance")
}

func runAccessibility(ctx context.Context, session *SessionFile, projectPath string, emit EmitFn) (DimensionResult, error) {
	rawDir := RawDir(projectPath, session.SessionID)
	o := getLHOnce(session.SessionID)
	o.once.Do(func() {
		if err := EnsureRawDir(projectPath, session.SessionID); err != nil {
			o.err = err
			return
		}
		o.err = RunLighthouse(ctx, session.Intake.SiteURL, rawDir, emit)
		go func() {
			time.Sleep(5 * time.Second)
			cleanupLHOnce(session.SessionID)
		}()
	})
	if o.err != nil {
		return DimensionResult{}, o.err
	}
	return scoreFromFile(rawDir+"/accessibility.json", "accessibility")
}

// scoreFromFile reads the score field from a JSON file and converts it to 0–100.
func scoreFromFile(path, key string) (DimensionResult, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return DimensionResult{}, fmt.Errorf("read %s: %w", key, err)
	}
	var v struct {
		Score float64 `json:"score"`
	}
	if err := json.Unmarshal(data, &v); err != nil {
		return DimensionResult{}, fmt.Errorf("parse %s score: %w", key, err)
	}
	return DimensionResult{Score: int(math.Round(v.Score * 100))}, nil
}

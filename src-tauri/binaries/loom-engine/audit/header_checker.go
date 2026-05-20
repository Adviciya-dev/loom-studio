package audit

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"
)

// ── Output types ──────────────────────────────────────────────────────────────

// TechnicalPartial is the header-checker contribution to technical.json.
type TechnicalPartial struct {
	RedirectChain []string `json:"redirectChain"`
	HTTPVersion   string   `json:"httpVersion"`
}

type securityHeaders struct {
	StrictTransportSecurity bool `json:"strictTransportSecurity"`
	ContentSecurityPolicy   bool `json:"contentSecurityPolicy"`
	XFrameOptions           bool `json:"xFrameOptions"`
	XContentTypeOptions     bool `json:"xContentTypeOptions"`
	ReferrerPolicy          bool `json:"referrerPolicy"`
}

type technicalIssue struct {
	Severity    string `json:"severity"`
	Description string `json:"description"`
}

type securityOutput struct {
	Score   int             `json:"score"`
	Headers securityHeaders `json:"headers"`
	Issues  []technicalIssue `json:"issues"`
}

type technicalOutput struct {
	Score         int             `json:"score"`
	RedirectChain []string        `json:"redirectChain"`
	RobotsTxt     robotsTxtData   `json:"robotsTxt"`
	SitemapXml    sitemapData     `json:"sitemapXml"`
	HTTPVersion   string          `json:"httpVersion"`
	Issues        []technicalIssue `json:"issues"`
}

// ── Shared once (RunHeaderChecks runs exactly once per session) ───────────────

type hcOnce struct {
	once          sync.Once
	partial       TechnicalPartial
	securityScore int
	err           error
}

var (
	hcOnceMu  sync.Mutex
	hcOnceMap = map[string]*hcOnce{}
)

func getHCOnce(sessionID string) *hcOnce {
	hcOnceMu.Lock()
	defer hcOnceMu.Unlock()
	if o, ok := hcOnceMap[sessionID]; ok {
		return o
	}
	o := &hcOnce{}
	hcOnceMap[sessionID] = o
	return o
}

func cleanupHCOnce(sessionID string) {
	hcOnceMu.Lock()
	delete(hcOnceMap, sessionID)
	hcOnceMu.Unlock()
}

// ── RunHeaderChecks ───────────────────────────────────────────────────────────

// RunHeaderChecks issues an HTTP HEAD (falling back to GET) to siteURL, collects
// the redirect chain, HTTP version, and security headers. Writes security.json
// and returns TechnicalPartial for merging into technical.json.
func RunHeaderChecks(ctx context.Context, siteURL, sessionRawPath string, emit EmitFn) (TechnicalPartial, int, error) {
	emitAuditLog(emit, "INFO", "[headers] Checking HTTP headers for "+siteURL)

	var redirectChain []string
	redirectChain = append(redirectChain, siteURL)

	client := &http.Client{
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			redirectChain = append(redirectChain, req.URL.String())
			if len(via) >= 10 {
				return fmt.Errorf("too many redirects")
			}
			return nil
		},
	}

	// Try HEAD first; fall back to GET if server rejects HEAD.
	var resp *http.Response
	var err error
	for _, method := range []string{http.MethodHead, http.MethodGet} {
		var req *http.Request
		req, err = http.NewRequestWithContext(ctx, method, siteURL, nil)
		if err != nil {
			return TechnicalPartial{}, 0, fmt.Errorf("build request: %w", err)
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; LoomStudio/1.0)")
		resp, err = client.Do(req)
		if err == nil {
			break
		}
		if ctx.Err() != nil {
			return TechnicalPartial{}, 0, ctx.Err()
		}
	}
	if err != nil {
		return TechnicalPartial{}, 0, fmt.Errorf("Could not connect to %s. Check the URL and try again.", siteURL)
	}
	defer resp.Body.Close()

	// Deduplicate and close the redirect chain.
	finalURL := resp.Request.URL.String()
	if len(redirectChain) == 0 || redirectChain[len(redirectChain)-1] != finalURL {
		redirectChain = append(redirectChain, finalURL)
	}

	// HTTP version normalisation: "HTTP/2.0" → "HTTP/2", "HTTP/1.1" → "HTTP/1.1".
	proto := resp.Proto
	if strings.HasPrefix(proto, "HTTP/2") {
		proto = "HTTP/2"
	} else if strings.HasPrefix(proto, "HTTP/3") {
		proto = "HTTP/3"
	}

	// Security header presence.
	h := resp.Header
	hdrs := securityHeaders{
		StrictTransportSecurity: h.Get("Strict-Transport-Security") != "",
		ContentSecurityPolicy:   h.Get("Content-Security-Policy") != "",
		XFrameOptions:           h.Get("X-Frame-Options") != "",
		XContentTypeOptions:     h.Get("X-Content-Type-Options") != "",
		ReferrerPolicy:          h.Get("Referrer-Policy") != "",
	}

	// Score: 20 pts per present header.
	score := 0
	var issues []technicalIssue
	type headerCheck struct {
		present  bool
		severity string
		desc     string
	}
	checks := []headerCheck{
		{hdrs.StrictTransportSecurity, "high", "Strict-Transport-Security header missing"},
		{hdrs.ContentSecurityPolicy, "high", "Content-Security-Policy header missing"},
		{hdrs.XFrameOptions, "medium", "X-Frame-Options header missing"},
		{hdrs.XContentTypeOptions, "medium", "X-Content-Type-Options header missing"},
		{hdrs.ReferrerPolicy, "low", "Referrer-Policy header missing"},
	}
	for _, c := range checks {
		if c.present {
			score += 20
		} else {
			issues = append(issues, technicalIssue{Severity: c.severity, Description: c.desc})
		}
	}
	if issues == nil {
		issues = []technicalIssue{}
	}

	out := securityOutput{Score: score, Headers: hdrs, Issues: issues}
	if err := writeJSONAtomicTo(sessionRawPath+"/security.json", out); err != nil {
		return TechnicalPartial{}, 0, fmt.Errorf("write security.json: %w", err)
	}
	emitAuditLog(emit, "INFO", fmt.Sprintf("[headers] Wrote security.json (score=%d)", score))

	partial := TechnicalPartial{
		RedirectChain: redirectChain,
		HTTPVersion:   proto,
	}
	return partial, score, nil
}

// ── Dimension runners ─────────────────────────────────────────────────────────

func runSecurity(ctx context.Context, session *SessionFile, projectPath string, emit EmitFn) (DimensionResult, error) {
	rawDir := RawDir(projectPath, session.SessionID)
	if err := EnsureRawDir(projectPath, session.SessionID); err != nil {
		return DimensionResult{}, err
	}
	o := getHCOnce(session.SessionID)
	o.once.Do(func() {
		p, s, err := RunHeaderChecks(ctx, session.Intake.SiteURL, rawDir, emit)
		o.partial, o.securityScore, o.err = p, s, err
	})
	if o.err != nil {
		return DimensionResult{}, o.err
	}
	return DimensionResult{Score: o.securityScore}, nil
}

func runTechnical(ctx context.Context, session *SessionFile, projectPath string, emit EmitFn) (DimensionResult, error) {
	rawDir := RawDir(projectPath, session.SessionID)
	if err := EnsureRawDir(projectPath, session.SessionID); err != nil {
		return DimensionResult{}, err
	}

	// Run header checks and robots checks concurrently.
	var (
		partial   TechnicalPartial
		robots    robotsTxtData
		sitemap   sitemapData
		headErr   error
		robotsErr error
		wg        sync.WaitGroup
	)

	wg.Add(1)
	go func() {
		defer wg.Done()
		o := getHCOnce(session.SessionID)
		o.once.Do(func() {
			p, s, err := RunHeaderChecks(ctx, session.Intake.SiteURL, rawDir, emit)
			o.partial, o.securityScore, o.err = p, s, err
		})
		partial, headErr = o.partial, o.err
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		robots, sitemap, robotsErr = RunRobotsChecks(ctx, session.Intake.SiteURL, emit)
	}()

	wg.Wait()

	if headErr != nil {
		return DimensionResult{}, headErr
	}
	// Robots errors are non-fatal; already logged inside RunRobotsChecks.
	_ = robotsErr

	score := calcTechnicalScore(partial, robots, sitemap)
	var issues []technicalIssue
	if !robots.Found {
		issues = append(issues, technicalIssue{Severity: "medium", Description: "robots.txt not found"})
	}
	if !sitemap.Found {
		issues = append(issues, technicalIssue{Severity: "medium", Description: "sitemap.xml not found"})
	}
	hops := len(partial.RedirectChain) - 1
	if hops > 1 {
		issues = append(issues, technicalIssue{
			Severity:    "high",
			Description: fmt.Sprintf("Redirect chain has %d hops (ideal: 1)", hops),
		})
	}
	if partial.HTTPVersion == "HTTP/1.1" {
		issues = append(issues, technicalIssue{Severity: "medium", Description: "Site uses HTTP/1.1 instead of HTTP/2 or HTTP/3"})
	}
	if issues == nil {
		issues = []technicalIssue{}
	}

	out := technicalOutput{
		Score:         score,
		RedirectChain: partial.RedirectChain,
		RobotsTxt:     robots,
		SitemapXml:    sitemap,
		HTTPVersion:   partial.HTTPVersion,
		Issues:        issues,
	}
	if err := writeJSONAtomicTo(rawDir+"/technical.json", out); err != nil {
		return DimensionResult{}, fmt.Errorf("write technical.json: %w", err)
	}
	emitAuditLog(emit, "INFO", fmt.Sprintf("[technical] Wrote technical.json (score=%d)", score))
	return DimensionResult{Score: score}, nil
}

func calcTechnicalScore(partial TechnicalPartial, robots robotsTxtData, sitemap sitemapData) int {
	score := 100
	if !robots.Found {
		score -= 20
	}
	if !sitemap.Found {
		score -= 20
	}
	hops := len(partial.RedirectChain) - 1
	if hops > 1 {
		penalty := (hops - 1) * 10
		if penalty > 30 {
			penalty = 30
		}
		score -= penalty
	}
	if partial.HTTPVersion == "HTTP/1.1" {
		score -= 10
	}
	if score < 0 {
		score = 0
	}
	return score
}

// ── Shared atomic write helper ────────────────────────────────────────────────

func writeJSONAtomicTo(path string, v any) error {
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

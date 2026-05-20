package audit

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os/exec"
	"strings"
	"sync"
)

// ── JSON output schemas ───────────────────────────────────────────────────────

type auditIssue struct {
	Severity    string `json:"severity"`
	Description string `json:"description"`
}

type seoOutput struct {
	Score           int          `json:"score"`
	Title           string       `json:"title"`
	MetaDescription string       `json:"metaDescription"`
	H1              []string     `json:"h1"`
	CanonicalURL    string       `json:"canonicalUrl"`
	OpenGraph       OGData       `json:"openGraph"`
	Issues          []auditIssue `json:"issues"`
}

type keywordCoverage struct {
	Found   []string `json:"found"`
	Missing []string `json:"missing"`
}

type contentOutput struct {
	Score            int             `json:"score"`
	KeywordCoverage  keywordCoverage `json:"keywordCoverage"`
	ReadabilityGrade string          `json:"readabilityGrade"`
	Issues           []auditIssue    `json:"issues"`
}

type competitorEntry struct {
	URL       string   `json:"url"`
	Strengths []string `json:"strengths"`
	Gaps      []string `json:"gaps"`
}

type competitorOutput struct {
	Score       *int              `json:"score"` // always null per spec
	Competitors []competitorEntry `json:"competitors"`
	Summary     string            `json:"summary"`
}

type codeFinding struct {
	Severity    string `json:"severity"`
	File        string `json:"file"`
	Description string `json:"description"`
}

type codeOutput struct {
	Score    int           `json:"score"`
	Findings []codeFinding `json:"findings"`
	Summary  string        `json:"summary"`
}

// ── Claude invocation ─────────────────────────────────────────────────────────

// invokeClaude spawns Claude CLI, streams text output line by line to emit,
// and returns the concatenated assistant text. Kills the process on ctx cancel.
func invokeClaude(ctx context.Context, prompt, cwd string, emit EmitFn) (string, error) {
	cmd := exec.CommandContext(ctx, "claude",
		"--dangerously-skip-permissions",
		"--output-format", "stream-json",
		"--print",
		"--verbose",
		prompt,
	)
	if cwd != "" {
		cmd.Dir = cwd
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", fmt.Errorf("pipe stdout: %w", err)
	}
	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		return "", fmt.Errorf("pipe stderr: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("start claude: %w", err)
	}

	// Kill on context cancellation.
	killDone := make(chan struct{})
	defer close(killDone)
	go func() {
		select {
		case <-ctx.Done():
			if cmd.Process != nil {
				cmd.Process.Kill() //nolint:errcheck
			}
		case <-killDone:
		}
	}()

	var (
		stderrBytes []byte
		textParts   []string
		mu          sync.Mutex
		wg          sync.WaitGroup
	)

	wg.Add(1)
	go func() {
		defer wg.Done()
		stderrBytes, _ = io.ReadAll(stderrPipe)
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		scanner := bufio.NewScanner(stdout)
		scanner.Buffer(make([]byte, 1<<20), 1<<20)
		for scanner.Scan() {
			line := scanner.Text()
			if line == "" {
				continue
			}
			chunks := extractClaudeText(line)
			for _, chunk := range chunks {
				if chunk == "" {
					continue
				}
				emitAuditLog(emit, "INFO", chunk)
				mu.Lock()
				textParts = append(textParts, chunk)
				mu.Unlock()
			}
		}
	}()

	wg.Wait()

	if err := cmd.Wait(); err != nil {
		if ctx.Err() != nil {
			return "", ctx.Err()
		}
		return "", fmt.Errorf("claude: %w\n%s", err, strings.TrimSpace(string(stderrBytes)))
	}

	return strings.Join(textParts, ""), nil
}

// streamLine is a minimal union of the Claude stream-json event shapes we care about.
type streamLine struct {
	Type    string `json:"type"`
	Role    string `json:"role,omitempty"`
	// content_block_delta path
	Delta   *struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"delta,omitempty"`
	// full assistant message path
	Message *struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	} `json:"message,omitempty"`
	// top-level content array (older format)
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content,omitempty"`
}

// extractClaudeText parses a single stream-json line and returns any text chunks.
// Handles: content_block_delta, assistant message, and top-level content array.
func extractClaudeText(line string) []string {
	if !strings.Contains(line, `"text"`) {
		return nil
	}
	var ev streamLine
	if err := json.Unmarshal([]byte(line), &ev); err != nil {
		return nil
	}
	// Streaming delta (most common during generation)
	if ev.Delta != nil && ev.Delta.Type == "text_delta" && ev.Delta.Text != "" {
		return []string{ev.Delta.Text}
	}
	// Full message with content array (e.g. type="assistant")
	if ev.Message != nil {
		var texts []string
		for _, c := range ev.Message.Content {
			if c.Type == "text" && c.Text != "" {
				texts = append(texts, c.Text)
			}
		}
		return texts
	}
	// Top-level content array
	if len(ev.Content) > 0 {
		var texts []string
		for _, c := range ev.Content {
			if c.Type == "text" && c.Text != "" {
				texts = append(texts, c.Text)
			}
		}
		return texts
	}
	return nil
}

// parseClaudeJSON strips markdown fences and unmarshals Claude's JSON output.
func parseClaudeJSON(raw string, v any) error {
	s := strings.TrimSpace(raw)
	s = strings.TrimPrefix(s, "```json")
	s = strings.TrimPrefix(s, "```")
	s = strings.TrimSuffix(s, "```")
	s = strings.TrimSpace(s)
	if err := json.Unmarshal([]byte(s), v); err != nil {
		return fmt.Errorf("claude output was not valid JSON: %w\nraw: %.200s", err, raw)
	}
	return nil
}


// ── AnalyseSEO ────────────────────────────────────────────────────────────────

// AnalyseSEO invokes Claude to analyse on-page SEO, writes seo.json, and
// returns the 0–100 score.
func AnalyseSEO(ctx context.Context, htmlData *HTMLData, intake AuditIntake, sessionRawPath string, emit EmitFn) (int, error) {
	emitAuditLog(emit, "INFO", "[seo] Sending prompt to Claude…")

	h1 := strings.Join(htmlData.H1, ", ")
	if h1 == "" {
		h1 = "(none)"
	}
	h2Slice := htmlData.H2
	if len(h2Slice) > 5 {
		h2Slice = h2Slice[:5]
	}
	h2 := strings.Join(h2Slice, ", ")
	if h2 == "" {
		h2 = "(none)"
	}
	og := fmt.Sprintf("title=%q image=%q type=%q", htmlData.OpenGraph.Title, htmlData.OpenGraph.Image, htmlData.OpenGraph.Type)

	prompt := fmt.Sprintf(`You are an SEO specialist analysing a web page.

Page data:
  URL: %s
  Title: %s
  Meta description: %s
  H1 tags: %s
  H2 tags (first 5): %s
  Canonical URL: %s
  Open Graph: %s
  Target keywords: %s
  Industry: %s

Analyse the on-page SEO and return ONLY a JSON object matching this schema:
{
  "score": <integer 0-100>,
  "title": "<page title>",
  "metaDescription": "<meta description or empty string>",
  "h1": [<h1 texts>],
  "canonicalUrl": "<canonical URL or empty string>",
  "openGraph": { "title": "<og:title>", "image": "<og:image>" },
  "issues": [
    { "severity": "high|medium|low", "description": "<actionable issue description>" }
  ]
}

Score criteria:
- 90-100: All key elements present, keyword-optimised
- 70-89: Minor issues (e.g., meta desc too long, weak keyword usage)
- 50-69: Significant issues (e.g., missing meta desc, H1 absent)
- 0-49: Critical issues (e.g., no title, duplicate H1s, canonical pointing elsewhere)

Output ONLY valid JSON. No preamble, no explanation.`,
		htmlData.FinalURL, htmlData.Title, htmlData.MetaDescription,
		h1, h2, htmlData.CanonicalURL, og,
		intake.NicheKeywords, intake.Industry,
	)

	emitAuditLog(emit, "INFO", "[seo] Awaiting Claude response…")
	raw, err := invokeClaude(ctx, prompt, "", emit)
	if err != nil {
		return 0, fmt.Errorf("invokeClaude SEO: %w", err)
	}
	emitAuditLog(emit, "INFO", "[seo] Response received, parsing JSON…")

	var out seoOutput
	if err := parseClaudeJSON(raw, &out); err != nil {
		return 0, err
	}
	if out.Issues == nil {
		out.Issues = []auditIssue{}
	}
	if out.H1 == nil {
		out.H1 = []string{}
	}

	if err := writeJSONAtomicTo(sessionRawPath+"/seo.json", out); err != nil {
		return 0, fmt.Errorf("write seo.json: %w", err)
	}
	emitAuditLog(emit, "INFO", fmt.Sprintf("[seo] Wrote seo.json (score=%d)", out.Score))
	return out.Score, nil
}

// ── AnalyseContent ────────────────────────────────────────────────────────────

// AnalyseContent invokes Claude to analyse content quality, writes content.json,
// and returns the 0–100 score.
func AnalyseContent(ctx context.Context, htmlData *HTMLData, intake AuditIntake, sessionRawPath string, emit EmitFn) (int, error) {
	emitAuditLog(emit, "INFO", "[content] Sending prompt to Claude…")

	rawHTML := htmlData.RawHTML
	if len(rawHTML) > 8000 {
		rawHTML = rawHTML[:8000]
	}

	prompt := fmt.Sprintf(`You are a content strategist auditing a website's content quality.

Site: %s (%s)
Industry: %s
Target market: %s
Target keywords: %s
Business goal: %s

Page HTML (truncated to 8000 chars):
%s

Analyse the content and return ONLY a JSON object:
{
  "score": <integer 0-100>,
  "keywordCoverage": {
    "found": [<keywords present in content>],
    "missing": [<keywords absent from content>]
  },
  "readabilityGrade": "<e.g. Grade 8, Grade 12>",
  "issues": [
    { "severity": "high|medium|low", "description": "<actionable issue>" }
  ]
}

Output ONLY valid JSON. No preamble.`,
		intake.SiteName, intake.SiteURL,
		intake.Industry, intake.TargetMarket,
		intake.NicheKeywords, intake.BusinessGoal,
		rawHTML,
	)

	emitAuditLog(emit, "INFO", "[content] Awaiting Claude response…")
	raw, err := invokeClaude(ctx, prompt, "", emit)
	if err != nil {
		return 0, fmt.Errorf("invokeClaude content: %w", err)
	}
	emitAuditLog(emit, "INFO", "[content] Response received, parsing JSON…")

	var out contentOutput
	if err := parseClaudeJSON(raw, &out); err != nil {
		return 0, err
	}
	if out.Issues == nil {
		out.Issues = []auditIssue{}
	}
	if out.KeywordCoverage.Found == nil {
		out.KeywordCoverage.Found = []string{}
	}
	if out.KeywordCoverage.Missing == nil {
		out.KeywordCoverage.Missing = []string{}
	}

	if err := writeJSONAtomicTo(sessionRawPath+"/content.json", out); err != nil {
		return 0, fmt.Errorf("write content.json: %w", err)
	}
	emitAuditLog(emit, "INFO", fmt.Sprintf("[content] Wrote content.json (score=%d)", out.Score))
	return out.Score, nil
}

// ── AnalyseCompetitors ────────────────────────────────────────────────────────

// AnalyseCompetitors invokes Claude for a competitor gap analysis and writes
// competitors.json. Score is always null per spec.
func AnalyseCompetitors(ctx context.Context, competitors []string, intake AuditIntake, sessionRawPath string, emit EmitFn) error {
	emitAuditLog(emit, "INFO", "[competitors] Sending prompt to Claude…")

	prompt := fmt.Sprintf(`You are a competitive analyst comparing a client website against its competitors.

Client site: %s
Industry: %s
Keywords: %s
Business goal: %s

Competitor URLs to analyse:
%s

For each competitor, based on your knowledge of these sites, identify their strengths and gaps relative to the client. Then return ONLY a JSON object:
{
  "score": null,
  "competitors": [
    {
      "url": "<competitor URL>",
      "strengths": ["<strength 1>", "<strength 2>"],
      "gaps": ["<gap 1>", "<gap 2>"]
    }
  ],
  "summary": "<2-3 sentence overall competitive landscape summary>"
}

Output ONLY valid JSON. No preamble.`,
		intake.SiteURL, intake.Industry,
		intake.NicheKeywords, intake.BusinessGoal,
		strings.Join(competitors, "\n"),
	)

	emitAuditLog(emit, "INFO", "[competitors] Awaiting Claude response…")
	raw, err := invokeClaude(ctx, prompt, "", emit)
	if err != nil {
		return fmt.Errorf("invokeClaude competitors: %w", err)
	}
	emitAuditLog(emit, "INFO", "[competitors] Response received, parsing JSON…")

	var out competitorOutput
	if err := parseClaudeJSON(raw, &out); err != nil {
		return err
	}
	if out.Competitors == nil {
		out.Competitors = []competitorEntry{}
	}

	if err := writeJSONAtomicTo(sessionRawPath+"/competitors.json", out); err != nil {
		return fmt.Errorf("write competitors.json: %w", err)
	}
	emitAuditLog(emit, "INFO", fmt.Sprintf("[competitors] Wrote competitors.json (%d entries)", len(out.Competitors)))
	return nil
}

// ── AnalyseCode ───────────────────────────────────────────────────────────────

// AnalyseCode invokes Claude with --cwd set to localRepoPath so it can read
// source files directly. Writes code_audit.json and returns the 0–100 score.
func AnalyseCode(ctx context.Context, localRepoPath string, intake AuditIntake, sessionRawPath string, emit EmitFn) (int, error) {
	emitAuditLog(emit, "INFO", "[code_quality] Sending prompt to Claude (cwd="+localRepoPath+")…")

	prompt := fmt.Sprintf(`You are a senior software engineer auditing a client website's codebase.

Site: %s
CMS/Stack: %s
Industry: %s
Business goal: %s

The source code is in the current directory. Analyse:
1. Overall file structure and code organisation
2. Dependency health (outdated packages, security vulnerabilities in package.json/composer.json/etc)
3. Dead code and unused files
4. Security anti-patterns (hardcoded secrets, SQL injection risks, XSS vulnerabilities)
5. Performance bottlenecks (large assets, unoptimised queries, missing caching)
6. Alignment with the stated business goal

Return ONLY a JSON object:
{
  "score": <integer 0-100>,
  "findings": [
    { "severity": "high|medium|low", "file": "<relative file path or 'general'>", "description": "<specific actionable finding>" }
  ],
  "summary": "<3-5 sentence overall code quality assessment>"
}

Output ONLY valid JSON. No preamble.`,
		intake.SiteName, intake.CMS,
		intake.Industry, intake.BusinessGoal,
	)

	emitAuditLog(emit, "INFO", "[code_quality] Awaiting Claude response…")
	raw, err := invokeClaude(ctx, prompt, localRepoPath, emit)
	if err != nil {
		return 0, fmt.Errorf("invokeClaude code: %w", err)
	}
	emitAuditLog(emit, "INFO", "[code_quality] Response received, parsing JSON…")

	var out codeOutput
	if err := parseClaudeJSON(raw, &out); err != nil {
		return 0, err
	}
	if out.Findings == nil {
		out.Findings = []codeFinding{}
	}

	if err := writeJSONAtomicTo(sessionRawPath+"/code_audit.json", out); err != nil {
		return 0, fmt.Errorf("write code_audit.json: %w", err)
	}
	emitAuditLog(emit, "INFO", fmt.Sprintf("[code_quality] Wrote code_audit.json (score=%d)", out.Score))
	return out.Score, nil
}

// ── Dimension runners ─────────────────────────────────────────────────────────

func runSEO(ctx context.Context, session *SessionFile, projectPath string, emit EmitFn, sh *SharedHTMLResult) (DimensionResult, error) {
	emitAuditLog(emit, "INFO", "[seo] Fetching HTML…")
	htmlData, err := sh.Get(ctx, session.Intake.SiteURL)
	if err != nil {
		return DimensionResult{}, err
	}
	if err := EnsureRawDir(projectPath, session.SessionID); err != nil {
		return DimensionResult{}, err
	}
	score, err := AnalyseSEO(ctx, htmlData, session.Intake, RawDir(projectPath, session.SessionID), emit)
	if err != nil {
		return DimensionResult{}, err
	}
	return DimensionResult{Score: score}, nil
}

func runContent(ctx context.Context, session *SessionFile, projectPath string, emit EmitFn, sh *SharedHTMLResult) (DimensionResult, error) {
	emitAuditLog(emit, "INFO", "[content] Waiting for HTML fetch…")
	htmlData, err := sh.Get(ctx, session.Intake.SiteURL)
	if err != nil {
		return DimensionResult{}, err
	}
	emitAuditLog(emit, "INFO", fmt.Sprintf("[content] HTML ready (%d bytes)", len(htmlData.RawHTML)))
	if err := EnsureRawDir(projectPath, session.SessionID); err != nil {
		return DimensionResult{}, err
	}
	score, err := AnalyseContent(ctx, htmlData, session.Intake, RawDir(projectPath, session.SessionID), emit)
	if err != nil {
		return DimensionResult{}, err
	}
	return DimensionResult{Score: score}, nil
}

func runCompetitors(ctx context.Context, session *SessionFile, projectPath string, emit EmitFn) (DimensionResult, error) {
	emitAuditLog(emit, "INFO", "[competitors] Running Claude competitor gap analysis…")
	if err := EnsureRawDir(projectPath, session.SessionID); err != nil {
		return DimensionResult{}, err
	}
	if err := AnalyseCompetitors(ctx, session.Intake.Competitors, session.Intake, RawDir(projectPath, session.SessionID), emit); err != nil {
		return DimensionResult{}, err
	}
	return DimensionResult{Score: 0}, nil // score is null per spec
}

func runCodeQuality(ctx context.Context, session *SessionFile, projectPath string, emit EmitFn) (DimensionResult, error) {
	emitAuditLog(emit, "INFO", "[code_quality] Running Claude code quality analysis…")
	if session.Intake.LocalRepoPath == nil || *session.Intake.LocalRepoPath == "" {
		return DimensionResult{Score: 0}, nil
	}
	if err := EnsureRawDir(projectPath, session.SessionID); err != nil {
		return DimensionResult{}, err
	}
	score, err := AnalyseCode(ctx, *session.Intake.LocalRepoPath, session.Intake, RawDir(projectPath, session.SessionID), emit)
	if err != nil {
		return DimensionResult{}, err
	}
	return DimensionResult{Score: score}, nil
}


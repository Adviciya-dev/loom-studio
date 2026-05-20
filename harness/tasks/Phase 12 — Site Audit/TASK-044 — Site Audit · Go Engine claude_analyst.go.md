---
id: TASK-044
title: "Site Audit · Go Engine claude_analyst.go"
type: task
status: open
effort: High
priority: high
phase: 2
area: go-engine
---

## Goal

Implement `audit/claude_analyst.go` — invokes the Claude Code CLI for four distinct audit analyses: SEO on-page, content quality, competitor gap, and code quality. Each function produces a structured JSON file in `raw/`.

## File to create

`src-tauri/binaries/loom-engine/audit/claude_analyst.go`

## Claude invocation pattern

All Claude calls use the same shell pattern (existing harness convention):

```sh
claude --dangerously-skip-permissions \
  --output-format stream-json \
  --print "<PROMPT>" \
  [--cwd <working_dir>]
```

Stream output line by line. Each line is a JSON SSE event. Collect `assistant` role text content chunks and concatenate. When the stream ends, parse the accumulated text as JSON.

Helper function used by all four analysers:

```go
func invokeClaude(ctx context.Context, prompt, cwd string, emit EmitFn) (string, error)
```

- Spawns Claude with the above flags
- Streams `audit_log_line` events with `level: "info"` for each output chunk
- Returns concatenated text output
- On context cancel: `cmd.Process.Kill()`, return `ctx.Err()`
- On non-zero exit: return error with stderr content

---

## Functions to implement

### 1. `AnalyseSEO(ctx, htmlData HTMLData, intake AuditIntake, sessionRawPath string, emit EmitFn) error`

**Prompt:**
```
You are an SEO specialist analysing a web page.

Page data:
  URL: {htmlData.FinalURL}
  Title: {htmlData.Title}
  Meta description: {htmlData.MetaDescription}
  H1 tags: {htmlData.H1}
  H2 tags (first 5): {htmlData.H2}
  Canonical URL: {htmlData.CanonicalURL}
  Open Graph: {htmlData.OpenGraph}
  Target keywords: {intake.NicheKeywords}
  Industry: {intake.Industry}

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

Output ONLY valid JSON. No preamble, no explanation.
```

**Output:** writes `{sessionRawPath}/seo.json`

---

### 2. `AnalyseContent(ctx, htmlData HTMLData, intake AuditIntake, sessionRawPath string, emit EmitFn) error`

**Prompt:**
```
You are a content strategist auditing a website's content quality.

Site: {intake.SiteName} ({intake.SiteUrl})
Industry: {intake.Industry}
Target market: {intake.TargetMarket}
Target keywords: {intake.NicheKeywords}
Business goal: {intake.BusinessGoal}

Page HTML (truncated to 8000 chars):
{htmlData.RawHTML[:8000]}

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

Output ONLY valid JSON. No preamble.
```

**Output:** writes `{sessionRawPath}/content.json`

---

### 3. `AnalyseCompetitors(ctx, competitors []string, intake AuditIntake, sessionRawPath string, emit EmitFn) error`

Only called when `len(competitors) > 0`.

**Prompt:**
```
You are a competitive analyst comparing a client website against its competitors.

Client site: {intake.SiteUrl}
Industry: {intake.Industry}
Keywords: {intake.NicheKeywords}
Business goal: {intake.BusinessGoal}

Competitor URLs to analyse:
{competitors joined by newline}

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

Output ONLY valid JSON. No preamble.
```

**Output:** writes `{sessionRawPath}/competitors.json`

---

### 4. `AnalyseCode(ctx, localRepoPath string, intake AuditIntake, sessionRawPath string, emit EmitFn) error`

Only called when `localRepoPath != ""`.

**Claude invocation uses `--cwd {localRepoPath}`** so Claude can read the source files directly.

**Prompt:**
```
You are a senior software engineer auditing a client website's codebase.

Site: {intake.SiteName}
CMS/Stack: {intake.CMS}
Industry: {intake.Industry}
Business goal: {intake.BusinessGoal}

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

Output ONLY valid JSON. No preamble.
```

**Output:** writes `{sessionRawPath}/code_audit.json`

---

## JSON output parsing

After `invokeClaude` returns the accumulated text:
1. `strings.TrimSpace` the output
2. Strip markdown fences if present: `strings.TrimPrefix(s, "```json")`, `strings.TrimSuffix(s, "```")`
3. `json.Unmarshal` into the target struct
4. On error → return `fmt.Errorf("claude output was not valid JSON: %w", err)`

## Acceptance criteria

- [ ] `AnalyseSEO` writes a valid `seo.json` with `score` (int), `issues` array, all required fields
- [ ] `AnalyseContent` writes a valid `content.json` with `keywordCoverage.found` and `keywordCoverage.missing` populated
- [ ] `AnalyseCompetitors` writes `competitors.json` with one entry per competitor URL; `score` is `null`
- [ ] `AnalyseCode` uses `--cwd {localRepoPath}` so Claude reads actual source files
- [ ] All four functions respect context cancellation and kill Claude process immediately
- [ ] Markdown fences in Claude output are stripped before JSON parsing
- [ ] Each function emits `info` log lines: prompt sent, awaiting response, response received, file written
- [ ] On Claude crash or non-zero exit, return error with stderr content for runner to mark dimension as `error`

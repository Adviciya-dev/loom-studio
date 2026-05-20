---
id: TASK-042
title: "Site Audit · Go Engine html_fetcher.go"
type: task
status: open
effort: Medium
priority: high
phase: 2
area: go-engine
---

## Goal

Implement `audit/html_fetcher.go` — fetches the live site HTML and extracts SEO-relevant metadata for Claude to analyse, producing `seo.json`.

## File to create

`src-tauri/binaries/loom-engine/audit/html_fetcher.go`

## Exported functions

### `FetchHTML(ctx context.Context, siteUrl string) (HTMLData, error)`

Performs an HTTP GET with a 30s timeout and returns parsed HTML data.

**HTTP client config:**
```go
client := &http.Client{
    Timeout: 30 * time.Second,
    CheckRedirect: func(req *http.Request, via []*http.Request) error {
        if len(via) >= 10 {
            return fmt.Errorf("too many redirects")
        }
        return nil
    },
}
```

**Request headers to send:**
```
User-Agent: Mozilla/5.0 (compatible; LoomStudio/1.0; +https://loom.studio)
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8
Accept-Language: en-US,en;q=0.5
```

**Returns `HTMLData`:**
```go
type HTMLData struct {
    URL             string
    FinalURL        string   // after redirects
    StatusCode      int
    Title           string
    MetaDescription string
    MetaKeywords    string
    H1              []string
    H2              []string
    CanonicalURL    string
    OpenGraph       OGData
    RawHTML         string   // full HTML body for Claude
}

type OGData struct {
    Title       string
    Description string
    Image       string
    Type        string
}
```

**HTML parsing:** use `golang.org/x/net/html` or `github.com/PuerkitoBio/goquery` (whichever is already in go.mod). Extract:
- `<title>` text content
- `<meta name="description" content="...">` 
- `<meta name="keywords" content="...">`
- All `<h1>` text nodes (trim whitespace)
- First 5 `<h2>` text nodes
- `<link rel="canonical" href="...">`
- `<meta property="og:title/description/image/type" content="...">`

### `RunSEOAnalysis(ctx context.Context, htmlData HTMLData, intake AuditIntake, sessionRawPath string, emit EmitFn) error`

Passes the HTML data to Claude for SEO scoring. Calls `claude_analyst.go`'s `AnalyseSEO()`. Writes `seo.json` to `sessionRawPath`.

## Error handling (per PRD §6.8)

| Status | Error message set in dimension |
|---|---|
| 403 / 407 | "Site blocked automated access (403). Manual review required." |
| 429 | Retry once after 5s. If still 429: "Rate limited (429). Try again later." |
| 5xx | "Server error ({status}). The site may be down." |
| Timeout (> 30s) | "Request timed out after 30 s." |
| DNS / connection error | "Could not connect to {siteUrl}. Check the URL and try again." |

On error, return a typed `FetchError` so `runner.go` can set the dimension status to `error` with the exact message.

## `seo.json` output schema

Written by `RunSEOAnalysis` after Claude analysis:

```json
{
  "score": 72,
  "title": "Current page title",
  "metaDescription": "…",
  "h1": ["Primary heading"],
  "canonicalUrl": "https://example.com/",
  "openGraph": {
    "title": "OG title",
    "image": "https://…"
  },
  "issues": [
    { "severity": "high", "description": "Missing meta description" },
    { "severity": "medium", "description": "H1 tag missing target keyword" }
  ]
}
```

## Shared result for content dimension

`FetchHTML` result is shared with the content dimension. `runner.go` stores the `HTMLData` in a shared struct protected by a `sync.Once` and `sync.Mutex`. The content dimension waits on the once flag before calling Claude with the HTML.

## Acceptance criteria

- [ ] HTTP request uses 30s timeout; returns `FetchError` with correct message on timeout
- [ ] 403/429/5xx return typed errors with the exact PRD message strings
- [ ] 429 is retried exactly once after 5s before returning error
- [ ] Redirect chain is followed (up to 10 hops); `FinalURL` reflects the last URL
- [ ] `h1` array contains all `<h1>` text nodes from the page
- [ ] `h2` array contains up to the first 5 `<h2>` text nodes
- [ ] Context cancellation aborts the HTTP request immediately
- [ ] `FetchHTML` result is accessible to `content` dimension via shared struct in runner

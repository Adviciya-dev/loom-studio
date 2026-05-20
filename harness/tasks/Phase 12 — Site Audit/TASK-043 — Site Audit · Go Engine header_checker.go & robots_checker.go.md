---
id: TASK-043
title: "Site Audit · Go Engine header_checker.go & robots_checker.go"
type: task
status: open
effort: Medium
priority: high
phase: 2
area: go-engine
---

## Goal

Implement `audit/header_checker.go` and `audit/robots_checker.go` — together these produce `technical.json` (redirects, robots.txt, sitemap, HTTP version) and `security.json` (HTTP security headers).

## Files to create

- `src-tauri/binaries/loom-engine/audit/header_checker.go`
- `src-tauri/binaries/loom-engine/audit/robots_checker.go`

---

## header_checker.go

### `RunHeaderChecks(ctx context.Context, siteUrl, sessionRawPath string, emit EmitFn) error`

Makes an HTTP HEAD request (or GET if HEAD fails) to `siteUrl` and inspects the response headers and redirect chain.

**Collects:**
- **Redirect chain:** list of URLs visited from initial URL to final URL
- **HTTP version:** parse `proto` from Go's `http.Response` (e.g. `"HTTP/2.0"` → `"HTTP/2"`)
- **Security headers** (presence = true/false):
  - `Strict-Transport-Security`
  - `Content-Security-Policy`
  - `X-Frame-Options`
  - `X-Content-Type-Options`
  - `Referrer-Policy`

**Writes `security.json`:**
```json
{
  "score": 55,
  "headers": {
    "strictTransportSecurity": true,
    "contentSecurityPolicy": false,
    "xFrameOptions": true,
    "xContentTypeOptions": true,
    "referrerPolicy": false
  },
  "issues": [
    { "severity": "high", "description": "Content-Security-Policy header missing" },
    { "severity": "medium", "description": "Referrer-Policy header missing" }
  ]
}
```

**Score calculation:**
- Each present header = +20 points (5 headers × 20 = 100 max)
- Missing `Content-Security-Policy` → severity `high`
- Missing `Strict-Transport-Security` → severity `high`
- Missing `X-Frame-Options` → severity `medium`
- Missing `X-Content-Type-Options` → severity `medium`
- Missing `Referrer-Policy` → severity `low`

**Writes partial `technical.json`** with redirect chain and HTTP version (merged by `robots_checker.go`):
```go
type TechnicalPartial struct {
    RedirectChain []string `json:"redirectChain"`
    HTTPVersion   string   `json:"httpVersion"`
}
```

---

## robots_checker.go

### `RunRobotsChecks(ctx context.Context, siteUrl, sessionRawPath string, emit EmitFn) error`

Fetches `{siteUrl}/robots.txt` and the sitemap URL(s) referenced within it.

**robots.txt parsing:**
- `robotsTxt.found` = true if HTTP 200 returned
- `robotsTxt.disallowedPaths` = array of `Disallow:` directives for `User-agent: *`

**sitemap.xml:**
- Parse `Sitemap:` directives from robots.txt
- If none, try `{siteUrl}/sitemap.xml` and `{siteUrl}/sitemap_index.xml`
- `sitemapXml.found` = true if any sitemap URL returns HTTP 200
- `sitemapXml.urlCount` = count of `<url>` or `<sitemap>` elements in the first resolved sitemap

**Writes final `technical.json`** by merging the header_checker partial with robots data:
```json
{
  "score": 65,
  "redirectChain": ["http://example.com", "https://example.com"],
  "robotsTxt": {
    "found": true,
    "disallowedPaths": ["/admin", "/wp-login"]
  },
  "sitemapXml": {
    "found": true,
    "urlCount": 142
  },
  "httpVersion": "HTTP/2",
  "issues": [
    { "severity": "high", "description": "Site redirects from HTTP to HTTPS (good), but chain has 2 hops" }
  ]
}
```

**Technical score calculation:**
- Start at 100
- `-20` if robots.txt not found
- `-20` if sitemap not found
- `-10` per redirect hop beyond 1 (capped at -30)
- `-10` if HTTP/1.1 (not HTTP/2 or HTTP/3)
- Clamp to [0, 100]

## Sequencing in runner.go

`header_checker.go` and `robots_checker.go` run as a **single dimension** (`technical`) from the runner's perspective. Internally they can run concurrently (two goroutines sharing the same dimension slot), merging results before writing `technical.json`.

## Error handling

Same HTTP error table as `html_fetcher.go` (§6.8). On robots.txt fetch failure (non-4xx/5xx) → `robotsTxt.found = false`. On sitemap fetch failure → `sitemapXml.found = false`. Neither is a fatal dimension error.

## Acceptance criteria

- [ ] `security.json` contains all 5 header fields as boolean values
- [ ] Security score = sum of present headers × 20 (0–100)
- [ ] `technical.json` contains `redirectChain`, `robotsTxt`, `sitemapXml`, `httpVersion`, `issues`, `score`
- [ ] `redirectChain` lists every URL in the redirect sequence (including the final URL)
- [ ] Sitemap URL count is parsed from the first resolved sitemap
- [ ] Both files are written atomically (write `.tmp` then rename)
- [ ] Context cancellation aborts all in-flight HTTP requests
- [ ] Robots.txt not found (404) sets `found: false` without marking dimension error

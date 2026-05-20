---
id: TASK-041
title: "Site Audit · Go Engine lighthouse.go"
type: task
status: open
effort: Medium
priority: high
phase: 2
area: go-engine
---

## Goal

Implement `audit/lighthouse.go` — wraps the Lighthouse CLI to produce `performance.json` and `accessibility.json` for the audit session.

## File to create

`src-tauri/binaries/loom-engine/audit/lighthouse.go`

## Exported functions

### `RunLighthouse(ctx context.Context, siteUrl, sessionRawPath string, emit EmitFn) error`

Runs Lighthouse once for both performance and accessibility categories.

**Command:**
```sh
lighthouse <siteUrl> \
  --output json \
  --output-path stdout \
  --only-categories=performance,accessibility \
  --chrome-flags="--headless --no-sandbox" \
  --quiet
```

**Steps:**
1. Emit log: `info "Running Lighthouse for <siteUrl>"`
2. Spawn command with `exec.CommandContext(ctx, "lighthouse", args...)`
3. Capture combined stdout (JSON) into a buffer
4. On `ctx.Done()` — call `cmd.Process.Kill()` and return `ctx.Err()`
5. Parse the raw Lighthouse JSON output
6. Extract performance data → write `performance.json`
7. Extract accessibility data → write `accessibility.json`

## Output schemas

### `performance.json`

```json
{
  "score": 0.82,
  "metrics": {
    "fcp": 1800,
    "lcp": 2500,
    "tbt": 120,
    "cls": 0.05,
    "si": 2200,
    "tti": 3100
  },
  "opportunities": [
    { "id": "render-blocking-resources", "title": "Eliminate render-blocking resources", "savings_ms": 450 }
  ]
}
```

**Lighthouse JSON paths:**
- `score` → `categories.performance.score` (0–1 float)
- `fcp` → `audits.first-contentful-paint.numericValue` (ms)
- `lcp` → `audits.largest-contentful-paint.numericValue`
- `tbt` → `audits.total-blocking-time.numericValue`
- `cls` → `audits.cumulative-layout-shift.numericValue`
- `si` → `audits.speed-index.numericValue`
- `tti` → `audits.interactive.numericValue`
- `opportunities` → `audits` where `details.type == "opportunity"`, pick `id`, `title`, `details.overallSavingsMs`

### `accessibility.json`

```json
{
  "score": 0.91,
  "audits": [
    { "id": "color-contrast", "title": "Background and foreground colors do not have a sufficient contrast ratio", "description": "…" }
  ]
}
```

**Lighthouse JSON paths:**
- `score` → `categories.accessibility.score`
- `audits` → failing a11y audits only: `categories.accessibility.auditRefs` where the referenced audit has `score < 1` and `scoreDisplayMode != "notApplicable"`, map to `{ id, title, description }`

## File write

Both files written to `{sessionRawPath}/performance.json` and `{sessionRawPath}/accessibility.json`.

## Error handling

| Scenario | Behaviour |
|---|---|
| `lighthouse` binary not found | Caller (runner.go) already skips; this function should never be called |
| Non-zero exit code from Lighthouse | Return wrapped error; runner marks dimension `error` |
| Stdout is empty or not valid JSON | Return error "Lighthouse produced no output" |
| Context cancelled mid-run | Kill process, return `ctx.Err()` |
| Timeout > 120s | Use `context.WithTimeout(ctx, 120*time.Second)` |

## Acceptance criteria

- [ ] A single Lighthouse invocation produces both `performance.json` and `accessibility.json`
- [ ] `performance.score` is the raw 0–1 float from Lighthouse
- [ ] `opportunities` array contains only items with `details.type == "opportunity"` and a positive `savings_ms`
- [ ] `accessibility.audits` contains only failing audits (score < 1, not notApplicable)
- [ ] Context cancellation kills the Lighthouse process within 1s
- [ ] Files are written atomically (write to `.tmp` then rename)
- [ ] Emit `info` log lines: start, completion, file paths written

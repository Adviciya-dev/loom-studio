---
id: TASK-040
title: "Site Audit · Go Engine runner.go (Orchestrator)"
type: task
status: open
effort: High
priority: high
phase: 2
area: go-engine
---

## Goal

Implement `audit/runner.go` — the central orchestrator for Phase 2 audit execution. It manages the worker pool, coordinates all 8 dimension goroutines, handles cancellation, and runs prerequisite checks.

## File to create

`src-tauri/binaries/loom-engine/audit/runner.go`

## Responsibilities

### 1. Entry point — `RunAudit(ctx, payload, emit)`

Called from `main.go` when `action == "audit_start"`.

**Payload shape (from stdin):**
```json
{
  "action": "audit_start",
  "projectPath": "/path/to/project",
  "sessionId": "uuid-v4"
}
```

Steps:
1. Load `intake.json` via `store.go`
2. Run prerequisite checks (see §3)
3. Create a cancellable context: `ctx, cancel := context.WithCancel(parentCtx)`
4. Register the cancel func keyed by `sessionId` for the cancel command
5. Spin up a worker pool of **max 3** goroutines using a buffered semaphore channel
6. Dispatch dimensions based on intake data (see §4)
7. Wait for all goroutines to finish (`sync.WaitGroup`)
8. If not cancelled → emit `audit_completed { sessionId }`
9. If cancelled → emit `audit_cancelled { sessionId }`

### 2. Cancel handler — `CancelAudit(sessionId)`

Called from `main.go` when `action == "audit_cancel"`.
- Looks up the cancel func registered in §1 step 4
- Calls `cancel()` — this propagates to all worker goroutines via the context
- Each worker must respect `ctx.Done()` and call `cmd.Process.Kill()` before exiting

### 3. Prerequisite checks

Run once at the start of `RunAudit` before launching any workers:

| Tool | Check command | On failure |
|---|---|---|
| `lighthouse` | `exec.LookPath("lighthouse")` | Mark `performance` + `accessibility` as `skipped`; emit `audit_log_line` warn "Lighthouse not found — run `npm i -g lighthouse`" |
| `claude` | `exec.LookPath("claude")` | Mark SEO, content, competitors, code_audit as `skipped`; emit alert banner log line |
| `git` | `exec.LookPath("git")` | Emit warn log; code_audit dimension skips git-based steps only (dimension still runs) |

Emit each check result as `audit_log_line` at level `warn` before the first dimension begins.

### 4. Dimension dispatch

Based on intake data, determine which dimensions to run vs skip:

| Dimension key | Run condition | Skip condition |
|---|---|---|
| `performance` | lighthouse present | lighthouse missing |
| `seo` | claude present | claude missing |
| `accessibility` | lighthouse present | lighthouse missing |
| `technical` | always | — |
| `code_quality` | `localRepoPath != ""` AND claude present | no local repo OR claude missing |
| `content` | claude present | claude missing |
| `competitors` | `len(competitors) > 0` AND claude present | no competitor URLs OR claude missing |
| `security` | always | — |

For each **skipped** dimension, immediately emit:
```json
{ "event": "audit_dimension_status", "key": "performance", "label": "Performance", "status": "skipped", "score": null, "errorMessage": null }
```

For each **active** dimension, emit `status: "pending"` immediately, then dispatch to the worker pool.

### 5. Worker pool pattern

```go
sem := make(chan struct{}, 3) // max 3 concurrent

for _, dim := range activeDimensions {
    wg.Add(1)
    go func(d Dimension) {
        defer wg.Done()
        sem <- struct{}{}
        defer func() { <-sem }()

        emitStatus(d.key, "running", nil, nil)
        result, err := d.run(ctx, intake, sessionPath)
        if err != nil {
            emitStatus(d.key, "error", nil, err.Error())
        } else {
            emitStatus(d.key, "done", &result.score, nil)
        }
    }(dim)
}
wg.Wait()
```

### 6. `audit_dimension_status` event shape

```json
{
  "event": "audit_dimension_status",
  "key": "performance",
  "label": "Performance",
  "status": "pending | running | done | error | skipped",
  "score": 82,
  "errorMessage": null
}
```

`score` is populated as soon as a dimension reaches `done` — not withheld until all finish.

### 7. Content dimension sequencing (internal dependency)

`content` analysis requires the HTML fetch to be complete. Handle this internally:
- `contentDimension.run()` waits for the HTML fetcher result (pass via channel or shared struct with mutex)
- This dependency is **not** exposed as a separate UI row

### 8. Log emission helper

```go
func emitLog(emit EmitFn, level, content string) {
    emit("audit_log_line", map[string]any{
        "timestamp": time.Now().Format(time.RFC3339),
        "level":     level,
        "content":   content,
    })
}
```

## Acceptance criteria

- [ ] Worker pool never exceeds 3 concurrent goroutines
- [ ] `audit_completed` fires only after all non-skipped dimensions finish (done or error)
- [ ] `audit_cancelled` fires within 2s of the cancel command arriving
- [ ] All child processes (Lighthouse, Claude) are killed via `cmd.Process.Kill()` on cancel — no orphaned processes
- [ ] Skipped dimensions emit `status: "skipped"` before worker pool starts
- [ ] Prerequisite checks emit `warn` log lines before any dimension runs
- [ ] `audit_dimension_status` events are emitted: `pending` at dispatch, `running` when worker starts, `done`/`error` at finish
- [ ] Score is included in the `done` event payload

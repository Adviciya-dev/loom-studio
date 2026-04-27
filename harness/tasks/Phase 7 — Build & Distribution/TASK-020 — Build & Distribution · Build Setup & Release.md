# TASK-020: Build & Distribution · Build Setup & Release

## Meta
| Field | Value |
|-------|-------|
| **Assignee** | — |
| **Status** | 📋 To Do |
| **Priority** | P1 |
| **Sprint** | Sprint 4 |
| **Story Points** | 5 |
| **PRD Reference** | prd.md §8 |
| **Architecture Ref** | architecture.md §9 |
| **Start Date** | — |
| **Due Date** | — |
| **Created** | 2026-04-20 |
| **Completed** | — |

---

## Description
Configure the production build pipeline for all three target platforms (macOS, Linux, Windows). Bundle the Go engine binary as a Tauri sidecar, sign the macOS build with a Developer ID, produce installer artifacts for each platform, and verify a clean install works on a machine with no development tools installed.

---

## Sub Tasks
- [ ] Compile Go engine for all platform targets: `darwin/arm64`, `darwin/amd64`, `linux/amd64`, `windows/amd64`
- [ ] Name binaries per Tauri sidecar convention: `loom-engine-aarch64-apple-darwin`, `loom-engine-x86_64-apple-darwin`, `loom-engine-x86_64-unknown-linux-gnu`, `loom-engine-x86_64-pc-windows-msvc.exe`
- [ ] Place compiled binaries in `src-tauri/binaries/`
- [ ] Configure `tauri.conf.json` `bundle.externalBin` to reference all engine binary names
- [ ] Run `pnpm tauri build` and verify it produces: `Loom.app` + `.dmg` (macOS), `.AppImage` + `.deb` (Linux), `.exe` installer (Windows)
- [ ] Sign macOS app bundle with Developer ID (code signing + notarization)
- [ ] Add `build-engine.sh` script: cross-compile all targets, output to `src-tauri/binaries/`
- [ ] Add `release.sh` script: build engine → run `tauri build` → output artifacts to `dist/`
- [ ] Write `harness/docs/env-setup.md`: contributor setup guide (prerequisites, build steps, dev run)
- [ ] Clean install test: install on a fresh macOS machine (no Homebrew, Xcode, or dev tools) — app must launch and all core flows must work
- [ ] Tag `v1.0.0` in Git after successful clean install test

---

## Acceptance Criteria
- [ ] `pnpm tauri build` succeeds on macOS, Linux, and Windows CI
- [ ] macOS `.dmg` installs and launches `Loom.app` correctly
- [ ] Linux `.AppImage` runs without additional dependencies
- [ ] Windows `.exe` installer completes and app launches
- [ ] Go engine binary is bundled and launches as sidecar in all three installers
- [ ] macOS app is signed and passes Gatekeeper check
- [ ] Clean install test passes — all MVP flows work end-to-end
- [ ] `harness/docs/env-setup.md` exists and is accurate
- [ ] `v1.0.0` tag created on main after release

---

## Technical Notes
- Cross-compilation of Go for Windows from macOS/Linux requires `GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build`.
- Tauri code signing for macOS: configure `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` in CI environment.
- The clean install test is the exit criterion for the entire Phase 1 MVP — do not tag until this passes.

---

## Files to Create/Modify
```
CREATE:
scripts/build-engine.sh
scripts/release.sh
harness/docs/env-setup.md
src-tauri/binaries/.gitkeep

MODIFY:
src-tauri/tauri.conf.json
.github/workflows/build.yml (if CI is set up)
```

---

## API Endpoints
N/A — no API endpoints in this task

---

## UI Screens
- **—**

---

## Related Test Cases
—

## Dependencies
- **Blocked by:** TASK-019
- **Blocks:** Nothing — this is the final task for Phase 1 MVP

---

## Claude Code Context
```
harness/claude.md
harness/tasks/Phase 7 — Build & Distribution/TASK-020 — Build & Distribution · Build Setup & Release.md
harness/architecture.md §9
harness/prd.md §8
```

---

## Progress Log
| Date | Update |
|------|--------|
| — | No updates yet |

---

## Time Log
| Date | Hours | Note |
|------|-------|------|
| — | — | No time logged |

---

## Review Notes
- **—**

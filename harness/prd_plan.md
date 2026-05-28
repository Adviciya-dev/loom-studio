# Loom Studio — AI-Driven Development Pipeline Plan

## Vision

Transform Loom Studio from a task execution tool into a full AI-driven SDLC pipeline. 
The goal is to plan, architect, and execute software development end-to-end — from a product idea to deployed, 
QA-approved code — using structured documents and parallel AI agents.

---

## Pipeline Overview

```
PRD.md
  ↓
architecture.md
  ↓
modules/
  product-listing.md       ← detailed module spec (human-reviewed)
  user-auth.md
  order-management.md
  ↓
lld/
  product-listing/
    db.md                  ← generated from module spec
    backend.md
    frontend.md
    dashboard.md           ← only if required
  ↓
tasks/
  TASK-001.md              ← generated from LLD files
  TASK-002.md
  ...
  ↓
pipeline.json              ← auto-generated orchestration manifest
```

---

## Folder Structure

```
harness/
  prd.md                   ← product requirements (user written)
  architecture.md          ← system architecture (user written)
  pipeline.json            ← auto-generated, never hand-edited
  modules/
    product-listing.md
    user-auth.md
  lld/
    product-listing/
      db.md
      backend.md
      frontend.md
      dashboard.md
  tasks/
    product-listing/
      TASK-001.md
      TASK-002.md
```

---

## Stage 1 — PRD (`prd.md`)

User writes the product requirements document. This is the starting point for everything.

**Contains:**
- Product goals and scope
- Target users
- Key features and non-features
- Success metrics

---

## Stage 2 — Architecture (`architecture.md`)

User writes or Claude generates the high-level system architecture based on PRD.

**Contains:**
- Tech stack decisions (frontend, backend, DB, infra)
- System components and how they interact
- Auth strategy
- Deployment model
- Key constraints and non-negotiables

---

## Stage 3 — Module Files (`modules/<module-name>.md`)

Claude reads PRD + architecture and generates one `.md` file per feature module. These are the **human-reviewed source of truth** for each feature.

### Module File Structure

```markdown
## Overview
Brief description of this module's purpose and scope.

## Database
- Tables, columns, data types, relationships
- Indexes required
- Any migrations

## Backend API
- Endpoints (method, path, auth requirement)
- Business logic rules
- Error cases to handle

## Frontend
- Pages and routes
- Components and their responsibilities
- State management approach

## Dashboard (if required)
- Admin views needed
- Permissions model

## Third-Party Integrations (if required)
- External services and why they are needed
- API keys or credentials required

## Acceptance Criteria
- Criteria 1: ...
- Criteria 2: ...
- Criteria 3: ...
```

**Key rule:** The criteria section directly becomes the acceptance criteria for generated tasks — no duplication needed.

---

## Stage 4 — LLD Files (`lld/<module-name>/<layer>.md`)

Claude reads each module file and generates separate LLD documents per layer. These are **precise implementation contracts** for the AI agent executing the task.

### `lld/<module>/db.md`
```markdown
## Schema
Exact table definitions with column types, nullable, defaults, foreign keys.

## Migrations
Ordered migration files with filenames.

## Indexes
Which indexes, on which columns, and why.

## Seed Data (if required)
Any initial data needed.
```

### `lld/<module>/backend.md`
```markdown
## Endpoints
- METHOD /path — description, auth, request body, response shape

## Business Logic
Step-by-step logic for each endpoint.

## Error Handling
Which errors to return and under what conditions.

## Dependencies
Other modules or services this layer depends on.
```

### `lld/<module>/frontend.md`
```markdown
## Routes
- /path → ComponentName

## Components
Component tree with props and responsibilities.

## State
State shape, what triggers updates.

## API Integration
Which endpoints this layer calls and when.
```

### `lld/<module>/dashboard.md` (if required)
```markdown
## Views
Admin pages and their purpose.

## Permissions
Who can see or modify what.

## Components
Dashboard-specific component tree.
```

---

## Stage 5 — Task Generation (`tasks/TASK-XXX.md`)

Claude reads each LLD file and generates granular `TASK-XXX.md` files using the existing task format. Each task maps to one focused unit of work within a layer.

**Task types generated:**
- `db` — schema, migrations, seed data
- `backend` — API endpoints, business logic
- `frontend` — pages, components, state
- `dashboard` — admin views
- `unit-test` — unit tests for backend logic
- `e2e-test` — end-to-end test scenarios
- `ui-polish` — responsive, accessibility, visual fixes

---

## Stage 6 — Execution Order

The Go engine reads `pipeline.json` and executes tasks in this dependency order:

```
db  →  backend  →  frontend   →  unit-test  →  e2e-test  →  ui-polish  →  qa
                ↘  dashboard  ↗
```

- `db` must complete before `backend`
- `backend` must complete before `frontend` and `dashboard`
- `frontend` and `dashboard` can run in parallel
- All dev layers must complete before test phases begin
- QA is the final gate

---

## Stage 7 — QA Gate

After all tests pass and UI polish is complete, the module enters QA review.

QA checks:
- All acceptance criteria from the module file are met
- No regressions in existing modules
- UI matches design intent
- Errors handled gracefully

QA outcome: **Approved** → merge to main, or **Rejected** → create targeted fix tasks.

---

## `pipeline.json` Schema (Auto-Generated)

This file is always generated by Claude, never written by hand. It is the orchestration manifest the Go engine reads.

```json
{
  "version": "1.0",
  "modules": [
    {
      "id": "user-auth",
      "module_file": "modules/user-auth.md",
      "depends_on": [],
      "status": "pending"
    },
    {
      "id": "product-listing",
      "module_file": "modules/product-listing.md",
      "depends_on": ["user-auth"],
      "status": "pending"
    },
    {
      "id": "order-management",
      "module_file": "modules/order-management.md",
      "depends_on": ["product-listing", "user-auth"],
      "status": "pending"
    }
  ],
  "phases": ["db", "backend", "frontend", "dashboard", "unit-test", "e2e-test", "ui-polish", "qa"],
  "phase_dependencies": {
    "backend": ["db"],
    "frontend": ["backend"],
    "dashboard": ["backend"],
    "unit-test": ["frontend", "dashboard"],
    "e2e-test": ["unit-test"],
    "ui-polish": ["e2e-test"],
    "qa": ["ui-polish"]
  },
  "status": "planning"
}
```

---

## Rules

1. **Humans write PRD and architecture.** Claude generates everything downstream.
2. **Module files are human-reviewed before LLD generation.** This is the critical checkpoint.
3. **LLD files are reviewed before task generation.** Vague LLD = vague tasks = bad code.
4. **`pipeline.json` is never hand-edited.** It is always regenerated from module files.
5. **Tasks only start when their phase dependencies are complete.** No skipping the order.
6. **QA is a hard gate.** Nothing merges without QA approval.

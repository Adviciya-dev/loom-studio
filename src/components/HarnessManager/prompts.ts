export const PRD_PROMPT = (projectName: string) =>
  `Generate a comprehensive PRD (Product Requirements Document) for the project "${projectName}" and save it as \`harness/prd.md\`.

The PRD should include:
- Project overview and vision
- Problem statement
- Goals and non-goals
- User personas and use cases
- Functional requirements (prioritized P0/P1/P2)
- Non-functional requirements (performance, security, scalability)
- Success metrics and KPIs

Follow the format used in professional product teams. Write the full file content and create it using the write tool.`

export const ARCHITECTURE_PROMPT = (projectName: string) =>
  `You are helping design the system architecture for "${projectName}".

### Step 1 — Read context
Read \`harness/prd.md\` in full before doing anything else. Understand the product goals, features, target users, and success metrics.

### Step 2 — Ask questions one by one
Based on what you read in the PRD, ask the human ONE question at a time to fill in architectural decisions that cannot be inferred from the PRD alone.

Cover these areas in order, but skip any that the PRD already answers clearly:
1. **Tech stack** — frontend framework, backend language/framework, database
2. **Infrastructure** — where will this be hosted? (cloud provider, self-hosted, serverless, etc.)
3. **Auth strategy** — how will users authenticate? (JWT, sessions, OAuth, SSO, etc.) what roles exist?
4. **Deployment model** — how many environments? CI/CD pipeline? containerised or bare metal?
5. **Key constraints** — any hard rules the architecture must follow? (e.g. GDPR, no third-party auth, must use existing infra)
6. **Module boundaries** — confirm the feature modules implied by the PRD, ask if any should be merged, split, or excluded

Ask each question clearly, one at a time. Wait for the answer before asking the next. If the human says "you decide" or "up to you" for a question, make a reasonable choice based on the PRD context and state what you chose and why before moving on.

### Step 3 — Confirm before generating
Once all questions are answered, summarise the decisions in a short list and ask: "Ready to generate the architecture document with these decisions?"

### Step 4 — Generate and save \`harness/architecture.md\`
Only after confirmation, write the full document using this exact structure:

\`\`\`markdown
# Architecture: <Project Name>

## System Overview
One paragraph: what the system does, who uses it, and the high-level approach.

## High-Level Architecture
ASCII diagram showing all major components and how they connect (client, server, DB, external services, queues, etc.).

\`\`\`
[ASCII diagram here]
\`\`\`

## Tech Stack
| Layer | Technology | Reasoning |
|-------|-----------|-----------|
| Frontend | ... | why chosen |
| Backend | ... | why chosen |
| Database | ... | why chosen |
| Infrastructure | ... | why chosen |
| Auth | ... | why chosen |

## System Components
For each major component/service:

### <Component Name>
- **Responsibility:** what this component owns
- **Exposes:** APIs, events, or interfaces it provides to other components
- **Depends on:** other components it calls or reads from
- **Technology:** specific stack used

## Auth Strategy
- Authentication method
- Token storage and refresh approach
- Role and permission model (list roles and what each can do)
- Protected vs. public routes/endpoints

## Data Flow
Step-by-step description of the primary data flows. Use numbered steps:
1. Client sends X to Y
2. Y validates and calls Z
3. ...

## Database Schema Overview
For each major table or collection:
- **Table name** — purpose, key columns, relationships

## Module Breakdown
List every feature module that will need to be built. This list feeds directly into module file generation.

| Module | Description | Depends On |
|--------|-------------|------------|
| user-auth | ... | — |
| ... | ... | ... |

## Deployment Model
- Hosting environment
- Environments (local, staging, production)
- CI/CD approach
- Environment variables required (names only, no values)

## Key Constraints & Non-Negotiables
- Constraint 1: exact rule that must not be violated
- Constraint 2: ...

## Open Questions
- Any architectural decisions not yet finalised that downstream work depends on
\`\`\`

### Rules
- Every section is required. Write "TBD — <reason>" if something is not yet decided, never omit a section.
- The Module Breakdown table is critical — it is the direct input to module file generation.
- Tech stack choices must include reasoning.
- Constraints must be specific and enforceable.

Start now by reading \`harness/prd.md\`, then ask your first question.`

export const FEATURE_PROMPT = (projectName: string) =>
  `You are creating module spec files for "${projectName}". These are the human-reviewed source of truth that feed into LLD generation and task creation — keep them at the right level of detail: clear enough for a developer to understand scope, not so granular that they replace the LLD.

### Step 1 — Read context
Read both \`harness/prd.md\` and \`harness/architecture.md\` in full before doing anything. If either is missing, say so and stop.

### Step 2 — Extract and confirm the module list
From the two documents, identify every distinct feature module. Each top-level user-facing feature and major backend service becomes its own module file.

Present the list to the human in this format and ask for confirmation:

---
**Modules identified from PRD + architecture:**

| # | Module | Description | Depends On |
|---|--------|-------------|------------|
| 1 | user-auth | ... | — |
| 2 | ... | ... | ... |

Do you want to add, remove, rename, or split any modules before I proceed? Reply "looks good" to continue, or tell me the changes.
---

Wait for confirmation before moving on.

### Step 3 — Ask scoping questions one by one
Once the module list is confirmed, go through each module and ask ONE question at a time to clarify anything that cannot be determined from the PRD or architecture. Focus on:
- **Dashboard** — does this module need an admin/dashboard view?
- **Third-party** — does this module require any external services or APIs?
- **Auth scope** — which roles can access this module and what can each role do?
- **Edge cases** — any known constraints or tricky scenarios specific to this module?

Only ask about things that are genuinely ambiguous — skip anything already answered in the docs. If the human says "you decide", make a reasonable choice, state it, and move on.

### Step 4 — Confirm before generating
Summarise what will be generated:
- List of module files with their \`depends_on\` relationships
- Which modules include a Dashboard section
- Which modules include a Third-Party Integrations section

Ask: "Ready to generate all module files?"

### Step 5 — Generate and save all module files
Only after confirmation, create \`harness/modules/\` and write one file per module at \`harness/modules/<module-name>.md\` (kebab-case).

Each file must follow this exact structure:

\`\`\`markdown
# Module: <Module Name>

## Overview
2–3 sentences: what this module does, who uses it, and why it exists. Include which roles interact with it.

## Dependencies
- **Requires:** list modules that must exist before this one can be built (or "none")
- **Blocks:** list modules that cannot start until this one is done (or "none")

## Database
List every table this module owns or modifies:
- **<table_name>** — purpose, key columns (name, type, nullable, default), relationships and cascade rules, indexes required, any migrations needed

## Backend API
For each endpoint:
- **METHOD /path** — one-line description, auth role required
  - Business logic rules (exact conditions and outcomes, no vague language)
  - Error cases to handle (status code + condition)

## Frontend
- **Pages/routes** — list each page and its route path
- **Components** — name and single-line responsibility for each
- **State management** — what state this module owns, what triggers updates

## Dashboard (if required)
- Admin views needed and their purpose
- Permissions model — who sees what, who can do what

## Third-Party Integrations (if required)
- Service name — why it's needed, which operations use it
- Credentials/API keys required (name only, no values)

## Acceptance Criteria
Each criterion must be specific and independently testable. These directly become the QA checklist — write them precisely.
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3
\`\`\`

### Rules
- Save to \`harness/modules/\` — never \`harness/features/\` or any other folder.
- Module files are intentionally higher level than LLD — do not include exact JSON schemas, component props, or file paths. That detail belongs in the LLD stage.
- The Acceptance Criteria section is the single source of truth for QA — no duplication across downstream documents.
- Every constraint must be specific: "Only admins can delete" not "handle permissions appropriately".
- Use the tech stack from \`harness/architecture.md\` as context — do not invent or assume technologies.

Start now by reading \`harness/prd.md\` and \`harness/architecture.md\`, then present the module list.`

export const LLD_PROMPT = (projectName: string) =>
  `You are generating Low-Level Design (LLD) files for "${projectName}". LLD files are precise implementation contracts — detailed enough that an AI agent can execute the task without asking questions.

### Step 1 — Read context
Read \`harness/architecture.md\` for the tech stack and conventions. Then list all available module files in \`harness/modules/\` so the human can pick which module to work on.

Present the list:

---
**Available modules:**

| # | Module | File |
|---|--------|------|
| 1 | user-auth | harness/modules/user-auth.md |
| 2 | ... | ... |

Which module would you like to generate LLD files for? (Reply with the name or number)
---

Wait for the human to pick a module before continuing.

### Step 2 — Read the selected module file
Read \`harness/modules/<selected-module>.md\` in full. Extract:
- Which layers are needed (db, backend, frontend, dashboard)
- Whether a dashboard section exists in the module file
- Any third-party integrations mentioned

### Step 3 — Ask which layers to generate
Present the layers applicable to this module and ask the human to confirm:

---
**Layers for <module-name>:**

| # | Layer | File |
|---|-------|------|
| 1 | Database | harness/lld/<module>/db.md |
| 2 | Backend | harness/lld/<module>/backend.md |
| 3 | Frontend | harness/lld/<module>/frontend.md |
| 4 | Dashboard | harness/lld/<module>/dashboard.md *(only if module has dashboard)* |

Generate all layers, or specific ones? Reply with numbers or "all".
---

Wait for the human's selection.

### Step 4 — Ask clarifying questions one by one
For each selected layer, ask ONE question at a time about anything that cannot be determined from the module file or architecture doc. Focus on:
- **DB layer** — any soft-delete requirements? audit logging? specific index strategy?
- **Backend layer** — pagination strategy? rate limiting? caching requirements?
- **Frontend layer** — any specific component library constraints? loading/skeleton patterns?
- **Dashboard layer** — which admin roles exist? any bulk actions needed?

Skip questions that are already answered in the module file. If the human says "you decide", make a reasonable choice based on the architecture doc, state it, and move on.

### Step 5 — Confirm before generating
List what will be created:
- \`harness/lld/<module>/db.md\`
- \`harness/lld/<module>/backend.md\`
- \`harness/lld/<module>/frontend.md\`
- \`harness/lld/<module>/dashboard.md\` (if applicable)

Ask: "Ready to generate LLD files for <module-name>?"

### Step 6 — Generate and save all selected LLD files
Only after confirmation, create \`harness/lld/<module-name>/\` and write each selected layer file.

---

#### \`harness/lld/<module>/db.md\`
\`\`\`markdown
# LLD — <Module Name>: Database

## Schema
Exact table definitions. For each table:
\`\`\`sql
CREATE TABLE table_name (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  column_name VARCHAR(255) NOT NULL,
  status      VARCHAR(20)  NOT NULL DEFAULT 'active',
  user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
\`\`\`

## Migrations
Ordered list of migration files:
1. \`YYYYMMDD_create_<table>.sql\` — what it does
2. \`YYYYMMDD_add_<column>_to_<table>.sql\` — what it does

## Indexes
| Index Name | Table | Columns | Type | Reason |
|------------|-------|---------|------|--------|
| idx_... | table | column | BTREE | why this index is needed |

## Seed Data (if required)
Any initial rows needed for the app to function.
\`\`\`

---

#### \`harness/lld/<module>/backend.md\`
\`\`\`markdown
# LLD — <Module Name>: Backend

## Endpoints
For each endpoint:

### METHOD /api/v1/<resource>
- **Auth:** role required (or public)
- **Request body:**
\`\`\`json
{ "field": "type — constraints" }
\`\`\`
- **Response 200/201:**
\`\`\`json
{ "id": "uuid", "field": "string" }
\`\`\`

## Business Logic
Step-by-step logic for each endpoint — numbered, no vague language:
1. Validate request body fields (list each field and rule)
2. Check permission: if user.role !== 'admin' → return 403
3. Query DB: exact query description
4. Return response shape

## Error Handling
| Condition | Status | Response |
|-----------|--------|----------|
| Missing required field | 400 | \`{ "error": "field is required" }\` |
| Unauthorised | 401 | \`{ "error": "invalid token" }\` |
| Forbidden | 403 | \`{ "error": "insufficient permissions" }\` |
| Not found | 404 | \`{ "error": "resource not found" }\` |

## Dependencies
- Other modules this layer calls (with exact endpoint or function)
- External services used
\`\`\`

---

#### \`harness/lld/<module>/frontend.md\`
\`\`\`markdown
# LLD — <Module Name>: Frontend

## Routes
| Path | Component | Auth Required |
|------|-----------|---------------|
| /path | ComponentName | yes/no |

## Components
For each component:

### ComponentName
- **Props:** list each prop with type and whether required
- **Responsibility:** one sentence
- **Children:** sub-components it renders
- **Interactions:** what happens on each user action (click, submit, etc.)
- **States:** loading / empty / error / success — exact UI for each

## State
| State Key | Type | Initial Value | Updated When |
|-----------|------|---------------|--------------|
| items | Item[] | [] | on fetch success |
| isLoading | boolean | false | on API call start/end |

## API Integration
| Action | Endpoint | Trigger | On Success | On Error |
|--------|----------|---------|------------|----------|
| Fetch list | GET /api/v1/... | component mount | populate state | show error toast |
| Submit form | POST /api/v1/... | form submit | navigate to /... | show inline error |
\`\`\`

---

#### \`harness/lld/<module>/dashboard.md\` (if required)
\`\`\`markdown
# LLD — <Module Name>: Dashboard

## Views
For each admin view:

### <View Name> (\`/admin/path\`)
- **Purpose:** one sentence
- **Data shown:** list columns/fields displayed
- **Actions available:** list buttons and their outcomes

## Permissions
| Role | Can View | Can Edit | Can Delete |
|------|----------|----------|------------|
| admin | yes | yes | yes |
| manager | yes | yes | no |

## Components
Same structure as frontend components — props, responsibility, states.
\`\`\`

---

### Rules
- LLD files are the direct input to task generation — every field, endpoint, and logic step must be explicit. No placeholders, no "handle as needed".
- Use exact types, column names, and route paths from \`harness/architecture.md\` and the module file.
- If the module file says "TBD" on something, ask the human before writing the LLD — do not invent it.
- Vague LLD = vague tasks = bad code. Every section must be complete.

Start now by reading \`harness/architecture.md\` and listing the available modules in \`harness/modules/\`.`

export const TEST_CASE_PROMPT = (projectName: string) =>
  `You are generating a test case file for "${projectName}" from one or more task files.

> ⚠️ Save the output to \`harness/test_cases/TC-XXX.md\` ONLY — never inside \`apps/\`, \`src/\`, or any source directory.

---

### Step 1 — Read all input files
Read every attached task file in full. For each, extract:
- Task ID and title (from the \`# TASK-XXX:\` heading)
- Task type (db / backend / frontend / dashboard / fe-unit-test / be-unit-test / e2e-test / ui-polish)
- Description and scope
- Every acceptance criterion
- Technical notes (API endpoints, field names, response shapes, roles, constraints)
- Sprint number

Then read \`harness/modules/<module>.md\` (derive the module name from the task files) to get the full acceptance criteria list. Cross-check: every criterion in the module file must be covered by at least one test step.

**What to extract per task type:**
- **frontend / ui-polish** → UI screens, user interactions, component states, validation flows, responsive behaviour
- **backend** → API endpoints, request/response shapes, error codes, business logic rules
- **fe-unit-test** → components/hooks under test, props, interactions, edge cases
- **be-unit-test** → services/controllers under test, error paths, mock boundaries
- **e2e-test** → full user journeys, auth flows, FE ↔ BE data flow end-to-end
- **dashboard** → admin views, permission rules, bulk actions

The \`Linked Task\` field must list ALL attached task IDs (comma-separated).
The \`Type\` field must reflect the test case scope — derive it from the linked task types:
- Only frontend/ui tasks attached → \`ui\`
- Only backend/unit tasks attached → \`unit\`
- Mix of frontend + backend, or e2e-test task attached → \`e2e\`

### Step 2 — Determine the TC number
Run: \`ls harness/test_cases/ 2>/dev/null | grep "^TC-" | sort | tail -1\`
Increment by 1 for the next number (e.g. TC-024 if TC-023 exists). If folder is empty or missing, start at TC-001.

### Step 3 — Generate and save \`harness/test_cases/TC-XXX.md\`

Use this exact structure:

\`\`\`markdown
# TC-XXX: <Module · Feature Area>

## Meta
| Field | Value |
|-------|-------|
| **Status** | 📋 To Do |
| **Type** | e2e / unit / ui (derived from linked tasks) |
| **Priority** | P1 |
| **Assignee** | — |
| **Linked Task** | TASK-XXX, TASK-YYY (all attached task IDs) |
| **Module Ref** | harness/modules/<module>.md |
| **Linked Bug** | — |
| **Sprint** | Sprint N |
| **Created** | YYYY-MM-DD |

---

## Description
2–3 sentences: what this test verifies, which user role is involved, and why it matters.
Base this entirely on the tasks' descriptions and the module's acceptance criteria.

---

## Preconditions
- <App/service is running and accessible>
- <Auth state required — logged in as role X, or unauthenticated>
- <Required env vars / credentials set>
- <Seed data or prior state needed>

---

## Test Steps
| Step | Action | Expected |
|:----:|--------|----------|
| 1 | <Exact action — route to navigate to, button to click, field to fill, API to call> | <Exact outcome — status code, UI element, text, redirect> |
| 2 | ... | ... |

Cover EVERY acceptance criterion from the module file and the attached tasks:
- Happy path first
- Then validation/error cases
- Then edge cases
- For API tests: exact request body, expected status code, response fields
- For UI tests: exact route, visible element text, interaction

---

## Expected Result
One paragraph — what a fully passing run looks like end-to-end.

---

## Actual Result
—

---

## Test Data
\`\`\`
Any test credentials, IDs, payloads, or constants the tester needs.
Pull exact values from Technical Notes in the task files.
\`\`\`

---

## Automation
| Field | Value |
|-------|-------|
| **Status** | Not automated |
| **File** | — |

---

## Notes
- <Known manual-only steps (real SMS, hardware, third-party console)>
- <Relevant API doc links or Swagger paths>
- <Role or permission constraints>
\`\`\`

---

### Rules
- Every acceptance criterion in the module file → at least one test step. No criterion may be skipped.
- Steps must be specific enough for Playwright to automate: exact routes, button labels, field names, API endpoints, status codes.
- Do NOT add a "Test Run History" section — it is auto-generated by Loom.
- After saving, confirm the file path, the TC number, and how many test steps were generated.`

export const TASK_PROMPT = (projectName: string) =>
  `You are generating task files for "${projectName}" from LLD documents. Tasks are the direct input to the Go execution engine — every sub-task and acceptance criterion must be specific enough for an AI agent to implement without asking questions.

### Step 1 — Read context
Read \`harness/architecture.md\` for tech stack and conventions. Then list all available modules in \`harness/lld/\` so the human can pick which module to work on.

Present the list:

---
**Available modules with LLD files:**

| # | Module | Layers available |
|---|--------|-----------------|
| 1 | user-auth | db, backend, frontend |
| 2 | ... | ... |

Which module would you like to generate tasks for? (Reply with the name or number)
---

Wait for the human to pick a module before continuing.

### Step 2 — Read the LLD files for the selected module
Read all available layer files in \`harness/lld/<module>/\`:
- \`db.md\` — if it exists
- \`backend.md\` — if it exists
- \`frontend.md\` — if it exists
- \`dashboard.md\` — if it exists

Also read \`harness/modules/<module>.md\` to get the acceptance criteria.

### Step 3 — Ask which task types to generate
Present the applicable task types based on which LLD layers exist and ask the human to select:

---
**Module:** \`<module-name>\`

**Which tasks would you like me to generate?** Reply with numbers or "all":

| # | Type | Source LLD | Pipeline order |
|---|------|-----------|----------------|
| 1 | **db** — schema, migrations, indexes, seed data | lld/db.md | 1st |
| 2 | **backend** — endpoints, business logic, error handling | lld/backend.md | 2nd |
| 3 | **frontend** — pages, components, state, API integration | lld/frontend.md | 3rd (parallel) |
| 4 | **dashboard** — admin views, permissions *(if lld/dashboard.md exists)* | lld/dashboard.md | 3rd (parallel) |
| 5 | **fe-unit-test** — component, hook, and utility tests | lld/frontend.md | 4th |
| 6 | **be-unit-test** — service, controller, and model tests | lld/backend.md | 4th |
| 7 | **e2e-test** — end-to-end flows covering all acceptance criteria | module file | 5th |
| 8 | **ui-polish** — responsive layout, accessibility, visual correctness | lld/frontend.md | 6th |

> Pipeline order: db → backend → frontend/dashboard (parallel) → fe-unit-test/be-unit-test (parallel) → e2e-test → ui-polish → qa
---

Wait for the human's selection.

### Step 4 — Determine task numbering
Run: \`ls harness/tasks/<module>/ 2>/dev/null | grep "^TASK-" | sort | tail -1\`
Start from the next available number (e.g. TASK-004 if TASK-003 is the last). If the folder is empty or doesn't exist, start from TASK-001.

### Step 5 — Confirm before generating
List exactly what will be created:
- \`harness/tasks/<module>/TASK-XXX.md\` — type: db
- \`harness/tasks/<module>/TASK-XXX.md\` — type: backend
- ...

Ask: "Ready to generate these tasks for <module-name>?"

### Step 6 — Generate and save all selected task files
Only after confirmation, create \`harness/tasks/<module>/\` and write each task file.

Each file must follow this exact structure:

\`\`\`markdown
# TASK-XXX: <Module> — <Type> (<short title>)

## Meta
| Field | Value |
|-------|-------|
| **Status** | 📋 To Do |
| **Type** | db / backend / frontend / dashboard / fe-unit-test / be-unit-test / e2e-test / ui-polish |
| **Priority** | P1 |
| **Assignee** | — |
| **Sprint** | — |
| **Story Points** | — |
| **Module Ref** | harness/modules/<module>.md |
| **LLD Ref** | harness/lld/<module>/<layer>.md |
| **Architecture Ref** | harness/architecture.md |
| **Created** | <today's date> |

---

## Description
2–3 sentences: what this task implements, which layer it covers, and why it matters.

---

## Sub Tasks
Derived directly from the LLD. Each sub-task must be a single actionable unit:
- [ ] Sub-task 1
- [ ] Sub-task 2

---

## Acceptance Criteria
Taken from the module file's Acceptance Criteria — only criteria relevant to this task's layer. Each must be independently testable:
- [ ] Criterion 1
- [ ] Criterion 2

---

## Technical Notes
Exact constraints, patterns, and gotchas from the LLD and architecture doc that the implementer must know.

---

## Files to Create/Modify
\`\`\`
CREATE:
- exact/path/to/file

MODIFY:
- exact/path/to/existing/file
\`\`\`

---

## Dependencies
- **Blocked by:** TASK-XXX (type: db must complete before backend, etc.)
- **Blocks:** TASK-XXX
\`\`\`

---

### Per-type guidance

**db**
- Sub-tasks: create each migration file, define each table, add indexes, add seed data if required
- Technical notes: exact SQL from \`lld/db.md\`
- Files: migration files, model/entity files

**backend**
- Sub-tasks: one sub-task per endpoint (route + handler + service + validation)
- Technical notes: exact request/response shapes and business logic steps from \`lld/backend.md\`
- Files: route files, service files, middleware

**frontend**
- Sub-tasks: one sub-task per page/component; include loading, empty, and error states
- Technical notes: component tree, state shape, and API calls from \`lld/frontend.md\`
- Files: page files, component files, hook files

**dashboard**
- Sub-tasks: one sub-task per admin view
- Technical notes: permissions table and component tree from \`lld/dashboard.md\`
- Files: admin page files, permission guard files

**fe-unit-test**
- Sub-tasks: one sub-task per component/hook/utility being tested
- Technical notes: list exact functions to test, interactions to simulate, mock strategy for API calls and context
- Acceptance criteria: ≥80% coverage, all edge cases covered, tests run in CI
- Files: \`*.test.tsx\` / \`*.spec.ts\` files alongside component files

**be-unit-test**
- Sub-tasks: one sub-task per service/controller/model being tested
- Technical notes: list exact functions to test, error paths, mock strategy for DB and external services
- Acceptance criteria: ≥80% coverage, all error paths tested, tests run in CI
- Files: \`*.test.ts\` / \`*.spec.ts\` files alongside service files

**e2e-test**
- Sub-tasks: one sub-task per acceptance criterion from the module file
- Technical notes: exact user flows, test data needed, environments required
- Files: e2e test spec files

**ui-polish**
- Sub-tasks: responsive breakpoints, a11y audit, keyboard navigation, visual regression
- Technical notes: target devices/screen sizes, accessibility standard (WCAG level)
- Files: CSS/style files, any component updates

### Rules
- Every sub-task and criterion comes from the LLD — do not invent requirements.
- The \`Type\` field in Meta must match one of the eight pipeline types exactly — the Go engine uses it for ordering.
- Task numbering is sequential within the module folder — never reset or reuse numbers.
- If an LLD section says "TBD", note it in Technical Notes and add a sub-task to resolve it before implementation.

Start now by reading \`harness/architecture.md\` and listing the available modules in \`harness/lld/\`.`

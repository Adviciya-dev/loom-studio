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
  `Generate a system architecture document for "${projectName}" and save it as \`harness/architecture.md\`.

The document should include:
- System overview and high-level architecture diagram (ASCII)
- Technology stack with reasoning
- Module/component breakdown
- Data flow and API contracts
- Database schema overview
- Key design decisions and trade-offs
- Scalability and deployment considerations

Write the complete file content and create it using the write tool.`

export const FEATURE_PROMPT = (projectName: string) =>
  `You are creating detailed, developer-ready feature briefs for "${projectName}".

Follow these steps in order:

1. **Create the features folder** — run \`mkdir -p harness/features\` if it doesn't exist.

2. **Read context** — read \`harness/prd.md\` and \`harness/architecture.md\`. If either is missing, proceed with what's available.

3. **Identify all modules** — extract every distinct feature or module. Each top-level user-facing module or major backend service becomes its own file.

4. **Create one file per module** at \`harness/features/<feature-name>.md\` (kebab-case). Each file must be LOW-LEVEL and developer-actionable — detailed enough that a developer can immediately start writing tasks without asking questions.

Each file must follow this exact structure:

\`\`\`markdown
# Feature: <Feature Name>

## Overview
One paragraph: what this module does, who uses it, and why it exists.

## User Stories
- As a [user type], I want [goal], so that [benefit].

## Screens / Pages
For each screen in this module:

### <Screen Name> (\`/route/path\`)
**Purpose:** One sentence — what this screen does.
**Components:**
- \`ComponentName\` — what it renders, key props, behaviour on interaction
**Fields / Inputs:**
- \`fieldName\` (string | number | boolean) — validation rules, placeholder, required/optional
**Actions:**
- Button label → exact outcome (API call + endpoint, navigation path, state update)
**States:**
- loading — skeleton or spinner shown where?
- empty — what text/illustration shown?
- error — inline or toast? exact error message?
- success — what changes in the UI?
**Edge cases:**
- What happens if the user has no data yet?
- What happens if an action fails mid-way?

## API Contracts
List every endpoint this feature calls or exposes.

### METHOD /api/v1/<resource>
- **Auth:** Bearer JWT required / public
- **Query params:** \`param\` (type) — what it filters/sorts
- **Request body:**
\`\`\`json
{
  "field": "string — max 255 chars, required",
  "amount": "number — positive integer, required"
}
\`\`\`
- **Response 200/201:**
\`\`\`json
{
  "id": "uuid",
  "field": "string"
}
\`\`\`
- **Error responses:**
  - 400 — validation failed, returns \`{ errors: [...] }\`
  - 401 — missing or invalid token
  - 404 — resource not found
  - 409 — conflict (e.g. duplicate entry)

## Data Models
For each DB table or document this feature owns or modifies:

\`\`\`
Table: table_name
- id: uuid, PK, auto-generated
- field_name: varchar(255), NOT NULL — description
- status: enum('active','inactive'), default 'active'
- user_id: uuid, FK → users.id, ON DELETE CASCADE
- created_at: timestamp, auto
- updated_at: timestamp, auto
\`\`\`
Relationships: describe every FK join and what cascades.

## Business Logic Rules
Exact rules a developer must implement — no vague language:
- Rule: "If [condition], then [exact action/response]"
- Validation: "Field X must be [constraint] — return error code Y if violated"
- Permissions: "Only [role] can [action] — return 403 otherwise"
- Triggers: "When [event], automatically [side effect]"

## State Management
- Global atoms/store slices this feature reads or writes
- Local component state that must persist across re-renders
- Cache keys and when to invalidate them
- Optimistic update strategy (if any)

## Files to Create / Modify
\`\`\`
CREATE:
- apps/<app>/src/pages/<feature>/index.tsx
- apps/<app>/src/pages/<feature>/<Screen>.tsx
- apps/<app>/src/components/<Feature>/<Component>.tsx
- apps/<app>/src/hooks/use<Feature>.ts
- apps/api/src/routes/<feature>.ts
- apps/api/src/services/<Feature>Service.ts
- apps/api/src/models/<Feature>.ts
- packages/schemas/src/<feature>.ts     (Zod schemas shared FE + BE)
- packages/types/src/<feature>.ts       (TypeScript interfaces)

MODIFY:
- apps/<app>/src/app/_layout.tsx        (add route)
- apps/api/src/routes/index.ts          (register router)
- packages/schemas/src/index.ts         (export new schemas)
\`\`\`

## Acceptance Criteria
Each criterion must be specific and independently testable:
- [ ] <Screen> renders <exact element> when <exact condition>
- [ ] POST /api/v1/<resource> returns 201 with correct shape when all required fields provided
- [ ] Form submit is disabled until all required fields are valid
- [ ] Error toast appears within 300ms of a failed API call
- [ ] Loading skeleton shown for exactly the duration of the API call
- [ ] Empty state illustration shown when list returns 0 items

## Edge Cases & Error Handling
- **Empty state:** what renders when there is no data (text, illustration, CTA)
- **Network error:** exact UI response on 500 or timeout
- **Validation errors:** inline field errors vs. form-level errors
- **Concurrent edits:** how conflicts are detected and resolved
- **Large datasets:** pagination threshold, virtual scroll if needed
- **Permission denied:** redirect path or inline error message
- **Expired session:** redirect to login, preserve intended destination

## Dependencies
- **Requires first:** list other features/modules that must exist before this can be built
- **Blocks:** list features that cannot start until this is done
- **Third-party:** libraries, SDKs, or external APIs (include version if critical)
\`\`\`

Create all feature files now in a single pass. Do not ask for confirmation.
Be concrete and specific throughout — a developer reading a file must have zero ambiguity about what to build. Avoid vague phrases like "handle errors appropriately" or "show a loading state". Always specify exact behaviour.`

export const TEST_CASE_PROMPT = (projectName: string) =>
  `You are generating a detailed, executable test case document for "${projectName}" based on the attached QA task file.

**Input:** The user has attached a QA task file (e.g. \`harness/tasks/authentication/TASK-007-authentication-qa.md\`). Use every sub-task and acceptance criterion in that file as the source of truth.

**Instructions — follow every step:**

### Step 1: Identify the feature and output path
Determine the feature name from the attached QA task file.
Create the output directory and file at:
\`harness/test-cases/<feature-name>/TEST-CASES-<feature-name>.md\`

Run \`mkdir -p harness/test-cases/<feature-name>\` first if it does not exist.

### Step 2: Generate test cases for every test type
For each test type listed in the QA task sub-tasks, generate a full set of test cases. Every test case must include:
- **TC-ID** (e.g. TC-SMOKE-001, TC-FUNC-001, TC-REG-001, TC-E2E-001, etc.)
- **Title** — one-line description
- **Priority** — P0 / P1 / P2
- **Preconditions** — what must be true before the test runs (env, test data, auth state)
- **Steps** — numbered, exact actions the tester takes
- **Expected result** — what should happen after each step
- **Pass/Fail criteria** — single clear statement of what "pass" means

### Step 3: Cover all test types from the QA task
Generate test cases for EVERY category below (skip none):

#### 🔵 Smoke Tests (TC-SMOKE-XXX)
Basic sanity checks — feature loads and primary happy path works.

#### 🟢 Functional Tests (TC-FUNC-XXX)
One test case per acceptance criterion from TASK-001 (frontend) and TASK-002 (backend).
Cover every user-facing action, form, button, and state.

#### 🟡 Regression Tests (TC-REG-XXX)
Test the areas listed in the QA task that could be broken by this feature.
Include at least one test per existing feature that shares code or routes with this feature.

#### 🔷 Integration Tests (TC-INT-XXX)
FE ↔ BE data flow: verify real API calls, correct request/response shapes, auth headers.

#### 🎨 UI Layer Tests (TC-UI-XXX)
- Visual: layout, typography, colours, icons match design
- Responsive: mobile (375px), tablet (768px), desktop (1280px+)
- Accessibility: keyboard nav, screen reader labels, focus order, contrast ratios
- Cross-browser: Chrome, Firefox, Safari

#### ⚠️ Edge Case Tests (TC-EDGE-XXX)
Empty states, max-length inputs, special characters, concurrent sessions, offline mode,
expired tokens, large datasets, rapid repeated actions.

#### ❌ Error Handling Tests (TC-ERR-XXX)
Network failure (500, 503), invalid input (400), unauthorised (401/403),
not found (404), timeout, partial response.

#### 🔒 Security Tests (TC-SEC-XXX)
Auth bypass, direct URL access without login, IDOR (accessing other users' data),
XSS via input fields, CSRF, sensitive data in logs/URLs, session expiry.

#### ⚡ Performance Tests (TC-PERF-XXX)
Page load under 3G, API response time under load (50 concurrent users),
large list rendering (1000+ items), memory leak check (idle 10 min).

#### 🔄 End-to-End Tests (TC-E2E-XXX)
Full user journeys — from app launch through the entire feature flow to completion.
Cover at least: happy path, error recovery path, and edge-case path.

---

### Output format per test case:

\`\`\`
### TC-<TYPE>-<NUMBER>: <Title>

**Priority:** P0 / P1 / P2
**Type:** <Smoke | Functional | Regression | Integration | UI | Edge Case | Error | Security | Performance | E2E>
**Feature:** <feature name>

**Preconditions:**
- User is logged in as [role]
- Test data: [specify]
- Environment: [staging / local]

**Steps:**
1. [Exact action]
2. [Exact action]
3. [Exact action]

**Expected Result:**
[What should happen — be specific about UI state, data, response]

**Pass Criteria:** [Single clear statement]
**Fail Criteria:** [What would make this fail]
\`\`\`

---

Generate ALL test cases now in a single pass. Do not skip any test type. Be specific — a tester with no prior context should be able to execute each test case exactly as written.`

export const TASK_PROMPT = (projectName: string) =>
  `You are helping generate structured task files for a feature in "${projectName}".

**Input:** The user has attached a feature brief file (e.g. \`harness/features/authentication.md\`). Use that file as your primary context. Also read \`harness/architecture.md\` for technical constraints and stack details.

---

### Step 1: Identify the feature
Read the attached feature file and determine the feature name.

### Step 2: Ask which tasks to generate
Present the following task menu and ask the user to pick the ones they need. Different team members will pick different tasks based on their role.

Reply with EXACTLY this format — do not generate any files yet:

---
**Feature detected:** \`<feature-name>\`

**Which tasks would you like me to generate?** Reply with the numbers (e.g. \`1, 4, 7\` or \`all\`):

| # | Task | Role |
|---|------|------|
| 1 | **Frontend** — UI/UX, components, screens, mock data, architecture reference | Frontend dev |
| 2 | **Backend** — APIs, DB schema, services, auth, validation | Backend dev |
| 3 | **Integration** — Wire FE to real BE, replace mocks, end-to-end flows | Full-stack / lead |
| 4 | **Frontend Unit Tests** — Component, hook, and utility tests | Frontend dev |
| 5 | **Backend Unit Tests** — Service, controller, model tests | Backend dev |
| 6 | **Performance** — Load testing, Lighthouse, DB query optimisation | DevOps / any |
| 7 | **QA** — All test types: smoke, functional, regression, UI, security, e2e | QA engineer |

> Tip: A frontend dev typically needs tasks **1, 4**. A backend dev needs **2, 5**. A full-stack lead needs **1, 2, 3**. QA needs **7**.
---

### Step 3: Wait for the user's selection, then generate ONLY the selected tasks

Once the user replies with their selection, create \`harness/tasks/<feature-name>/\` and generate ONLY the chosen task files using the structure below.

---

### Task file template (use for ALL selected files):
Create each file below inside that folder. Use the exact naming convention and follow the template precisely.

---

**TASK-001-<feature>-frontend.md**
- Full UI/UX breakdown: every screen, component, and state
- Include mock data structures for development (so FE can work without BE)
- List all props, API contracts the FE will consume
- Reference \`harness/architecture.md\` for frontend tech stack and conventions
- Sub-tasks: design system components, routing, forms, error states, loading states, responsive layout
- Acceptance criteria: pixel-level UI matches design, all user interactions work, mock data renders correctly

**TASK-002-<feature>-backend.md**
- All API endpoints (method, path, request/response schema)
- Database models/schema changes
- Business logic, validation rules, error codes
- Auth/middleware requirements
- Reference \`harness/architecture.md\` for backend tech stack, DB, and patterns
- Sub-tasks: models, controllers/routes, services, middleware, error handling
- Acceptance criteria: all endpoints return correct status codes and payloads

**TASK-003-<feature>-integration.md**
- Wire FE to real BE (replace mock data)
- API integration tests (happy path + error paths)
- Auth token handling end-to-end
- Sub-tasks: replace mocks with real calls, handle loading/error states, test each flow end-to-end
- Acceptance criteria: full user journey works with real data, no mocks remain in production code

**TASK-004-<feature>-fe-unit-tests.md**
- Unit tests for every component, hook, and utility
- Test rendering, props, interactions, edge cases
- Mock external dependencies (API calls, context)
- Sub-tasks: component tests, hook tests, utility/helper tests, snapshot tests
- Acceptance criteria: ≥80% coverage, all edge cases covered, tests run in CI

**TASK-005-<feature>-be-unit-tests.md**
- Unit tests for services, controllers, validators, models
- Mock DB and external services
- Test business logic, validation, error handling
- Sub-tasks: service tests, controller tests, validator tests, model tests
- Acceptance criteria: ≥80% coverage, all error paths tested, tests run in CI

**TASK-006-<feature>-performance.md**
- Load testing (expected concurrent users, response time SLAs)
- FE performance: bundle size, LCP, FID, CLS targets
- BE performance: p95 latency, throughput, DB query optimisation
- Sub-tasks: load test scripts, FE lighthouse audit, BE profiling, DB query analysis
- Acceptance criteria: all SLAs met under expected load

**TASK-007-<feature>-qa.md** ← CRITICAL — testers will use this to generate test cases
- Description must include: what to test, testing strategy, environments needed, test data setup
- Sub-tasks must cover ALL of the following test types:
  - [ ] **Smoke tests** — verify feature is reachable and basic flow works
  - [ ] **Functional tests** — verify every acceptance criterion from TASK-001 and TASK-002
  - [ ] **Regression tests** — verify this feature did not break existing features (list which areas to check)
  - [ ] **Integration tests** — verify FE ↔ BE data flow end-to-end
  - [ ] **UI layer tests** — visual correctness, responsive on mobile/tablet/desktop, accessibility (a11y), keyboard navigation
  - [ ] **Edge case tests** — empty states, max input lengths, special characters, concurrent users
  - [ ] **Error handling tests** — network failure, 4xx/5xx responses, invalid data
  - [ ] **Security tests** — auth bypass attempts, SQL injection, XSS, CSRF
  - [ ] **Performance tests** — page load under slow network, large dataset rendering
  - [ ] **End-to-end tests** — full user journey from login to task completion
- Acceptance criteria: all test types pass, zero P0/P1 bugs, QA sign-off received

---

### Task file template (use for ALL 7 files):

\`\`\`markdown
# TASK-00X-<feature>-<type>: <Full Title>

## Meta
| Field | Value |
|-------|-------|
| **Status** | 📋 To Do |
| **Priority** | P1 |
| **Sprint** | — |
| **Story Points** | — |
| **Feature Ref** | harness/features/<feature>.md |
| **Architecture Ref** | harness/architecture.md |
| **Created** | <today's date> |

---

## Description
<2-3 sentences describing what this task covers and why it matters>

---

## Sub Tasks
- [ ] Sub-task 1
- [ ] Sub-task 2
...

---

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
...

---

## Technical Notes
<Key constraints, patterns to follow, gotchas>

---

## Files to Create/Modify
\`\`\`
CREATE/MODIFY:
- path/to/file
\`\`\`

---

## Dependencies
- **Blocked by:** TASK-00X (if applicable)
- **Blocks:** TASK-00X (if applicable)
\`\`\`

---

Generate all selected files now in a single pass. Do not ask for confirmation. Base the content entirely on the attached feature file and architecture.md.`

# QA Automation Tool - Architecture & Working Flow

## Overview
Cross-platform desktop application for automated QA testing built with Tauri, Go CLI, and Claude Code CLI.

---

## Tech Stack

```
┌─────────────────────────────────────────┐
│   Frontend: Tauri Desktop App (React)  │
│   - Windows / macOS support             │
│   - React JSX UI components             │
└──────────────┬──────────────────────────┘
               │ IPC Communication
               ▼
┌─────────────────────────────────────────┐
│   Backend: Tauri Rust + Go CLI         │
│   - Process management                  │
│   - File system operations              │
│   - Test orchestration                  │
└──────────────┬──────────────────────────┘
               │ Spawns & Manages
               ▼
┌─────────────────────────────────────────┐
│   Test Runner: Go CLI                   │
│   - Playwright execution                │
│   - Parallel test management            │
│   - Report generation                   │
└──────────────┬──────────────────────────┘
               │ AI Integration
               ▼
┌─────────────────────────────────────────┐
│   AI Layer: Claude Code CLI             │
│   - Generate test code                  │
│   - Analyze failures                    │
│   - Auto-fix suggestions                │
└─────────────────────────────────────────┘
```

---

## Core Features

### 1. Test List View
- Display all test cases from TEST-CASES.md
- Show test metadata (ID, name, type, priority)
- Color-coded badges for test types and priorities

### 2. Test Execution
- Run all tests with single button
- Run individual tests with per-test play button
- Real-time status updates during execution

### 3. Live Status Tracking
- Running state (blue badge)
- Passed state (green badge + background)
- Failed state (red badge + background)
- Header summary with live counts

### 4. Test Results Report
- Summary cards (Total, Passed, Failed, Pass Rate)
- Visual pass rate bar
- Failed tests detail section
- Export and re-run options

### 5. Result Management
- Clear all results button
- Back to test list navigation

---

## Application Flow

### Startup Flow
```
1. User launches Tauri app
2. App loads React UI
3. Tauri backend initializes Go CLI
4. Go CLI parses TEST-CASES.md
5. Test cases displayed in UI
```

### Run All Tests Flow
```
1. User clicks "Run All Tests"
   ↓
2. UI sets isRunning = true
   ↓
3. Tauri invokes Go CLI command
   ↓
4. Go CLI spawns Playwright
   ↓
5. Tests execute in parallel (4 workers)
   ↓
6. Progress updates sent to UI via IPC
   ↓
7. Results collected and aggregated
   ↓
8. Report generated and displayed
   ↓
9. UI sets isRunning = false
```

### Run Single Test Flow
```
1. User clicks test's ▶️ button
   ↓
2. UI sets testStatus[testId] = 'running'
   ↓
3. Tauri invokes Go CLI with single testId
   ↓
4. Go CLI executes that specific test
   ↓
5. Result returned (passed/failed)
   ↓
6. UI updates testStatus[testId]
   ↓
7. Visual feedback shown (badge + color)
```

### Clear Results Flow
```
1. User clicks "Clear Results"
   ↓
2. Reset testStatuses = {}
   ↓
3. Hide report view
   ↓
4. Reset results = null
   ↓
5. Return to clean test list
```

---

## State Management

### React Component State
```javascript
const [isRunning, setIsRunning] = useState(false);
// Tracks if "Run All Tests" is active

const [showReport, setShowReport] = useState(false);
// Controls test list vs report view

const [progress, setProgress] = useState(0);
// Progress percentage (0-100) for all tests

const [results, setResults] = useState(null);
// Final test results object

const [testStatuses, setTestStatuses] = useState({});
// Individual test states: { 'TC-SMOKE-001': 'passed', ... }

const [runningTestId, setRunningTestId] = useState(null);
// Which test is currently running individually
```

### Test Status Values
- `null` / `undefined` - Not run yet
- `'running'` - Currently executing
- `'passed'` - Test succeeded
- `'failed'` - Test failed

---

## Data Structures

### Test Case Object
```javascript
{
  id: 'TC-SMOKE-001',
  name: 'Login page loads with visible form',
  type: 'Smoke',           // Smoke, Functional, Regression, etc.
  priority: 'P0'           // P0, P1, P2
}
```

### Test Results Object
```javascript
{
  total: 18,
  passed: 15,
  failed: 3,
  duration: '2m 34s',
  passRate: 83,
  failedTests: [
    {
      id: 'TC-FUNC-005',
      name: 'Wrong password displays error',
      error: 'Timeout: locator not found'
    }
  ]
}
```

---

## IPC Communication (Tauri ↔ Go)

### Commands (Frontend → Backend)
```javascript
// Load test cases from markdown
invoke('load_test_cases')
  → returns: Array<TestCase>

// Run all tests
invoke('run_tests', { testIds: [...] })
  → returns: TestResults

// Run single test
invoke('run_single_test', { testId: 'TC-SMOKE-001' })
  → returns: { passed: boolean, duration: string, error?: string }

// Get test results
invoke('get_test_results')
  → returns: TestResults

// Export report
invoke('export_report', { format: 'pdf' })
  → returns: { filePath: string }
```

### Events (Backend → Frontend)
```javascript
// Test progress updates
listen('test-progress', (event) => {
  // event.payload = { progress: 45, current: 8, total: 18 }
})

// Individual test status
listen('test-status', (event) => {
  // event.payload = { testId: 'TC-SMOKE-001', status: 'passed' }
})

// Test completed
listen('test-completed', (event) => {
  // event.payload = { testId: 'TC-SMOKE-001', passed: true, duration: '1.2s' }
})
```

---

## Go CLI Architecture

### Commands
```bash
# Parse test specification
qa-tool parse --spec ./TEST-CASES.md

# Run all tests
qa-tool run --all

# Run specific tests
qa-tool run --tests TC-SMOKE-001,TC-FUNC-001

# Run by type
qa-tool run --type smoke

# Run by priority
qa-tool run --priority P0

# Generate report
qa-tool report --format html
```

### Internal Structure
```
go-cli/
├── cmd/
│   ├── run.go         # Test execution commands
│   ├── parse.go       # Parse markdown specs
│   └── report.go      # Generate reports
├── internal/
│   ├── runner/
│   │   └── playwright.go    # Playwright orchestration
│   ├── parser/
│   │   └── markdown.go      # Parse TEST-CASES.md
│   └── reporter/
│       └── html.go          # HTML report generation
└── main.go
```

---

## Test Execution Workflow

### Playwright Integration
```
1. Go CLI reads test case spec
2. Generates/uses Playwright test file
3. Spawns: npx playwright test <file>
4. Captures stdout/stderr
5. Parses test results
6. Returns to Tauri frontend
```

### Parallel Execution
```
- Default: 4 parallel workers
- Configurable in settings
- Tests divided across workers
- Results aggregated at end
```

### Test Retry Logic
```
- Failed tests auto-retry 3 times
- Exponential backoff between retries
- Final status after all retries
```

---

## AI Integration (Claude Code CLI)

### Test Generation
```bash
# Generate Playwright test from spec
claude-code generate-test \
  --spec "TC-SMOKE-001: Login page loads" \
  --framework playwright \
  --output ./tests/smoke/login.spec.ts
```

### Failure Analysis
```bash
# Analyze failed test
claude-code analyze-failure \
  --test ./tests/smoke/login.spec.ts \
  --error "Timeout: locator not found" \
  --screenshot ./screenshots/failure.png
```

### Auto-Fix
```bash
# Fix broken test
claude-code fix-test \
  --test ./tests/smoke/login.spec.ts \
  --error "Selector changed"
```

---

## Tool Integration Points

### Required Tools
1. **Playwright** - Browser automation
2. **Node.js** - Playwright runtime
3. **Go** - CLI backend
4. **Rust** - Tauri backend
5. **Claude Code CLI** - AI features

### Optional Tools
1. **Lighthouse** - Performance testing
2. **axe-core** - Accessibility testing
3. **PostgreSQL** - DB verification
4. **FFmpeg** - Video processing

---

## File System Structure

```
qa-automation-tool/
├── tauri-app/                  # Tauri desktop app
│   ├── src/
│   │   ├── App.jsx
│   │   └── QAAutomationTool.jsx
│   └── src-tauri/
│       └── src/
│           └── main.rs
├── go-cli/                     # Go CLI
│   ├── cmd/
│   └── internal/
├── tests/                      # Generated tests
│   ├── smoke/
│   ├── functional/
│   └── e2e/
├── reports/                    # Test reports
│   ├── html/
│   └── json/
└── TEST-CASES.md              # Test specifications
```

---

## Testing Process

### 1. Test Specification
- Write test cases in markdown (TEST-CASES.md)
- Include: ID, name, steps, expected results, priority

### 2. Test Generation (Optional)
- Use Claude Code CLI to generate Playwright tests
- Or manually write tests

### 3. Test Execution
- Run via UI (all tests or individual)
- Go CLI orchestrates execution
- Real-time progress updates

### 4. Results Analysis
- View results in UI
- Check failed tests
- Export reports

### 5. Fix & Retry
- Use AI suggestions to fix failures
- Re-run failed tests
- Update test code

---

## Error Handling

### Network Errors
```
- API unreachable → Show friendly error
- Timeout → Retry with exponential backoff
- 500 errors → Log and show user-friendly message
```

### Test Failures
```
- Capture screenshot
- Save trace file
- Log error message
- Provide AI-suggested fix
```

### System Errors
```
- Go CLI crash → Restart process
- Playwright crash → Clean up and retry
- File system errors → Show alert with path
```

---

## Performance Considerations

### Parallel Execution
- 4 workers default
- Reduces total execution time by ~75%
- Configurable based on system resources

### Progress Updates
- Throttled to 100ms intervals
- Prevents UI flooding
- Smooth progress bars

### Memory Management
- Cleanup after each test
- Browser instances closed properly
- Trace files compressed

---

## Security Considerations

### Test Data
- Sensitive credentials in .env file
- Never commit test credentials
- Use environment variables

### API Keys
- Claude Code CLI key stored securely
- Not embedded in code
- Read from config file

### Reports
- Sanitize error messages
- Redact sensitive data
- Safe file paths for exports

---

## Future Enhancements

### Planned Features
1. Test scheduling (cron jobs)
2. CI/CD integration
3. Email notifications
4. Slack webhooks
5. Historical trend charts
6. Flaky test detection
7. Test case templates
8. Custom assertions library

### Under Consideration
1. Cloud test execution
2. Mobile testing support
3. API testing integration
4. Load testing module
5. Visual regression testing
6. Test case management
7. Team collaboration features

---

## Deployment

### Build Commands
```bash
# Build Tauri app
cd tauri-app
npm run tauri build

# Build Go CLI
cd go-cli
go build -o qa-tool

# Package together
# Windows: .msi installer
# macOS: .dmg bundle
```

### Distribution
```
- Windows: qa-tool-setup.msi
- macOS: qa-tool.dmg
- Includes embedded Go CLI
- Self-contained (no external deps)
```

---

## Troubleshooting

### Common Issues

**App won't start**
- Check Node.js installed (v18+)
- Verify Go installed (v1.21+)
- Ensure Playwright browsers installed

**Tests timeout**
- Increase timeout in config
- Check network connection
- Verify app is running (localhost:3000)

**Claude Code CLI errors**
- Verify API key configured
- Check network connectivity
- Ensure sufficient API quota

**Reports not generating**
- Check write permissions
- Verify output directory exists
- Check disk space

---

## Configuration

### config.json
```json
{
  "environment": "local",
  "baseUrl": "http://localhost:3000",
  "apiUrl": "http://localhost:9000",
  "headless": false,
  "parallel": 4,
  "timeout": 30000,
  "retries": 3,
  "screenshots": true,
  "video": "on-failure",
  "trace": "on-failure"
}
```

### Environment Variables
```bash
CLAUDE_API_KEY=sk-ant-...
TEST_EMAIL=qa-auth@treasuretrove.com
TEST_PASSWORD=QaPass@1234
DB_CONNECTION=postgresql://...
```

---

## License & Credits

- Built with Tauri (MIT)
- Uses Playwright (Apache 2.0)
- Claude Code CLI (Anthropic)
- Go (BSD-3-Clause)

---

**Version:** 1.0.0  
**Last Updated:** May 2026  
**Maintained By:** QA Team

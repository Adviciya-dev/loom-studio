---
id: TASK-050
title: "Site Audit · React ReportViewer.tsx"
type: task
status: open
effort: High
priority: high
phase: 3
area: frontend
---

## Goal

Build `ReportViewer.tsx` — the Phase 3 UI. It shows a spinner while the report is being generated, an error banner with Retry on failure, and a full read-only markdown viewer with a scroll-spying TOC sidebar, Copy Report, Export as Markdown, View Audit Log / View Report toggle, and a Proceed to Goal Planning button.

## Files to modify

- `src/components/SiteAudit/ReportViewer.tsx` (replace stub)
- `src/components/SiteAudit/ReportViewer.module.css` (create)

## Dependencies to install (if not already present)

```bash
pnpm add react-markdown remark-gfm remark-slug
pnpm add -D @types/mdast
```

Check `package.json` first — only install what is missing.

---

## State consumed from context

```typescript
const { state, dispatch } = useApp()
const {
  activeAuditSession,   // AuditSession | null
  auditReport,          // string | null  — markdown content
  auditReportGenerating,// boolean
  auditReportError,     // string | null
} = state
```

These fields are added by TASK-051. `ReportViewer` is a pure consumer — it does not dispatch directly except for the Proceed and Retry buttons.

---

## Component structure

```
ReportViewer
├── GeneratingState      (spinner + status text)   — shown when auditReportGenerating
├── ErrorState           (banner + Retry button)    — shown when auditReportError
├── EmptyState           (Generate Report button)   — shown when no report and not generating
└── ReportLayout         (report rendered)          — shown when auditReport exists
    ├── ReportToolbar    (Copy, Export, View Audit Log, Proceed)
    ├── TOCSidebar       (scroll-spy TOC)
    └── ReportContent    (react-markdown render)
```

Keep all sub-structures in `ReportViewer.tsx` (no additional files). Extract only if the file exceeds 200 lines — see file size limit rule.

---

## Generate Report button (empty state)

Shown when `auditReport` is null, `auditReportGenerating` is false, and `auditReportError` is null.

```tsx
// Enabled only when minimum raw data exists — checked via activeAuditSession.phase
// The button is disabled if phase is not 'done' (Phase 2 incomplete)
const canGenerate = activeAuditSession?.phase === 'done'

<button
  className={styles.generateBtn}
  onClick={handleGenerateReport}
  disabled={!canGenerate}
  title={!canGenerate ? 'Not enough audit data to generate a report.' : undefined}
>
  Generate Report
</button>
```

`handleGenerateReport` dispatches `AUDIT_REPORT_STARTED` and then calls `auditGenerateReport`. On a second click (report already exists), show a browser `confirm()` dialog before dispatching:

```typescript
async function handleGenerateReport() {
  if (auditReport) {
    const ok = confirm('A report already exists for this session. Regenerate it?')
    if (!ok) return
  }
  dispatch({ type: 'AUDIT_REPORT_STARTED' })
  try {
    await auditGenerateReport(activeProject!.path, activeAuditSession!.id)
  } catch (err) {
    dispatch({ type: 'AUDIT_REPORT_FAILED', payload: String(err) })
  }
}
```

The engine emits `audit_report_ready` when done; `SiteAudit.tsx` (TASK-051) handles reading and dispatching `AUDIT_REPORT_READY`.

---

## Generating state

```tsx
{auditReportGenerating && (
  <div className={styles.generatingState}>
    <Loader2 className={styles.spinner} size={28} />
    <p>Generating report… this may take 30–60 seconds.</p>
  </div>
)}
```

Use `Loader2` from `lucide-react` with a CSS spin animation.

---

## Error state

```tsx
{auditReportError && (
  <div className={styles.errorBanner}>
    <AlertCircle size={16} />
    <span>Report generation failed. {auditReportError}</span>
    <button onClick={handleGenerateReport}>Retry</button>
  </div>
)}
```

---

## Markdown viewer

Use `react-markdown` with `remark-gfm` (tables, task lists) and `remark-slug` (anchor-linked headings).

```tsx
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkSlug from 'remark-slug'

// Code block with copy button
function CodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(children)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className={styles.codeBlock}>
      <button className={styles.copyCodeBtn} onClick={handleCopy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre><code>{children}</code></pre>
    </div>
  )
}

<ReactMarkdown
  remarkPlugins={[remarkGfm, remarkSlug]}
  components={{
    code({ inline, children }) {
      if (inline) return <code>{children}</code>
      return <CodeBlock>{String(children)}</CodeBlock>
    }
  }}
>
  {auditReport!}
</ReactMarkdown>
```

---

## TOC sidebar

Parse H2 headings from `auditReport` to build the TOC. Use `IntersectionObserver` to scroll-spy the active section.

```typescript
// Parse H2 headings from markdown text
function parseTOC(markdown: string): { id: string; label: string }[] {
  return markdown
    .split('\n')
    .filter(line => line.startsWith('## '))
    .map(line => {
      const label = line.replace(/^##\s+/, '')
      const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      return { id, label }
    })
}
```

Render a fixed-width sidebar with anchor links. Highlight the active entry with an accent class.

```tsx
const toc = parseTOC(auditReport ?? '')

<nav className={styles.tocSidebar}>
  {toc.map(({ id, label }) => (
    <a
      key={id}
      href={`#${id}`}
      className={activeSection === id ? styles.tocActive : styles.tocItem}
    >
      {label}
    </a>
  ))}
</nav>
```

---

## Toolbar buttons

### Copy Report

```typescript
async function handleCopyReport() {
  await navigator.clipboard.writeText(auditReport!)
  // brief visual feedback — toggle a 'copied' local state for 2 s
}
```

### Export as Markdown

```typescript
async function handleExportReport() {
  try {
    await auditExportReport(
      activeProject!.path,
      activeAuditSession!.id,
      activeAuditSession!.siteName,
    )
  } catch (err) {
    if (String(err) !== 'cancelled') console.error(err)
  }
}
```

### View Audit Log / View Report toggle

A local boolean state `showAuditLog` (default `false`) controls which panel is shown. The toggle button label switches between "← View Audit Log" and "View Report →".

When `showAuditLog` is true, render `<AuditProgress />` in place of the report layout. Import `AuditProgress` from `./AuditProgress`.

### Proceed to Goal Planning

```typescript
function handleProceedToGoals() {
  dispatch({ type: 'AUDIT_PHASE_SET', payload: 'goals' })
}
```

Disabled when `auditReport` is null.

---

## CSS layout (`ReportViewer.module.css`)

```
.shell          { display: flex; flex-direction: column; height: 100%; }
.toolbar        { display: flex; gap: 8px; padding: 12px 16px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.body           { display: flex; flex: 1; overflow: hidden; }
.tocSidebar     { width: 200px; flex-shrink: 0; overflow-y: auto; padding: 16px 12px; border-right: 1px solid var(--border); }
.tocItem        { display: block; font-size: 12px; color: var(--text-muted); padding: 4px 0; text-decoration: none; }
.tocItem:hover  { color: var(--text); }
.tocActive      { composes: tocItem; color: var(--accent); font-weight: 500; }
.content        { flex: 1; overflow-y: auto; padding: 24px 32px; }
.generatingState{ display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 12px; color: var(--text-muted); }
.spinner        { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.errorBanner    { display: flex; align-items: center; gap: 8px; padding: 12px 16px; background: var(--error-bg); color: var(--error); border-bottom: 1px solid var(--error); }
.codeBlock      { position: relative; }
.copyCodeBtn    { position: absolute; top: 8px; right: 8px; font-size: 11px; padding: 2px 8px; }
```

Use existing CSS custom properties (`--border`, `--accent`, `--text-muted`, etc.) from the project theme.

---

## Acceptance criteria

- [ ] `ReportViewer` renders a spinner + "Generating report… this may take 30–60 seconds." when `auditReportGenerating` is true
- [ ] Error banner with Retry button renders when `auditReportError` is non-null; Retry calls `handleGenerateReport`
- [ ] Generate Report button is disabled with tooltip when `activeAuditSession.phase !== 'done'`
- [ ] Second click on Generate Report (report exists) shows a confirmation dialog before dispatching
- [ ] Report renders using `react-markdown` with `remark-gfm` and `remark-slug`
- [ ] Code blocks render with a copy button that copies the block content and shows "Copied" feedback for 2 s
- [ ] TOC sidebar lists all H2 headings from the report with scroll-spy active highlighting
- [ ] Copy Report button copies full markdown to clipboard
- [ ] Export as Markdown opens native Save dialog and copies `report.md` to chosen path; dismissed dialog is silently ignored
- [ ] View Audit Log / View Report toggle switches the right panel between `AuditProgress` and the report layout without losing state
- [ ] Proceed to Goal Planning button is disabled when `auditReport` is null
- [ ] `tsc --noEmit` passes with no TypeScript errors

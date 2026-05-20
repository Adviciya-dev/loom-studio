import { CheckCircle2, XCircle, Download } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import type { CqcIssue } from '@/types'
import styles from './ResultPanel.module.css'

function severityClass(sev: string) {
  if (sev === 'high') return styles.severityHigh
  if (sev === 'medium') return styles.severityMedium
  return styles.severityLow
}

function highlightClass(sev: string) {
  if (sev === 'high') return styles.highlightHigh
  if (sev === 'medium') return styles.highlightMedium
  return styles.highlightLow
}

function HighlightedText({ text, issues }: { text: string; issues: CqcIssue[] }) {
  if (!issues.length) return <span>{text}</span>

  type Span = { start: number; end: number; issue: CqcIssue }
  const spans: Span[] = []

  for (const issue of issues) {
    const idx = text.indexOf(issue.snippet)
    if (idx === -1) continue
    spans.push({ start: idx, end: idx + issue.snippet.length, issue })
  }

  spans.sort((a, b) => a.start - b.start)

  const parts: React.ReactNode[] = []
  let cursor = 0

  for (const span of spans) {
    if (span.start > cursor) {
      parts.push(<span key={`t-${cursor}`}>{text.slice(cursor, span.start)}</span>)
    }
    parts.push(
      <mark
        key={`h-${span.start}`}
        className={`${styles.highlight} ${highlightClass(span.issue.severity)}`}
        title={`${span.issue.type}: ${span.issue.explanation}`}
      >
        {span.issue.snippet}
      </mark>
    )
    cursor = span.end
  }

  if (cursor < text.length) {
    parts.push(<span key={`t-end`}>{text.slice(cursor)}</span>)
  }

  return <>{parts}</>
}

function ResultPanel() {
  const { state } = useApp()
  const { cqcActiveCheck } = state

  if (!cqcActiveCheck) {
    return (
      <div className={styles.root}>
        <div className={styles.noIssues}>No result to display.</div>
      </div>
    )
  }

  const { approved, summary, issues, extracted_text } = cqcActiveCheck

  function handleExport() {
    const lines: string[] = [
      `# Content Quality Check Report`,
      `Status: ${approved ? 'APPROVED' : 'REJECTED'}`,
      `Summary: ${summary}`,
      '',
      `## Issues (${issues.length})`,
    ]
    for (const issue of issues) {
      lines.push(`\n### [${issue.severity.toUpperCase()}] ${issue.type}`)
      lines.push(`Snippet: "${issue.snippet}"`)
      lines.push(`Explanation: ${issue.explanation}`)
      if (issue.suggested_fix) lines.push(`Fix: ${issue.suggested_fix}`)
    }
    lines.push('\n## Checked Content\n')
    lines.push(extracted_text)

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cqc-report-${Date.now()}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div
          className={`${styles.badge} ${approved ? styles.badgeApproved : styles.badgeRejected}`}
        >
          {approved ? (
            <CheckCircle2 size={14} strokeWidth={2.5} />
          ) : (
            <XCircle size={14} strokeWidth={2.5} />
          )}
          {approved ? 'Approved' : 'Needs Review'}
        </div>
        <span className={styles.summary}>{summary}</span>
        <button className={styles.exportBtn} onClick={handleExport}>
          <Download size={12} strokeWidth={2} />
          Export
        </button>
      </div>

      <div className={styles.body}>
        <div className={styles.textPane}>
          <div className={styles.paneTitle}>Checked Content</div>
          <div className={styles.textContent}>
            <HighlightedText text={extracted_text} issues={issues} />
          </div>
        </div>

        <div className={styles.issuesPane}>
          <div className={styles.paneTitle}>Issues ({issues.length})</div>
          {issues.length === 0 ? (
            <div className={styles.noIssues}>
              <span>✅</span>
              <span>No issues found</span>
            </div>
          ) : (
            <div className={styles.issuesList}>
              {issues.map((issue, i) => (
                <div key={i} className={styles.issue}>
                  <div className={styles.issueHeader}>
                    <div className={`${styles.severityDot} ${severityClass(issue.severity)}`} />
                    <span className={styles.issueType}>{issue.type}</span>
                    <span className={styles.issueSeverity}>{issue.severity}</span>
                  </div>
                  <div className={styles.issueSnippet}>"{issue.snippet}"</div>
                  <div className={styles.issueExplanation}>{issue.explanation}</div>
                  {issue.suggested_fix && (
                    <div className={styles.issueFix}>
                      <span className={styles.issueFixLabel}>Fix:</span>
                      {issue.suggested_fix}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ResultPanel

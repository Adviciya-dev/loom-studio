import { useState } from 'react'
import { Search } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import type { CqcIssue } from '@/types'
import styles from './CqcLogPanel.module.css'

type Filter = 'all' | 'approved' | 'rejected'

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('en', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  } catch {
    return iso
  }
}

function parseIssues(json: string): CqcIssue[] {
  try {
    return JSON.parse(json) as CqcIssue[]
  } catch {
    return []
  }
}

function CqcLogPanel() {
  const { state } = useApp()
  const { cqcLog, cqcClients } = state

  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const clientMap = Object.fromEntries(cqcClients.map((c) => [c.id, c.name]))

  const filtered = cqcLog.filter((e) => {
    if (filter === 'approved' && !e.approved) return false
    if (filter === 'rejected' && e.approved) return false
    if (search) {
      const q = search.toLowerCase()
      const clientN = (clientMap[e.client_id] ?? e.client_id).toLowerCase()
      if (
        !e.content_preview.toLowerCase().includes(q) &&
        !clientN.includes(q) &&
        !e.user.toLowerCase().includes(q) &&
        !e.summary.toLowerCase().includes(q)
      )
        return false
    }
    return true
  })

  const total = cqcLog.length
  const approved = cqcLog.filter((e) => e.approved).length
  const rejected = total - approved

  return (
    <div className={styles.root}>
      {/* Stats */}
      <div className={styles.statsBar}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{total}</span>
          <span className={styles.statLabel}>Total</span>
        </div>
        <div className={styles.divider} />
        <div className={`${styles.stat} ${styles.statApproved}`}>
          <span className={styles.statValue}>{approved}</span>
          <span className={styles.statLabel}>Approved</span>
        </div>
        <div className={styles.divider} />
        <div className={`${styles.stat} ${styles.statRejected}`}>
          <span className={styles.statValue}>{rejected}</span>
          <span className={styles.statLabel}>Rejected</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <Search size={13} strokeWidth={2} className={styles.searchIcon} />
          <input
            className={styles.search}
            placeholder="Search entries…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className={styles.filterChips}>
          {(['all', 'approved', 'rejected'] as Filter[]).map((f) => (
            <button
              key={f}
              className={`${styles.chip} ${filter === f ? styles.chipActive : ''}`}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className={styles.list}>
        {filtered.length === 0 && (
          <div className={styles.empty}>No log entries{search ? ' matching your search' : ''}</div>
        )}
        {filtered.map((entry) => {
          const isExpanded = expanded === entry.id
          const issues = parseIssues(entry.issues_json)
          const highCount = issues.filter((i) => i.severity === 'high').length
          const medCount = issues.filter((i) => i.severity === 'medium').length
          const lowCount = issues.filter((i) => i.severity === 'low').length

          return (
            <div key={entry.id} className={styles.entry}>
              <div
                className={styles.entryHeader}
                onClick={() => setExpanded(isExpanded ? null : entry.id)}
              >
                <div
                  className={`${styles.entryStatus} ${entry.approved ? styles.statusApproved : styles.statusRejected}`}
                />
                <span className={styles.entryClient}>
                  {clientMap[entry.client_id] ?? entry.client_id}
                </span>
                <span className={styles.entryPreview}>{entry.content_preview}</span>
                <div className={styles.entryMeta}>
                  {entry.user && <span className={styles.entryUser}>{entry.user}</span>}
                  {entry.issue_count > 0 && (
                    <span
                      className={`${styles.entryCount} ${entry.issue_count > 0 && highCount > 0 ? styles.entryCountHigh : ''}`}
                    >
                      {entry.issue_count} issue{entry.issue_count !== 1 ? 's' : ''}
                    </span>
                  )}
                  <span className={styles.entryDate}>{formatDate(entry.created_at)}</span>
                </div>
              </div>

              {isExpanded && (
                <div className={styles.entryDetail}>
                  {entry.summary && <div className={styles.entrySummary}>{entry.summary}</div>}
                  {issues.length > 0 && (
                    <div className={styles.issueChips}>
                      {highCount > 0 && (
                        <span className={`${styles.issueChip} ${styles.issueChipHigh}`}>
                          {highCount} high
                        </span>
                      )}
                      {medCount > 0 && (
                        <span className={`${styles.issueChip} ${styles.issueChipMedium}`}>
                          {medCount} medium
                        </span>
                      )}
                      {lowCount > 0 && (
                        <span className={`${styles.issueChip} ${styles.issueChipLow}`}>
                          {lowCount} low
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default CqcLogPanel

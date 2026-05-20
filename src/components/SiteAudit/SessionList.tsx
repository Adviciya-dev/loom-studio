import { Globe } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { auditReadReport } from '@/lib/audit'
import type { AuditSession, AuditPhase } from '@/types'
import styles from './SessionList.module.css'

function relativeDate(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  const diffWeeks = Math.floor(diffDays / 7)
  if (diffWeeks === 1) return '1 week ago'
  if (diffWeeks < 5) return `${diffWeeks} weeks ago`
  const diffMonths = Math.floor(diffDays / 30)
  return diffMonths === 1 ? '1 month ago' : `${diffMonths} months ago`
}

const PHASE_LABEL: Record<AuditPhase, string> = {
  intake: 'Intake',
  running: 'Running',
  done: 'Done',
  cancelled: 'Cancelled',
  report: 'Report',
  goals: 'Goals',
  complete: 'Complete',
}

const BADGE_CLASS: Record<AuditPhase, string> = {
  intake: styles.badgeIntake,
  running: styles.badgeRunning,
  done: styles.badgeComplete,
  cancelled: styles.badgeCancelled,
  report: styles.badgeReport,
  goals: styles.badgeGoals,
  complete: styles.badgeComplete,
}

interface SessionCardProps {
  session: AuditSession
  isActive: boolean
  onClick: () => void
}

function SessionCard({ session, isActive, onClick }: SessionCardProps) {
  const displayName = session.siteName || 'Untitled Audit'
  const displayUrl = session.siteUrl || '—'

  return (
    <div
      className={`${styles.card} ${isActive ? styles.cardActive : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      <div className={styles.siteName}>{displayName}</div>
      <div className={styles.siteUrl} title={displayUrl}>
        {displayUrl}
      </div>
      <div className={styles.meta}>
        <span className={`${styles.badge} ${BADGE_CLASS[session.phase]}`}>
          {PHASE_LABEL[session.phase]}
        </span>
        <span className={styles.relDate}>{relativeDate(session.createdAt)}</span>
      </div>
    </div>
  )
}

interface EmptyStateProps {
  onNewAudit: () => void
  disabled: boolean
}

function EmptyState({ onNewAudit, disabled }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <Globe size={32} strokeWidth={1.25} style={{ opacity: 0.2 }} />
      <span className={styles.emptyTitle}>No audits yet</span>
      <span className={styles.emptyHint}>
        Start your first site audit to get a full health report.
      </span>
      <button
        className={styles.emptyBtn}
        onClick={onNewAudit}
        disabled={disabled}
        title={disabled ? 'Open a project first' : undefined}
      >
        + New Audit
      </button>
    </div>
  )
}

interface SessionListProps {
  onNewAudit: () => void
  disabled: boolean
}

export function SessionList({ onNewAudit, disabled }: SessionListProps) {
  const { state, dispatch } = useApp()
  const { activeProject, auditSessions, activeAuditSession } = state

  function handleSessionClick(session: AuditSession) {
    dispatch({ type: 'AUDIT_ACTIVE_SESSION_SET', payload: session })
    // Restore report markdown for sessions that already have a report on disk.
    // Don't gate on session.reportPath — it may be null even when report.md exists.
    if (['report', 'goals', 'complete'].includes(session.phase) && activeProject) {
      auditReadReport(activeProject.path, session.id)
        .then((markdown) =>
          dispatch({ type: 'AUDIT_REPORT_READY', payload: { reportPath: '', markdown } })
        )
        .catch(() => {}) // report.md simply doesn't exist yet — silently ignore
    }
  }

  if (auditSessions.length === 0) {
    return <EmptyState onNewAudit={onNewAudit} disabled={disabled} />
  }

  return (
    <div className={styles.list}>
      {auditSessions.map((s) => (
        <SessionCard
          key={s.id}
          session={s}
          isActive={activeAuditSession?.id === s.id}
          onClick={() => handleSessionClick(s)}
        />
      ))}
    </div>
  )
}

import { useApp } from '@/context/AppContext'
import { auditStart, auditCancel, auditGenerateReport } from '@/lib/audit'
import { DimensionRow } from './DimensionRow'
import styles from './AuditProgress.module.css'

export function AuditProgress() {
  const { state, dispatch } = useApp()
  const { activeProject, activeAuditSession, auditPhase, auditDimensions } = state

  async function handleStart() {
    if (!activeProject || !activeAuditSession) return
    dispatch({ type: 'AUDIT_STARTED' })
    await auditStart(activeProject.path, activeAuditSession.id).catch(() => {})
  }

  function handleCancel() {
    if (!activeAuditSession) return
    dispatch({
      type: 'LOG_APPEND',
      line: {
        timestamp: new Date().toLocaleTimeString('en', { hour12: false }),
        level: 'WARN',
        content: 'Cancelling audit — stopping active workers…',
      },
    })
    dispatch({ type: 'AUDIT_CANCELLED' })
    auditCancel(activeAuditSession.id).catch(() => {})
  }

  function handleRerun() {
    if (!window.confirm('This will delete all existing audit data for this session. Continue?'))
      return
    handleStart()
  }

  async function handleGenerateReport() {
    if (!activeProject || !activeAuditSession) return
    // Transition to ReportViewer first so the loading state is visible
    dispatch({ type: 'AUDIT_REPORT_STARTED' })
    dispatch({ type: 'AUDIT_PHASE_SET', payload: 'report' })
    try {
      await auditGenerateReport(activeProject.path, activeAuditSession.id)
    } catch (err) {
      dispatch({ type: 'AUDIT_REPORT_FAILED', payload: String(err) })
    }
  }

  const isRunning = auditPhase === 'running'
  const isDoneOrCancelled = auditPhase === 'done' || auditPhase === 'cancelled'
  const canGenerateReport =
    auditPhase === 'done' || auditDimensions.some((d) => d.status === 'done')

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>Phase 2 — Audit Execution</span>
        {activeAuditSession && (
          <span className={styles.headerSub}>
            {activeAuditSession.siteName || activeAuditSession.siteUrl}
          </span>
        )}
      </div>

      <div className={styles.actions}>
        {!isRunning && (
          <button
            className={styles.startBtn}
            onClick={handleStart}
            disabled={!activeAuditSession || auditPhase === 'intake'}
          >
            ▶ Start Audit
          </button>
        )}
        {isRunning && (
          <button className={styles.cancelBtn} onClick={handleCancel}>
            ⏹ Cancel
          </button>
        )}
        {isDoneOrCancelled && (
          <button className={styles.rerunBtn} onClick={handleRerun}>
            ↺ Re-run
          </button>
        )}
        {isRunning && <span className={styles.estimatedTime}>Estimated time: 2–4 minutes</span>}
      </div>

      <div className={styles.dimensionList}>
        {auditDimensions.length === 0 ? (
          <div className={styles.dimEmpty}>Start the audit to see dimension progress.</div>
        ) : (
          auditDimensions.map((d) => <DimensionRow key={d.key} dimension={d} />)
        )}
      </div>

      <div className={styles.footer}>
        <button
          className={styles.reportBtn}
          onClick={handleGenerateReport}
          disabled={!canGenerateReport}
        >
          Generate Report ▶
        </button>
      </div>
    </div>
  )
}

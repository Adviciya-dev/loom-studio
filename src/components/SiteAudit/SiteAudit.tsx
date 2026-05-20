import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { Plus } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { auditListSessions, auditReadReport } from '@/lib/audit'
import type { AuditSession, AuditDimensionStatus } from '@/types'
import { SessionList } from './SessionList'
import { IntakeForm } from './IntakeForm'
import { AuditProgress } from './AuditProgress'
import { ReportViewer } from './ReportViewer'
import { GoalPlanner } from './GoalPlanner'
import styles from './SiteAudit.module.css'

export function SiteAudit() {
  const { state, dispatch } = useApp()
  const { activeProject, activeAuditSession, auditPhase, auditReportGenerating } = state

  // Load session list when project changes
  useEffect(() => {
    if (!activeProject) return
    auditListSessions(activeProject.path)
      .then((sessions) => dispatch({ type: 'AUDIT_SESSIONS_LOADED', payload: sessions }))
      .catch(() => {})
  }, [activeProject?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Phase 2 audit execution listeners ──────────────────────────────────────
  // Registered here (not in AuditProgress) so they're ready before the first
  // event fires — AuditProgress's useEffect runs after paint and misses the
  // fast initial batch of dimension-status events from the Go engine.
  useEffect(() => {
    const unlistens: Array<Promise<() => void>> = [
      listen<AuditDimensionStatus>('audit_dimension_status', ({ payload }) => {
        dispatch({ type: 'AUDIT_DIMENSION_STATUS', payload })
      }),
      listen<{ sessionId: string }>('audit_completed', () => {
        dispatch({ type: 'AUDIT_COMPLETED' })
      }),
      listen<{ sessionId: string }>('audit_cancelled', () => {
        dispatch({ type: 'AUDIT_CANCELLED' })
      }),
    ]
    const fns: Array<() => void> = []
    unlistens.forEach((p) => p.then((fn) => fns.push(fn)))
    return () => fns.forEach((fn) => fn())
  }, [dispatch]) // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for audit_report_ready → read markdown → dispatch AUDIT_REPORT_READY
  useEffect(() => {
    const unlisten = listen<{ sessionId: string; reportPath: string }>(
      'audit_report_ready',
      async ({ payload }) => {
        if (!activeProject || payload.sessionId !== activeAuditSession?.id) return
        try {
          const markdown = await auditReadReport(activeProject.path, payload.sessionId)
          dispatch({
            type: 'AUDIT_REPORT_READY',
            payload: { reportPath: payload.reportPath, markdown },
          })
        } catch (err) {
          dispatch({ type: 'AUDIT_REPORT_FAILED', payload: String(err) })
        }
      }
    )
    return () => {
      unlisten.then((fn) => fn())
    }
  }, [activeAuditSession?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for audit_error during report generation
  useEffect(() => {
    const unlisten = listen<{ sessionId: string; dimension: string; message: string }>(
      'audit_error',
      ({ payload }) => {
        if (payload.sessionId !== activeAuditSession?.id) return
        if (auditReportGenerating) {
          dispatch({ type: 'AUDIT_REPORT_FAILED', payload: payload.message })
        }
      }
    )
    return () => {
      unlisten.then((fn) => fn())
    }
  }, [activeAuditSession?.id, auditReportGenerating]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleNewAudit() {
    if (!activeProject) return
    const sessionId = crypto.randomUUID()
    const now = new Date().toISOString()
    const newSession: AuditSession = {
      id: sessionId,
      version: 1,
      projectId: activeProject.id,
      siteName: '',
      siteUrl: '',
      createdAt: now,
      updatedAt: now,
      phase: 'intake',
      intakePath: `${activeProject.path}/audits/${sessionId}/intake.json`,
      reportPath: null,
      taskCount: 0,
    }
    dispatch({ type: 'AUDIT_SESSION_CREATED', payload: newSession })
  }

  function renderRightPanel() {
    switch (auditPhase) {
      case 'intake':
        return <IntakeForm />
      case 'running':
        return <AuditProgress />
      case 'done':
        return <AuditProgress />
      case 'cancelled':
        return <AuditProgress />
      case 'report':
        return <ReportViewer />
      case 'goals':
        return <GoalPlanner />
      case 'complete':
        return <ReportViewer />
      default:
        return <IntakeForm />
    }
  }

  return (
    <div className={styles.shell}>
      <div className={styles.leftPanel}>
        <button
          className={styles.newAuditBtn}
          onClick={handleNewAudit}
          disabled={!activeProject}
          title={!activeProject ? 'Open a project first' : undefined}
        >
          <Plus size={13} strokeWidth={2.5} />
          New Audit
        </button>
        <SessionList onNewAudit={handleNewAudit} disabled={!activeProject} />
      </div>
      <div className={styles.rightPanel}>{renderRightPanel()}</div>
    </div>
  )
}

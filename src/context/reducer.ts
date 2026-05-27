import type { AppState, AppAction } from './types'
import type { AuditDimensionStatus } from '@/types'

const AUDIT_DIMENSION_ROWS: AuditDimensionStatus[] = [
  { key: 'performance', label: 'Performance', status: 'pending', score: null, errorMessage: null },
  { key: 'seo', label: 'SEO On-page', status: 'pending', score: null, errorMessage: null },
  {
    key: 'accessibility',
    label: 'Accessibility',
    status: 'pending',
    score: null,
    errorMessage: null,
  },
  {
    key: 'technical',
    label: 'Technical Health',
    status: 'pending',
    score: null,
    errorMessage: null,
  },
  {
    key: 'code_quality',
    label: 'Code Quality',
    status: 'pending',
    score: null,
    errorMessage: null,
  },
  { key: 'content', label: 'Content & Copy', status: 'pending', score: null, errorMessage: null },
  {
    key: 'competitors',
    label: 'Competitor Gap',
    status: 'pending',
    score: null,
    errorMessage: null,
  },
  { key: 'security', label: 'Security', status: 'pending', score: null, errorMessage: null },
]

export function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_PROJECTS':
      return { ...state, projects: action.projects }

    case 'REMOVE_PROJECT': {
      const projects = state.projects.filter((p) => p.id !== action.id)
      const activeProject = state.activeProject?.id === action.id ? null : state.activeProject
      return { ...state, projects, activeProject }
    }

    case 'SET_ACTIVE_PROJECT':
      return {
        ...state,
        activeProject: action.project,
        harnessEmpty: false,
        gitBranch: null,
        gitBranches: [],
        gitRemoteUrl: null,
        gitAhead: 0,
        gitBehind: 0,
      }

    case 'SET_HARNESS_EMPTY':
      return { ...state, harnessEmpty: action.empty }

    case 'ADD_TASK': {
      const already = state.activeTasks.find((t) => t.id === action.task.id)
      if (already) {
        return { ...state, activeTaskIndex: state.activeTasks.indexOf(already) }
      }
      return {
        ...state,
        activeTasks: [...state.activeTasks, { ...action.task, status: 'in-progress' }],
        activeTaskIndex: state.activeTasks.length,
      }
    }

    case 'SET_ACTIVE_TASK':
      return { ...state, activeTaskIndex: action.index }

    case 'REMOVE_TASK': {
      const next = state.activeTasks.filter((t) => t.id !== action.taskId)
      return {
        ...state,
        activeTasks: next,
        activeTaskIndex: Math.min(state.activeTaskIndex, Math.max(0, next.length - 1)),
      }
    }

    case 'OPEN_TASK_MODAL':
      return { ...state, taskModalOpen: true }

    case 'CLOSE_TASK_MODAL':
      return { ...state, taskModalOpen: false }

    case 'SET_ENGINE_STATUS':
      return { ...state, engineStatus: action.status }

    case 'LOG_APPEND':
      return { ...state, logLines: [...state.logLines, action.line] }

    case 'LOG_CLEAR':
      return { ...state, logLines: [] }

    case 'SET_PENDING_DIFF':
      return {
        ...state,
        pendingDiff: action.diff,
        diffError: null,
        engineStatus: 'awaiting_approval',
      }

    case 'CLEAR_PENDING_DIFF':
      return { ...state, pendingDiff: null, diffError: null }

    case 'COMPLETE_TASK': {
      const updated = state.activeTasks.map((t) =>
        t.id === action.taskId
          ? {
              ...t,
              status: 'completed' as const,
              commitHash: action.commitHash,
              steps: t.steps.map((s) => ({ ...s, done: true })),
            }
          : t
      )
      return { ...state, activeTasks: updated, engineStatus: 'idle' }
    }

    case 'SHOW_TOAST':
      return { ...state, toastMessage: action.message }

    case 'HIDE_TOAST':
      return { ...state, toastMessage: null }

    case 'SET_ENGINE_ERROR':
      return { ...state, engineError: action.message }

    case 'CLEAR_ENGINE_ERROR':
      return { ...state, engineError: null }

    case 'SET_DIFF_ERROR':
      return { ...state, diffError: action.message }

    case 'CLEAR_DIFF_ERROR':
      return { ...state, diffError: null }

    case 'SET_GIT_INFO':
      return { ...state, gitBranch: action.branch, gitBranches: action.branches }

    case 'SET_GIT_REMOTE_INFO':
      return {
        ...state,
        gitRemoteUrl: action.url || null,
        gitAhead: action.ahead,
        gitBehind: action.behind,
      }

    case 'SET_GIT_SSH_ERROR':
      return { ...state, gitSshError: action.value }

    case 'SET_APP_MODE':
      return { ...state, appMode: action.mode }

    case 'TOGGLE_HARNESS_EXPLORER':
      return { ...state, harnessExplorerOpen: !state.harnessExplorerOpen }

    case 'SET_GH_AVAILABLE':
      return { ...state, ghAvailable: action.available }

    case 'SET_GH_DEFAULT_BRANCH':
      return { ...state, ghDefaultBranch: action.branch }

    case 'SET_GIT_COMMITS_ON_BRANCH':
      return { ...state, gitCommitsOnBranch: action.commits }

    case 'SET_GIT_BRANCH_PUSHED':
      return { ...state, gitBranchPushed: action.pushed }

    case 'SET_GH_OPEN_PRS':
      return { ...state, ghOpenPrs: action.prs }

    case 'SET_CUSTOM_TEMPLATES':
      return { ...state, customTemplates: action.templates ?? [] }

    case 'SET_TEST_CASES':
      return { ...state, testCases: action.cases }

    case 'SET_TEST_STATUS':
      return {
        ...state,
        testStatuses: { ...state.testStatuses, [action.testId]: action.status },
      }

    case 'SET_TEST_RUN_RESULT':
      return { ...state, testRunResult: action.result, isRunningTests: false }

    case 'SET_IS_RUNNING_TESTS':
      return { ...state, isRunningTests: action.value }

    case 'CLEAR_TEST_RESULTS':
      return { ...state, testStatuses: {}, testRunResult: null, isRunningTests: false }

    case 'SET_GLOBAL_CQC_PATH':
      return { ...state, globalCqcPath: action.path }

    case 'SET_CQC_CLIENTS':
      return { ...state, cqcClients: action.clients }

    case 'SET_CQC_SELECTED_CLIENT_ID':
      return { ...state, cqcSelectedClientId: action.id }

    case 'SET_CQC_ACTIVE_CHECK':
      return { ...state, cqcActiveCheck: action.result }

    case 'SET_CQC_CHECK_RUNNING':
      return { ...state, cqcCheckRunning: action.running }

    case 'SET_CQC_PROGRESS_STEP':
      return { ...state, cqcProgressStep: action.step }

    case 'SET_CQC_LOG':
      return { ...state, cqcLog: action.entries }

    case 'SET_CQC_USER':
      return { ...state, cqcUser: action.user }

    case 'SET_CQC_SUB_VIEW':
      return { ...state, cqcSubView: action.view }

    // ── Site Audit ────────────────────────────────────────────────────────
    case 'AUDIT_SESSIONS_LOADED':
      return { ...state, auditSessions: action.payload }

    case 'AUDIT_SESSION_CREATED':
      return {
        ...state,
        auditSessions: [action.payload, ...state.auditSessions],
        activeAuditSession: action.payload,
        auditPhase: 'intake',
      }

    case 'AUDIT_ACTIVE_SESSION_SET':
      return {
        ...state,
        activeAuditSession: action.payload,
        auditPhase: action.payload.phase,
        auditReport: null,
        auditReportGenerating: false,
        auditReportError: null,
        auditDimensions: AUDIT_DIMENSION_ROWS.map((r) => ({ ...r })),
        auditLog: [],
      }

    case 'AUDIT_INTAKE_SAVED':
      return state

    case 'AUDIT_STARTED':
      return {
        ...state,
        auditPhase: 'running',
        auditLog: [],
        auditDimensions: AUDIT_DIMENSION_ROWS.map((r) => ({ ...r })),
        activeAuditSession: state.activeAuditSession
          ? { ...state.activeAuditSession, phase: 'running' as const }
          : null,
      }

    case 'AUDIT_DIMENSION_STATUS': {
      const updated = state.auditDimensions.map((d) =>
        d.key === action.payload.key ? action.payload : d
      )
      return { ...state, auditDimensions: updated }
    }

    case 'AUDIT_LOG_LINE': {
      const MAX_LINES = 500
      const newLog = [...state.auditLog, action.payload]
      return {
        ...state,
        auditLog: newLog.length > MAX_LINES ? newLog.slice(newLog.length - MAX_LINES) : newLog,
      }
    }

    case 'AUDIT_COMPLETED': {
      const session = state.activeAuditSession
        ? { ...state.activeAuditSession, phase: 'done' as const }
        : null
      return {
        ...state,
        auditPhase: 'done',
        activeAuditSession: session,
      }
    }

    case 'AUDIT_CANCELLED': {
      const session = state.activeAuditSession
        ? { ...state.activeAuditSession, phase: 'cancelled' as const }
        : null
      return {
        ...state,
        auditPhase: 'cancelled',
        activeAuditSession: session,
      }
    }

    case 'AUDIT_REPORT_STARTED':
      return { ...state, auditReportGenerating: true, auditReportError: null }

    case 'AUDIT_REPORT_FAILED':
      return { ...state, auditReportGenerating: false, auditReportError: action.payload }

    case 'AUDIT_PHASE_SET':
      return {
        ...state,
        auditPhase: action.payload,
        activeAuditSession: state.activeAuditSession
          ? { ...state.activeAuditSession, phase: action.payload }
          : null,
      }

    case 'AUDIT_REPORT_READY': {
      const updatedSession = state.activeAuditSession
        ? {
            ...state.activeAuditSession,
            reportPath: action.payload.reportPath,
            phase: 'report' as const,
          }
        : null
      return {
        ...state,
        auditPhase: 'report',
        auditReportGenerating: false,
        auditReportError: null,
        auditReport: action.payload.markdown,
        activeAuditSession: updatedSession,
        auditSessions: state.auditSessions.map((s) =>
          s.id === state.activeAuditSession?.id
            ? { ...s, phase: 'report' as const, reportPath: action.payload.reportPath }
            : s
        ),
      }
    }

    case 'AUDIT_GOALS_READY':
      return { ...state, auditPhase: 'goals' }

    case 'AUDIT_GOAL_TASK_UPDATED':
      return state

    case 'AUDIT_GOAL_TASK_REMOVED':
      return state

    case 'AUDIT_TASKS_SAVED': {
      if (!state.activeAuditSession) return state
      const updated = {
        ...state.activeAuditSession,
        phase: 'complete' as const,
        taskCount: state.activeAuditSession.taskCount + action.payload.count,
      }
      const sessions = state.auditSessions.map((s) => (s.id === updated.id ? updated : s))
      return {
        ...state,
        activeAuditSession: updated,
        auditSessions: sessions,
      }
    }

    default:
      return state
  }
}

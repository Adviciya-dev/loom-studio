import type {
  Project,
  Task,
  EngineStatus,
  LogLine,
  DiffPayload,
  HarnessTemplate,
  TestCase,
  TestCaseStatus,
  TestRunResult,
  CqcClient,
  CqcCheckResult,
  CqcLogEntry,
  CqcProgressStep,
  CqcSubView,
  AuditSession,
  AuditPhase,
  AuditIntake,
  AuditDimensionStatus,
  GoalTask,
} from '@/types'

export interface AppState {
  projects: Project[]
  activeProject: Project | null
  harnessEmpty: boolean
  activeTasks: Task[]
  activeTaskIndex: number
  taskModalOpen: boolean
  engineStatus: EngineStatus
  logLines: LogLine[]
  pendingDiff: DiffPayload | null
  diffError: string | null
  engineError: string | null
  toastMessage: string | null
  gitBranch: string | null
  gitBranches: string[]
  gitRemoteUrl: string | null
  gitAhead: number
  gitBehind: number
  gitSshError: boolean
  appMode: 'run' | 'harness' | 'qa' | 'github' | 'cqc' | 'audit'
  harnessExplorerOpen: boolean
  ghAvailable: boolean | null
  ghDefaultBranch: string
  gitCommitsOnBranch: string[]
  gitBranchPushed: boolean | null
  ghOpenPrs: GhPrItem[]
  customTemplates: HarnessTemplate[]
  testCases: TestCase[]
  testStatuses: Record<string, TestCaseStatus>
  testRunResult: TestRunResult | null
  isRunningTests: boolean
  // Site Audit
  auditSessions: AuditSession[]
  activeAuditSession: AuditSession | null
  auditPhase: AuditPhase
  auditDimensions: AuditDimensionStatus[]
  auditLog: LogLine[]
  auditReport: string | null
  auditReportGenerating: boolean
  auditReportError: string | null
  // CQC
  globalCqcPath: string
  cqcClients: CqcClient[]
  cqcSelectedClientId: string | null
  cqcActiveCheck: CqcCheckResult | null
  cqcCheckRunning: boolean
  cqcProgressStep: CqcProgressStep | null
  cqcLog: CqcLogEntry[]
  cqcUser: string
  cqcSubView: CqcSubView
}

export interface GhPrItem {
  number: number
  title: string
  headRefName: string
  state: string
  url: string
}

export const initialState: AppState = {
  projects: [],
  activeProject: null,
  harnessEmpty: false,
  activeTasks: [],
  activeTaskIndex: 0,
  taskModalOpen: false,
  engineStatus: 'idle',
  logLines: [],
  pendingDiff: null,
  diffError: null,
  engineError: null,
  toastMessage: null,
  gitBranch: null,
  gitBranches: [],
  gitRemoteUrl: null,
  gitAhead: 0,
  gitBehind: 0,
  gitSshError: false,
  appMode: 'run',
  harnessExplorerOpen: true,
  ghAvailable: null,
  ghDefaultBranch: '',
  gitCommitsOnBranch: [],
  gitBranchPushed: null,
  ghOpenPrs: [],
  customTemplates: [],
  testCases: [],
  testStatuses: {},
  testRunResult: null,
  isRunningTests: false,
  auditSessions: [],
  activeAuditSession: null,
  auditPhase: 'intake',
  auditDimensions: [],
  auditLog: [],
  auditReport: null,
  auditReportGenerating: false,
  auditReportError: null,
  globalCqcPath: '',
  cqcClients: [],
  cqcSelectedClientId: null,
  cqcActiveCheck: null,
  cqcCheckRunning: false,
  cqcProgressStep: null,
  cqcLog: [],
  cqcUser: '',
  cqcSubView: 'check',
}

export type AppAction =
  | { type: 'SET_PROJECTS'; projects: Project[] }
  | { type: 'REMOVE_PROJECT'; id: string }
  | { type: 'SET_ACTIVE_PROJECT'; project: Project | null }
  | { type: 'SET_HARNESS_EMPTY'; empty: boolean }
  | { type: 'ADD_TASK'; task: Task }
  | { type: 'SET_ACTIVE_TASK'; index: number }
  | { type: 'REMOVE_TASK'; taskId: string }
  | { type: 'OPEN_TASK_MODAL' }
  | { type: 'CLOSE_TASK_MODAL' }
  | { type: 'SET_ENGINE_STATUS'; status: EngineStatus }
  | { type: 'LOG_APPEND'; line: LogLine }
  | { type: 'LOG_CLEAR' }
  | { type: 'SET_PENDING_DIFF'; diff: DiffPayload }
  | { type: 'CLEAR_PENDING_DIFF' }
  | { type: 'COMPLETE_TASK'; taskId: string; commitHash: string }
  | { type: 'SHOW_TOAST'; message: string }
  | { type: 'HIDE_TOAST' }
  | { type: 'SET_ENGINE_ERROR'; message: string }
  | { type: 'CLEAR_ENGINE_ERROR' }
  | { type: 'SET_DIFF_ERROR'; message: string }
  | { type: 'CLEAR_DIFF_ERROR' }
  | { type: 'SET_GIT_INFO'; branch: string; branches: string[] }
  | { type: 'SET_GIT_REMOTE_INFO'; url: string; ahead: number; behind: number }
  | { type: 'SET_GIT_SSH_ERROR'; value: boolean }
  | { type: 'SET_APP_MODE'; mode: 'run' | 'harness' | 'qa' | 'github' | 'cqc' | 'audit' }
  | { type: 'TOGGLE_HARNESS_EXPLORER' }
  | { type: 'SET_GH_AVAILABLE'; available: boolean }
  | { type: 'SET_GH_DEFAULT_BRANCH'; branch: string }
  | { type: 'SET_GIT_COMMITS_ON_BRANCH'; commits: string[] }
  | { type: 'SET_GIT_BRANCH_PUSHED'; pushed: boolean }
  | { type: 'SET_GH_OPEN_PRS'; prs: GhPrItem[] }
  | { type: 'SET_CUSTOM_TEMPLATES'; templates: HarnessTemplate[] }
  | { type: 'SET_TEST_CASES'; cases: TestCase[] }
  | { type: 'SET_TEST_STATUS'; testId: string; status: TestCaseStatus }
  | { type: 'SET_TEST_RUN_RESULT'; result: TestRunResult }
  | { type: 'SET_IS_RUNNING_TESTS'; value: boolean }
  | { type: 'CLEAR_TEST_RESULTS' }
  // Site Audit — Phase 3 report
  | { type: 'AUDIT_REPORT_STARTED' }
  | { type: 'AUDIT_REPORT_FAILED'; payload: string }
  | { type: 'AUDIT_PHASE_SET'; payload: AuditPhase }
  // Site Audit — intake
  | { type: 'AUDIT_SESSION_CREATED'; payload: AuditSession }
  | { type: 'AUDIT_INTAKE_SAVED'; payload: AuditIntake }
  // Site Audit — execution
  | { type: 'AUDIT_STARTED' }
  | { type: 'AUDIT_DIMENSION_STATUS'; payload: AuditDimensionStatus }
  | { type: 'AUDIT_LOG_LINE'; payload: LogLine }
  | { type: 'AUDIT_COMPLETED' }
  | { type: 'AUDIT_CANCELLED' }
  // Site Audit — report
  | { type: 'AUDIT_REPORT_READY'; payload: { reportPath: string; markdown: string } }
  // Site Audit — goals
  | { type: 'AUDIT_GOALS_READY'; payload: GoalTask[] }
  | { type: 'AUDIT_GOAL_TASK_UPDATED'; payload: GoalTask }
  | { type: 'AUDIT_GOAL_TASK_REMOVED'; payload: string }
  | { type: 'AUDIT_TASKS_SAVED'; payload: { count: number } }
  // Site Audit — session management
  | { type: 'AUDIT_SESSIONS_LOADED'; payload: AuditSession[] }
  | { type: 'AUDIT_ACTIVE_SESSION_SET'; payload: AuditSession }
  // CQC
  | { type: 'SET_GLOBAL_CQC_PATH'; path: string }
  | { type: 'SET_CQC_CLIENTS'; clients: CqcClient[] }
  | { type: 'SET_CQC_SELECTED_CLIENT_ID'; id: string | null }
  | { type: 'SET_CQC_ACTIVE_CHECK'; result: CqcCheckResult | null }
  | { type: 'SET_CQC_CHECK_RUNNING'; running: boolean }
  | { type: 'SET_CQC_PROGRESS_STEP'; step: CqcProgressStep | null }
  | { type: 'SET_CQC_LOG'; entries: CqcLogEntry[] }
  | { type: 'SET_CQC_USER'; user: string }
  | { type: 'SET_CQC_SUB_VIEW'; view: CqcSubView }

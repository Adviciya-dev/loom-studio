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
  appMode: 'run' | 'harness' | 'qa' | 'github'
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
  | { type: 'SET_APP_MODE'; mode: 'run' | 'harness' | 'qa' | 'github' }
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

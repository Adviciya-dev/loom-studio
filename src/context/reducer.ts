import type { AppState, AppAction } from './types'

export function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_PROJECTS':
      return { ...state, projects: action.projects }

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

    default:
      return state
  }
}

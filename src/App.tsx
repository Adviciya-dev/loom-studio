import { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { AppProvider, useApp } from '@/context/AppContext'
import { ErrorBoundary } from '@/ErrorBoundary'
import { engineCommand } from '@/lib/ipc'
import {
  onProjects,
  onLogLine,
  onTaskComplete,
  onEngineError,
  onEngineReady,
  onDiffReady,
  onEngineStatus,
  onStoreReset,
  onGitInfo,
  onGitCommitted,
  onGitRemoteInfo,
  onSshUnlocked,
  onTestStatus,
  onTestRunStarted,
  onTestRunComplete,
} from '@/lib/events'
import Sidebar from '@/components/Sidebar/Sidebar'
import TopBar from '@/components/TopBar/TopBar'
import Workspace from '@/components/Workspace/Workspace'
import LogPanel from '@/components/Workspace/LogPanel'
import BottomBar from '@/components/BottomBar/BottomBar'
import HarnessManager from '@/components/HarnessManager/HarnessManager'
import GitHubPR from '@/components/GitHubPR/GitHubPR'
import QATestSuite from '@/components/QATestSuite/QATestSuite'
import TaskSelectModal from '@/components/TaskSelectModal/TaskSelectModal'
import DiffOverlay from '@/components/DiffOverlay/DiffOverlay'
import Toast from '@/components/Toast/Toast'
import ErrorBanner from '@/components/ErrorBanner/ErrorBanner'
import styles from './App.module.css'

function AppInner() {
  const { state, dispatch } = useApp()
  const activeProjectRef = useRef(state.activeProject)
  activeProjectRef.current = state.activeProject
  const engineStatusRef = useRef(state.engineStatus)
  engineStatusRef.current = state.engineStatus

  useEffect(() => {
    // `alive` prevents the race where cleanup runs before Promises settle:
    // cleanup sets alive=false; if a Promise resolves after cleanup it immediately
    // calls its unlisten fn instead of storing it, so no orphaned listeners exist.
    let alive = true
    const unlistens: Array<() => void> = []

    function onGlobalKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        e.preventDefault()
        dispatch({ type: 'OPEN_TASK_MODAL' })
      }
    }
    document.addEventListener('keydown', onGlobalKeyDown)

    const pending: Array<Promise<() => void>> = [
      onProjects((projects) => dispatch({ type: 'SET_PROJECTS', projects })),

      onLogLine((line) => dispatch({ type: 'LOG_APPEND', line })),

      onDiffReady((diff) => dispatch({ type: 'SET_PENDING_DIFF', diff })),

      onEngineStatus((status) => dispatch({ type: 'SET_ENGINE_STATUS', status })),

      onTaskComplete((taskId, commitHash) => {
        dispatch({ type: 'COMPLETE_TASK', taskId, commitHash })
        dispatch({ type: 'CLEAR_PENDING_DIFF' })
        dispatch({ type: 'SHOW_TOAST', message: 'Task complete — changes committed' })
        engineCommand({
          action: 'save_task_history',
          task_id: taskId,
          project_id: activeProjectRef.current?.id ?? '',
          completed_at: new Date().toISOString(),
        }).catch(() => {})
      }),

      onEngineError((message) => {
        // Missing dependency errors surface as a persistent banner, not log lines.
        if (message.startsWith('missing_dep:')) {
          dispatch({ type: 'SET_ENGINE_ERROR', message })
          return
        }
        // Diff extraction errors during awaiting_approval stay in the overlay.
        if (engineStatusRef.current === 'awaiting_approval' || message.startsWith('diff')) {
          dispatch({ type: 'SET_DIFF_ERROR', message })
          return
        }
        // SSH auth failure — surface the passphrase prompt in GitControls.
        if (message.includes('publickey') || message.includes('Permission denied')) {
          dispatch({ type: 'SET_GIT_SSH_ERROR', value: true })
        }
        dispatch({
          type: 'LOG_APPEND',
          line: {
            timestamp: new Date().toLocaleTimeString('en', { hour12: false }),
            level: 'ERROR',
            content: message,
          },
        })
        // Don't flip the engine to idle for git remote errors — Claude may still be running.
        const isGitRemoteError =
          message.startsWith('Fetch failed:') ||
          message.startsWith('Pull failed:') ||
          message.startsWith('Push failed:') ||
          message.startsWith('SSH unlock failed:')
        if (!isGitRemoteError) {
          dispatch({ type: 'SET_ENGINE_STATUS', status: 'idle' })
        }
      }),

      onStoreReset(() => {
        dispatch({
          type: 'SHOW_TOAST',
          message: 'Settings reset — previous state could not be read',
        })
      }),

      onGitInfo(({ branch, branches }) => dispatch({ type: 'SET_GIT_INFO', branch, branches })),

      onGitCommitted(({ hash }) =>
        dispatch({ type: 'SHOW_TOAST', message: `Committed ${hash.slice(0, 7)}` })
      ),

      onGitRemoteInfo(({ url, ahead, behind }) =>
        dispatch({ type: 'SET_GIT_REMOTE_INFO', url, ahead, behind })
      ),

      onSshUnlocked(() => dispatch({ type: 'SET_GIT_SSH_ERROR', value: false })),

      onTestStatus((testId, status) => dispatch({ type: 'SET_TEST_STATUS', testId, status })),

      onTestRunStarted(() => dispatch({ type: 'SET_IS_RUNNING_TESTS', value: true })),

      onTestRunComplete((result) => dispatch({ type: 'SET_TEST_RUN_RESULT', result })),

      ...(import.meta.env.DEV
        ? [onEngineReady(() => console.log('[loom] engine ready'))] // eslint-disable-line no-console
        : []),
    ]

    pending.forEach((p) =>
      p.then((fn) => {
        if (alive) unlistens.push(fn)
        else fn() // cleanup already ran — unlisten immediately
      })
    )

    engineCommand({ action: 'get_projects' }).catch(() => {})

    return () => {
      alive = false
      unlistens.forEach((fn) => fn())
      document.removeEventListener('keydown', onGlobalKeyDown)
    }
  }, [dispatch])

  // Only check gh availability on project change — default branch and PR list
  // load lazily inside GitHubPR when the user opens that tab.
  useEffect(() => {
    if (!state.activeProject) return
    invoke<boolean>('gh_check')
      .then((available) => dispatch({ type: 'SET_GH_AVAILABLE', available }))
      .catch(() => {})
  }, [state.activeProject?.id, dispatch]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={styles.app}>
      <Sidebar />
      <div className={styles.main}>
        <ErrorBanner />
        <TopBar />
        <div className={styles.content}>
          {state.appMode === 'harness' ? (
            <HarnessManager />
          ) : state.appMode === 'github' ? (
            <GitHubPR />
          ) : state.appMode === 'qa' ? (
            <QATestSuite />
          ) : (
            <Workspace />
          )}
        </div>
        {state.appMode === 'run' && <BottomBar />}
        <LogPanel />
      </div>
      <TaskSelectModal />
      <DiffOverlay />
      <Toast />
    </div>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <AppInner />
      </AppProvider>
    </ErrorBoundary>
  )
}

export default App

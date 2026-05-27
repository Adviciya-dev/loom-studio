import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { AppProvider, useApp } from '@/context/AppContext'
import { ErrorBoundary } from '@/ErrorBoundary'
import { engineCommand } from '@/lib/ipc'
import {
  onProjects,
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
  onCqcClients,
  onCqcCheckResult,
  onCqcLog,
  onCqcProgress,
  onCqcCheckError,
} from '@/lib/events'
import Sidebar from '@/components/Sidebar/Sidebar'
import TopBar from '@/components/TopBar/TopBar'
import Workspace from '@/components/Workspace/Workspace'
import LogPanel from '@/components/Workspace/LogPanel'
import BottomBar from '@/components/BottomBar/BottomBar'
import HarnessManager from '@/components/HarnessManager/HarnessManager'
import GitHubPR from '@/components/GitHubPR/GitHubPR'
import QATestSuite from '@/components/QATestSuite/QATestSuite'
import ContentQualityChecker from '@/components/ContentQualityChecker/ContentQualityChecker'
import { SiteAudit } from '@/components/SiteAudit/SiteAudit'
import TaskSelectModal from '@/components/TaskSelectModal/TaskSelectModal'
import DiffOverlay from '@/components/DiffOverlay/DiffOverlay'
import Toast from '@/components/Toast/Toast'
import ErrorBanner from '@/components/ErrorBanner/ErrorBanner'
import UpdateBanner from '@/components/UpdateBanner/UpdateBanner'
import styles from './App.module.css'

function AppInner() {
  const { state, dispatch } = useApp()
  const activeProjectRef = useRef(state.activeProject)
  activeProjectRef.current = state.activeProject
  const engineStatusRef = useRef(state.engineStatus)
  engineStatusRef.current = state.engineStatus

  // ── Log panel open/tab state (lifted so BottomBar can drive it) ──
  const [logOpen, setLogOpen] = useState(true)
  const [logTab, setLogTab] = useState<'output' | 'terminal'>('output')

  function handleTogglePanel(tab: 'output' | 'terminal') {
    if (logOpen && logTab === tab) {
      setLogOpen(false)
    } else {
      setLogOpen(true)
      setLogTab(tab)
    }
  }

  // Generation counter: each effect run gets a unique number. Callbacks check
  // it before dispatching so stale listeners from a previous run (e.g. React
  // StrictMode double-invocation) silently discard events rather than causing
  // duplicate log lines.
  const genRef = useRef(0)

  useEffect(() => {
    const myGen = ++genRef.current
    const unlistens: Array<() => void> = []

    function onGlobalKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        e.preventDefault()
        dispatch({ type: 'OPEN_TASK_MODAL' })
      }
    }
    document.addEventListener('keydown', onGlobalKeyDown)

    // Guard: if a stale listener fires after a new effect run has started, ignore it.
    function guard<T>(cb: (v: T) => void) {
      return (v: T) => {
        if (genRef.current === myGen) cb(v)
      }
    }
    function guardVoid(cb: () => void) {
      return () => {
        if (genRef.current === myGen) cb()
      }
    }

    const pending: Array<Promise<() => void>> = [
      onProjects(guard((projects) => dispatch({ type: 'SET_PROJECTS', projects }))),

      onDiffReady(guard((diff) => dispatch({ type: 'SET_PENDING_DIFF', diff }))),

      onEngineStatus(guard((status) => dispatch({ type: 'SET_ENGINE_STATUS', status }))),

      onTaskComplete((taskId, commitHash) => {
        if (genRef.current !== myGen) return
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

      onEngineError(
        guard((message) => {
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
        })
      ),

      onStoreReset(
        guardVoid(() => {
          dispatch({
            type: 'SHOW_TOAST',
            message: 'Settings reset — previous state could not be read',
          })
        })
      ),

      onGitInfo(
        guard(({ branch, branches }) => dispatch({ type: 'SET_GIT_INFO', branch, branches }))
      ),

      onGitCommitted(
        guard(({ hash }) =>
          dispatch({ type: 'SHOW_TOAST', message: `Committed ${hash.slice(0, 7)}` })
        )
      ),

      onGitRemoteInfo(
        guard(({ url, ahead, behind }) =>
          dispatch({ type: 'SET_GIT_REMOTE_INFO', url, ahead, behind })
        )
      ),

      onSshUnlocked(guardVoid(() => dispatch({ type: 'SET_GIT_SSH_ERROR', value: false }))),

      onTestStatus((testId, status) => {
        if (genRef.current !== myGen) return
        dispatch({ type: 'SET_TEST_STATUS', testId, status })
      }),

      onTestRunStarted(guardVoid(() => dispatch({ type: 'SET_IS_RUNNING_TESTS', value: true }))),

      onTestRunComplete(guard((result) => dispatch({ type: 'SET_TEST_RUN_RESULT', result }))),

      onCqcClients(guard((clients) => dispatch({ type: 'SET_CQC_CLIENTS', clients }))),

      onCqcCheckResult(
        guard((result) => {
          dispatch({ type: 'SET_CQC_ACTIVE_CHECK', result })
          dispatch({ type: 'SET_CQC_CHECK_RUNNING', running: false })
          dispatch({ type: 'SET_CQC_PROGRESS_STEP', step: null })
          dispatch({ type: 'SET_CQC_SUB_VIEW', view: 'check-result' })
        })
      ),

      onCqcLog(guard((entries) => dispatch({ type: 'SET_CQC_LOG', entries }))),

      onCqcProgress(guard((step) => dispatch({ type: 'SET_CQC_PROGRESS_STEP', step }))),

      onCqcCheckError(
        guard((error) => {
          dispatch({ type: 'SET_CQC_CHECK_RUNNING', running: false })
          dispatch({ type: 'SET_CQC_PROGRESS_STEP', step: null })
          dispatch({
            type: 'LOG_APPEND',
            line: {
              timestamp: new Date().toLocaleTimeString('en', { hour12: false }),
              level: 'ERROR',
              content: 'CQC: ' + error,
            },
          })
        })
      ),

      ...(import.meta.env.DEV
        ? [onEngineReady(guardVoid(() => console.log('[loom] engine ready')))] // eslint-disable-line no-console
        : []),
    ]

    pending.forEach((p) =>
      p.then((fn) => {
        if (genRef.current === myGen) unlistens.push(fn)
        else fn() // stale generation — unlisten immediately
      })
    )

    engineCommand({ action: 'get_projects' }).catch(() => {})

    invoke<string>('get_global_cqc_path')
      .then((path) => {
        if (genRef.current !== myGen) return
        dispatch({ type: 'SET_GLOBAL_CQC_PATH', path })
        if (!activeProjectRef.current) {
          invoke('cqc_list_clients', { projectPath: path }).catch(() => {})
          invoke('cqc_list_log', { projectPath: path, limit: 100 }).catch(() => {})
        }
      })
      .catch(() => {})

    return () => {
      genRef.current = myGen + 1 // invalidate myGen — all callbacks from this run become stale
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
        <UpdateBanner />
        <TopBar />
        <div className={styles.content}>
          {state.appMode === 'harness' ? (
            <HarnessManager />
          ) : state.appMode === 'github' ? (
            <GitHubPR />
          ) : state.appMode === 'qa' ? (
            <QATestSuite />
          ) : state.appMode === 'cqc' ? (
            <ContentQualityChecker />
          ) : state.appMode === 'audit' ? (
            <SiteAudit />
          ) : (
            <Workspace />
          )}
        </div>
        <LogPanel
          open={logOpen}
          onOpenChange={setLogOpen}
          activeTab={logTab}
          onActiveTabChange={setLogTab}
        />
        <BottomBar logOpen={logOpen} logTab={logTab} onTogglePanel={handleTogglePanel} />
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

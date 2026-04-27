import { useApp } from '@/context/AppContext'
import { engineCommand } from '@/lib/ipc'
import styles from './RunControls.module.css'

function RunControls() {
  const { state, dispatch } = useApp()
  const { engineStatus, activeTasks, activeTaskIndex, activeProject } = state
  const activeTask = activeTasks[activeTaskIndex] ?? null

  const isCompleted = activeTask?.status === 'completed'
  const canRun =
    activeTask !== null && activeProject !== null && engineStatus === 'idle' && !isCompleted
  const isRunning = engineStatus === 'running'
  const isPaused = engineStatus === 'paused'

  async function handleRun() {
    if (!activeTask || !activeProject) return
    dispatch({ type: 'LOG_CLEAR' })
    dispatch({ type: 'SET_ENGINE_STATUS', status: 'running' })
    await engineCommand({
      action: 'start',
      task_id: activeTask.id,
      task_title: activeTask.title,
      prompt: activeTask.prompt,
      project_path: activeProject.path,
    }).catch(() => {
      dispatch({ type: 'SET_ENGINE_STATUS', status: 'idle' })
    })
  }

  async function handlePause() {
    dispatch({ type: 'SET_ENGINE_STATUS', status: 'paused' })
    await engineCommand({ action: 'pause' }).catch(() => {})
  }

  async function handleResume() {
    dispatch({ type: 'SET_ENGINE_STATUS', status: 'running' })
    await engineCommand({ action: 'resume' }).catch(() => {})
  }

  async function handleStop() {
    dispatch({ type: 'LOG_CLEAR' })
    dispatch({ type: 'SET_ENGINE_STATUS', status: 'idle' })
    await engineCommand({ action: 'kill' }).catch(() => {})
  }

  if (isRunning) {
    return (
      <div className={styles.group}>
        <button className={styles.pauseBtn} onClick={handlePause}>
          Pause
        </button>
        <button className={styles.stopBtn} onClick={handleStop}>
          Stop
        </button>
      </div>
    )
  }

  if (isPaused) {
    return (
      <div className={styles.group}>
        <button className={styles.runBtn} onClick={handleResume}>
          Resume
        </button>
        <button className={styles.stopBtn} onClick={handleStop}>
          Stop
        </button>
      </div>
    )
  }

  if (isCompleted) {
    return <span className={styles.completedLabel}>Completed</span>
  }

  return (
    <button className={styles.runBtn} onClick={handleRun} disabled={!canRun}>
      Run
    </button>
  )
}

export default RunControls

import { useApp } from '@/context/AppContext'
import { engineCommand } from '@/lib/ipc'
import styles from './RunControls.module.css'

function RunControls() {
  const { state, dispatch } = useApp()
  const { engineStatus } = state
  const isRunning = engineStatus === 'running'
  const isPaused = engineStatus === 'paused'

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

  // Idle: Run button lives in the Workspace right panel
  return null
}

export default RunControls

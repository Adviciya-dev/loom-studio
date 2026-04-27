import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useApp } from '@/context/AppContext'
import { engineCommand } from '@/lib/ipc'
import styles from './BottomBar.module.css'

const STATUS_LABEL: Record<string, string> = {
  idle: 'Idle',
  running: 'Running',
  paused: 'Paused',
  awaiting_approval: 'Awaiting Approval',
  completed: 'Completed',
}

function BottomBar() {
  const { state, dispatch } = useApp()
  const { engineStatus, engineError, activeTasks, activeTaskIndex, activeProject } = state
  const activeTask = activeTasks[activeTaskIndex] ?? null
  const [customPrompt, setCustomPrompt] = useState('')

  const hasError = engineError !== null
  const canSend =
    activeTask !== null &&
    activeProject !== null &&
    engineStatus === 'idle' &&
    activeTask.status !== 'completed' &&
    customPrompt.trim().length > 0

  async function handleSend() {
    if (!canSend || !activeTask || !activeProject) return
    const combined = customPrompt.trim()
      ? `${activeTask.prompt}\n\n${customPrompt.trim()}`
      : activeTask.prompt
    setCustomPrompt('')
    dispatch({ type: 'LOG_CLEAR' })
    dispatch({ type: 'SET_ENGINE_STATUS', status: 'running' })
    await engineCommand({
      action: 'start',
      task_id: activeTask.id,
      task_title: activeTask.title,
      prompt: combined,
      project_path: activeProject.path,
    }).catch(() => {
      dispatch({ type: 'SET_ENGINE_STATUS', status: 'idle' })
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleSend()
  }

  async function handleAttach() {
    const path = await invoke<string | null>('open_file_picker').catch(() => null)
    if (path) {
      setCustomPrompt((prev) => prev + (prev.trim() ? ' ' : '') + `[file: ${path}]`)
    }
  }

  const pillClass = [
    styles.pill,
    engineStatus === 'running' ? styles.pillRunning : '',
    engineStatus === 'paused' ? styles.pillPaused : '',
    engineStatus === 'awaiting_approval' ? styles.pillAwaiting : '',
    engineStatus === 'completed' ? styles.pillCompleted : '',
    hasError ? styles.pillError : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={styles.bottomBar}>
      <button
        className={styles.attachBtn}
        onClick={handleAttach}
        title="Attach file path to prompt"
        disabled={engineStatus !== 'idle' || !activeTask || activeTask.status === 'completed'}
      >
        📎
      </button>
      <input
        className={styles.promptInput}
        type="text"
        placeholder="Add a custom prompt or context…"
        value={customPrompt}
        onChange={(e) => setCustomPrompt(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={engineStatus !== 'idle' || !activeTask || activeTask.status === 'completed'}
        aria-label="Custom prompt"
      />
      <button
        className={styles.sendBtn}
        onClick={handleSend}
        disabled={!canSend}
        title={canSend ? 'Send custom prompt (Enter)' : 'Select an idle task to send a prompt'}
      >
        Send
      </button>
      <div className={styles.statusPills}>
        <span
          className={pillClass}
          aria-live="polite"
          aria-label={`Engine status: ${hasError ? 'Error' : (STATUS_LABEL[engineStatus] ?? engineStatus)}`}
        >
          {hasError ? 'Error' : (STATUS_LABEL[engineStatus] ?? engineStatus)}
        </span>
      </div>
    </div>
  )
}

export default BottomBar

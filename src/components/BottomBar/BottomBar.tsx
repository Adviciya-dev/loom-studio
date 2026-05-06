import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useApp } from '@/context/AppContext'
import { engineCommand } from '@/lib/ipc'
import styles from './BottomBar.module.css'

function BottomBar() {
  const { state, dispatch } = useApp()
  const { engineStatus, activeTasks, activeTaskIndex, activeProject } = state
  const activeTask = activeTasks[activeTaskIndex] ?? null
  const [prompt, setPrompt] = useState('')

  const isIdle = engineStatus === 'idle'
  const hasTask = activeTask !== null && activeProject !== null && activeTask.status !== 'completed'
  const canSend = hasTask && isIdle && prompt.trim().length > 0

  const placeholder = !activeProject
    ? 'Open a project to send prompts…'
    : !hasTask
      ? 'Select a task to send a prompt…'
      : engineStatus !== 'idle'
        ? 'Waiting for Claude to finish…'
        : 'Message Claude… (↵ to send)'

  async function handleSend() {
    if (!canSend || !activeTask || !activeProject) return
    const combined = `${activeTask.prompt}\n\n${prompt.trim()}`
    setPrompt('')
    dispatch({ type: 'LOG_CLEAR' })
    dispatch({ type: 'SET_ENGINE_STATUS', status: 'running' })
    await engineCommand({
      action: 'start',
      task_id: activeTask.id,
      task_title: activeTask.title,
      prompt: combined,
      project_path: activeProject.path,
    }).catch(() => dispatch({ type: 'SET_ENGINE_STATUS', status: 'idle' }))
  }

  async function handleAttach() {
    const path = await invoke<string | null>('open_file_picker').catch(() => null)
    if (path) setPrompt((p) => p + (p.trim() ? ' ' : '') + `[file: ${path}]`)
  }

  return (
    <div className={styles.bar}>
      <span className={styles.chevron}>›</span>
      <input
        className={styles.input}
        type="text"
        placeholder={placeholder}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        aria-label="Prompt"
        spellCheck={false}
      />
      <button
        className={styles.attachBtn}
        onClick={handleAttach}
        disabled={!isIdle || !hasTask}
        title="Attach file"
        tabIndex={-1}
      >
        📎
      </button>
      {prompt.trim().length > 0 && (
        <button
          className={styles.sendBtn}
          onClick={handleSend}
          disabled={!canSend}
          title="Send (Enter)"
        >
          ↵
        </button>
      )}
    </div>
  )
}

export default BottomBar

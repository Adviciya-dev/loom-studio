import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Play, AlertTriangle, ArrowRight, CheckCircle2, XCircle } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import styles from './CheckPanel.module.css'

const PROGRESS_STEPS = [
  { key: 'building_prompt', label: 'Building quality prompt' },
  { key: 'running_claude', label: 'Running Claude analysis' },
  { key: 'parsing_result', label: 'Parsing results' },
  { key: 'saving_log', label: 'Saving to log' },
]

function CheckPanel() {
  const { state, dispatch } = useApp()
  const {
    activeProject,
    globalCqcPath,
    cqcClients,
    cqcSelectedClientId,
    cqcCheckRunning,
    cqcProgressStep,
    cqcUser,
    cqcActiveCheck,
  } = state
  const cqcPath = activeProject?.path ?? globalCqcPath

  const [text, setText] = useState('')
  const [localUser, setLocalUser] = useState(cqcUser || '')

  const selectedClient =
    cqcClients.find((c) => c.id === cqcSelectedClientId) ?? cqcClients[0] ?? null

  async function handleRun() {
    if (!cqcPath || !selectedClient || !text.trim()) return

    const userName = localUser.trim() || 'anonymous'
    dispatch({ type: 'SET_CQC_USER', user: userName })
    dispatch({ type: 'SET_CQC_CHECK_RUNNING', running: true })
    dispatch({ type: 'SET_CQC_ACTIVE_CHECK', result: null })

    try {
      await invoke('cqc_run_text_check', {
        projectPath: cqcPath,
        client: selectedClient,
        text: text.trim(),
        user: userName,
      })
    } catch {
      dispatch({ type: 'SET_CQC_CHECK_RUNNING', running: false })
      dispatch({ type: 'SET_CQC_PROGRESS_STEP', step: null })
    }
  }

  function getStepState(stepKey: string) {
    if (!cqcProgressStep) return 'pending'
    const currentIdx = PROGRESS_STEPS.findIndex((s) => s.key === cqcProgressStep)
    const thisIdx = PROGRESS_STEPS.findIndex((s) => s.key === stepKey)
    if (thisIdx < currentIdx) return 'done'
    if (thisIdx === currentIdx) return 'active'
    return 'pending'
  }

  const canRun = !cqcCheckRunning && !!selectedClient && text.trim().length > 0

  return (
    <div className={styles.root}>
      {/* Last result banner */}
      {cqcActiveCheck && !cqcCheckRunning && (
        <button
          className={`${styles.lastResult} ${cqcActiveCheck.approved ? styles.lastResultApproved : styles.lastResultRejected}`}
          onClick={() => dispatch({ type: 'SET_CQC_SUB_VIEW', view: 'check-result' })}
        >
          {cqcActiveCheck.approved ? (
            <CheckCircle2 size={14} strokeWidth={2.5} />
          ) : (
            <XCircle size={14} strokeWidth={2.5} />
          )}
          <span>
            Last result: <strong>{cqcActiveCheck.approved ? 'Approved' : 'Needs Review'}</strong> —{' '}
            {cqcActiveCheck.issues.length} issue{cqcActiveCheck.issues.length !== 1 ? 's' : ''}
          </span>
          <ArrowRight size={13} strokeWidth={2} style={{ marginLeft: 'auto' }} />
        </button>
      )}

      {cqcClients.length === 0 && (
        <div className={styles.warn}>
          <AlertTriangle size={14} strokeWidth={2} />
          No clients configured — add a client in the Clients tab before running a check.
        </div>
      )}

      {/* Client selector */}
      <div className={styles.field}>
        <label className={styles.label}>Client</label>
        <select
          className={styles.select}
          value={cqcSelectedClientId ?? selectedClient?.id ?? ''}
          onChange={(e) => dispatch({ type: 'SET_CQC_SELECTED_CLIENT_ID', id: e.target.value })}
          disabled={cqcCheckRunning}
        >
          {cqcClients.length === 0 && <option value="">— no clients —</option>}
          {cqcClients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Content text area */}
      <div className={styles.field}>
        <label className={styles.label}>Content to check</label>
        <textarea
          className={styles.textarea}
          placeholder="Paste the social media post, blog copy, email, or any text to check…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={cqcCheckRunning}
          rows={8}
        />
      </div>

      {/* User + run button */}
      <div className={styles.userRow}>
        <div className={`${styles.field} ${styles.userField}`}>
          <label className={styles.label}>Your name (for log attribution)</label>
          <input
            className={styles.input}
            placeholder="e.g. Sarah"
            value={localUser}
            onChange={(e) => setLocalUser(e.target.value)}
            disabled={cqcCheckRunning}
          />
        </div>
        <button className={styles.runBtn} onClick={handleRun} disabled={!canRun}>
          <Play size={14} strokeWidth={2.5} />
          Run Check
        </button>
      </div>

      {/* Progress */}
      {cqcCheckRunning && (
        <div className={styles.progress}>
          <div className={styles.progressTitle}>Analysing content…</div>
          <div className={styles.steps}>
            {PROGRESS_STEPS.map((s) => {
              const state = getStepState(s.key)
              return (
                <div
                  key={s.key}
                  className={`${styles.step} ${state === 'done' ? styles.stepDone : ''} ${state === 'active' ? styles.stepActive : ''}`}
                >
                  <div
                    className={`${styles.stepIcon} ${state === 'done' ? styles.stepIconDone : ''} ${state === 'active' ? styles.stepIconActive : ''}`}
                  >
                    {state === 'done' ? '✓' : ''}
                  </div>
                  {s.label}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default CheckPanel

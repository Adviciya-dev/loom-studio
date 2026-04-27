import { useEffect, useRef, useState } from 'react'
import { useApp } from '@/context/AppContext'
import { engineCommand } from '@/lib/ipc'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import FileList from './FileList'
import DiffCodeView from './DiffCodeView'
import DiffFooter from './DiffFooter'
import styles from './DiffOverlay.module.css'

type ViewMode = 'unified' | 'split'

function DiffOverlay() {
  const { state, dispatch } = useApp()
  const { pendingDiff, diffError, engineStatus } = state
  const isVisible =
    pendingDiff !== null || diffError !== null || engineStatus === 'awaiting_approval'
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [viewMode, setViewMode] = useState<ViewMode>('unified')
  const [pending, setPending] = useState(false)
  const [feedback, setFeedback] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, isVisible)

  // Reset local state when a new diff arrives.
  useEffect(() => {
    if (pendingDiff !== null) {
      setSelectedIndex(0)
      setPending(false)
      setFeedback('')
    }
  }, [pendingDiff])

  // Enter = approve; Escape is intentionally blocked while overlay is open.
  useEffect(() => {
    if (!isVisible) return

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Enter' && !pending) {
        e.preventDefault()
        handleApply()
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  })

  if (!isVisible) return null

  const selectedFile = pendingDiff?.files[selectedIndex] ?? null

  async function handleRetry() {
    if (pending) return
    setPending(true)
    dispatch({ type: 'CLEAR_DIFF_ERROR' })
    try {
      await engineCommand({ action: 'diff_retry' })
    } catch {
      dispatch({ type: 'SET_DIFF_ERROR', message: 'Retry failed — could not run git diff' })
    } finally {
      setPending(false)
    }
  }

  async function handleApply() {
    if (pending) return
    setPending(true)
    try {
      await engineCommand({ action: 'approve', feedback: feedback.trim() || undefined })
      dispatch({ type: 'CLEAR_PENDING_DIFF' })
      dispatch({ type: 'SET_ENGINE_STATUS', status: 'running' })
    } catch {
      setPending(false)
    }
  }

  async function handleReject() {
    if (pending) return
    setPending(true)
    try {
      await engineCommand({ action: 'reject', feedback: feedback.trim() || undefined })
      dispatch({ type: 'CLEAR_PENDING_DIFF' })
      dispatch({ type: 'SET_ENGINE_STATUS', status: 'idle' })
    } catch {
      setPending(false)
    }
  }

  return (
    <div className={styles.overlay} role="presentation">
      <div
        className={styles.panel}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Proposed Changes"
      >
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.title}>Proposed Changes</span>
            <span className={styles.sessionId}>{pendingDiff?.sessionId ?? ''}</span>
          </div>
          <div className={styles.headerRight}>
            <div className={styles.toggle}>
              <button
                className={`${styles.toggleBtn} ${viewMode === 'unified' ? styles.active : ''}`}
                onClick={() => setViewMode('unified')}
                disabled={pending}
              >
                Unified
              </button>
              <button
                className={`${styles.toggleBtn} ${viewMode === 'split' ? styles.active : ''}`}
                onClick={() => setViewMode('split')}
                disabled={pending}
              >
                Split
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {diffError ? (
            <div className={styles.diffError}>
              <p className={styles.diffErrorTitle}>Diff extraction failed</p>
              <p className={styles.diffErrorMsg}>{diffError}</p>
              <div className={styles.diffErrorActions}>
                <button className={styles.retryBtn} onClick={handleRetry} disabled={pending}>
                  {pending ? 'Retrying…' : 'Retry'}
                </button>
                <button className={styles.rejectBtn} onClick={handleReject} disabled={pending}>
                  Reject
                </button>
              </div>
            </div>
          ) : pendingDiff && pendingDiff.files.length === 0 ? (
            <div className={styles.emptyDiff}>
              <p className={styles.emptyTitle}>No changes detected</p>
              <p className={styles.emptyHint}>
                The working tree is clean. You can still apply or reject.
              </p>
            </div>
          ) : pendingDiff ? (
            <>
              <FileList
                files={pendingDiff.files}
                selectedIndex={selectedIndex}
                onSelect={setSelectedIndex}
              />
              <div className={styles.codeArea}>
                {selectedFile && <DiffCodeView file={selectedFile} viewMode={viewMode} />}
              </div>
            </>
          ) : (
            <div className={styles.emptyDiff}>
              <p className={styles.emptyTitle}>Loading diff…</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <DiffFooter
          filename={selectedFile?.name ?? '—'}
          pending={pending}
          feedback={feedback}
          onFeedbackChange={setFeedback}
          onApply={handleApply}
          onReject={handleReject}
        />
      </div>
    </div>
  )
}

export default DiffOverlay

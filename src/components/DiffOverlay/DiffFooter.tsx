import { useRef } from 'react'
import styles from './DiffFooter.module.css'

interface Props {
  filename: string
  pending: boolean
  feedback: string
  onFeedbackChange: (v: string) => void
  onApply: () => void
  onReject: () => void
}

function DiffFooter({ filename, pending, feedback, onFeedbackChange, onApply, onReject }: Props) {
  const inputRef = useRef<HTMLTextAreaElement>(null)

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd+Enter / Ctrl+Enter = approve; Shift+Enter = newline
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      onApply()
    }
    // Prevent the global Enter = approve handler from firing while typing
    e.stopPropagation()
  }

  return (
    <div className={styles.footer}>
      <div className={styles.inputRow}>
        <textarea
          ref={inputRef}
          className={styles.feedbackInput}
          placeholder="Optional: add a note or instruction for Claude (e.g. also add error handling)..."
          value={feedback}
          onChange={(e) => onFeedbackChange(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={pending}
          rows={2}
          aria-label="Feedback for Claude"
        />
      </div>
      <div className={styles.bottomRow}>
        <div className={styles.left}>
          <span className={styles.label}>File:</span>
          <span className={styles.filename}>{filename}</span>
        </div>
        <div className={styles.actions}>
          <button className={styles.rejectBtn} onClick={onReject} disabled={pending}>
            {pending ? 'Rejecting…' : 'Reject'}
          </button>
          <button
            className={styles.applyBtn}
            onClick={onApply}
            disabled={pending}
            title="Apply Changes (⌘↵)"
          >
            {pending ? 'Applying…' : 'Apply Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default DiffFooter

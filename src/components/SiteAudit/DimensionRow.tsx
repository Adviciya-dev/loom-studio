import { useState } from 'react'
import type { AuditDimensionStatus } from '@/types'
import styles from './AuditProgress.module.css'

interface Props {
  dimension: AuditDimensionStatus
}

const STATUS_ICON: Record<string, string> = {
  pending: '○',
  running: '◌',
  done: '✓',
  error: '!',
  skipped: '–',
}

export function DimensionRow({ dimension }: Props) {
  const [expanded, setExpanded] = useState(false)
  const { label, status, score, errorMessage } = dimension

  const isError = status === 'error'
  const isRunning = status === 'running'
  const isDone = status === 'done'
  const isSkipped = status === 'skipped'

  function scoreText() {
    if (isDone && score !== null) return `${score}/100`
    if (isError) return 'Error'
    return ''
  }

  return (
    <div className={`${styles.dimRow} ${styles[`dimRow_${status}`]}`}>
      <div
        className={`${styles.dimMain} ${isError ? styles.dimClickable : ''}`}
        onClick={isError ? () => setExpanded((e) => !e) : undefined}
      >
        <span className={`${styles.dimIcon} ${isRunning ? styles.dimIconSpin : ''}`} aria-hidden>
          {STATUS_ICON[status] ?? '○'}
        </span>
        <span className={`${styles.dimLabel} ${isSkipped ? styles.dimLabelSkipped : ''}`}>
          {label}
          {isSkipped && <span className={styles.dimSkippedBadge}>skipped</span>}
        </span>
        <span className={`${styles.dimScore} ${isError ? styles.dimScoreError : ''}`}>
          {scoreText()}
        </span>
        {isError && <span className={styles.dimExpandHint}>{expanded ? '▾' : '▸'}</span>}
      </div>
      {isError && expanded && errorMessage && <div className={styles.dimError}>{errorMessage}</div>}
    </div>
  )
}

// Export the key prop type so AuditProgress can filter by key
export type { Props as DimensionRowProps }

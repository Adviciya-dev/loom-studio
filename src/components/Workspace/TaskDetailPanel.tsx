import { useState } from 'react'
import type { Task, TaskStatus } from '@/types'
import styles from './TaskDetailPanel.module.css'

interface Props {
  task: Task
}

function badgeClass(status: TaskStatus): string {
  if (status === 'pending') return `${styles.badge} ${styles.badgePending}`
  if (status === 'in-progress') return `${styles.badge} ${styles.badgeInProgress}`
  return `${styles.badge} ${styles.badgeCompleted}`
}

function TaskDetailPanel({ task }: Props) {
  const [copied, setCopied] = useState(false)

  function copyHash() {
    if (!task.commitHash) return
    navigator.clipboard.writeText(task.commitHash).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.breadcrumb}>{task.id}</div>
        <div className={styles.taskTitle}>{task.title}</div>
      </div>

      <div className={styles.meta}>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Status</span>
          <span className={badgeClass(task.status)}>{task.status}</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Type</span>
          <span className={styles.metaValue}>{task.type}</span>
        </div>
        {task.due && (
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Due</span>
            <span className={styles.metaValue}>{task.due}</span>
          </div>
        )}
      </div>

      {task.description && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Description</div>
          <p className={styles.description}>{task.description}</p>
        </div>
      )}

      {(task.steps ?? []).length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Steps</div>
          <div className={styles.steps}>
            {(task.steps ?? []).map((step, i) => (
              <div key={i} className={styles.step}>
                <div className={`${styles.checkbox} ${step.done ? styles.checkboxDone : ''}`}>
                  {step.done && '✓'}
                </div>
                <span className={`${styles.stepText} ${step.done ? styles.stepTextDone : ''}`}>
                  {step.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {task.commitHash && (
        <div className={styles.commitFooter}>
          <span className={styles.commitLabel}>Committed</span>
          <button
            className={styles.commitHash}
            onClick={copyHash}
            title={copied ? 'Copied!' : 'Click to copy'}
          >
            {copied ? 'Copied!' : task.commitHash.slice(0, 7)}
          </button>
        </div>
      )}
    </div>
  )
}

export default TaskDetailPanel

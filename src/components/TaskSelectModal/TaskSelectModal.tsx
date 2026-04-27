import { useEffect, useRef, useState, useCallback } from 'react'
import { useApp } from '@/context/AppContext'
import { engineCommand, onTasks } from '@/lib/ipc'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import type { Task, TaskStatus } from '@/types'
import styles from './TaskSelectModal.module.css'

const STATUS_FILTERS: Array<TaskStatus | 'all'> = ['all', 'pending', 'in-progress', 'completed']

function badgeClass(status: TaskStatus): string {
  if (status === 'pending') return `${styles.badge} ${styles.badgePending}`
  if (status === 'in-progress') return `${styles.badge} ${styles.badgeInProgress}`
  return `${styles.badge} ${styles.badgeCompleted}`
}

function SkeletonRow() {
  return (
    <div className={styles.skeletonRow}>
      <div className={styles.skeletonLeft}>
        <div className={`skeleton ${styles.skeletonId}`} />
        <div className={`skeleton ${styles.skeletonTitle}`} />
      </div>
      <div className={`skeleton ${styles.skeletonBadge}`} />
    </div>
  )
}

function TaskSelectModal() {
  const { state, dispatch } = useApp()
  const [tasks, setTasks] = useState<Task[]>([])
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all')
  const [loading, setLoading] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)

  const open = state.taskModalOpen
  useFocusTrap(modalRef, open)

  useEffect(() => {
    if (!open || !state.activeProject) return

    setLoading(true)
    setTasks([])
    engineCommand({ action: 'get_tasks', path: state.activeProject.path + '/harness' }).catch(
      () => {}
    )

    const unsub = onTasks((received) => {
      setTasks(received ?? [])
      setLoading(false)
    })
    return () => {
      unsub.then((fn) => fn())
    }
  }, [open, state.activeProject])

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const close = useCallback(() => dispatch({ type: 'CLOSE_TASK_MODAL' }), [dispatch])

  const assign = useCallback(
    (task: Task) => {
      dispatch({ type: 'ADD_TASK', task })
      close()
    },
    [dispatch, close]
  )

  if (!open) return null

  // Merge live status from activeTasks — disk files don't update on completion.
  const mergedTasks = tasks.map((t) => {
    const live = state.activeTasks.find((a) => a.id === t.id)
    return live ? { ...t, status: live.status } : t
  })

  const visible = filter === 'all' ? mergedTasks : mergedTasks.filter((t) => t.status === filter)

  return (
    <div className={styles.overlay} onClick={close} role="presentation">
      <div
        className={styles.modal}
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Select Task"
      >
        <div className={styles.header}>
          <span className={styles.title}>Select Task</span>
          <button className={styles.closeBtn} onClick={close} aria-label="Close">
            ×
          </button>
        </div>

        <div className={styles.filters}>
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              className={`${styles.filterBtn} ${filter === f ? styles.filterBtnActive : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : f}
            </button>
          ))}
        </div>

        <div className={styles.list}>
          {loading ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : tasks.length === 0 ? (
            <div className={styles.emptyHarness}>
              <p className={styles.emptyHarnessTitle}>No tasks found</p>
              <p className={styles.emptyHarnessHint}>
                Add a <code>harness/tasks/</code> folder to your project with <code>.md</code> task
                files.
              </p>
              <ol className={styles.setupSteps}>
                <li>
                  Create <code>{state.activeProject?.path ?? '<project>'}/harness/tasks/</code>
                </li>
                <li>
                  Add task files using the format: <code>TASK-001 — Title.md</code>
                </li>
                <li>
                  Each file needs a <code># TASK-XXX: Title</code> heading
                </li>
                <li>Reopen this modal to see your tasks</li>
              </ol>
            </div>
          ) : visible.length === 0 ? (
            <div className={styles.empty}>No tasks match this filter.</div>
          ) : (
            visible.map((task) => (
              <div key={task.id} className={styles.taskItem}>
                <div className={styles.taskLeft}>
                  <span className={styles.taskId}>{task.id}</span>
                  <span className={styles.taskTitle}>{task.title}</span>
                </div>
                <div className={styles.taskMeta}>
                  <span className={badgeClass(task.status)}>{task.status}</span>
                  {task.due && <span className={styles.due}>{task.due}</span>}
                  <button className={styles.assignBtn} onClick={() => assign(task)}>
                    Assign
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default TaskSelectModal

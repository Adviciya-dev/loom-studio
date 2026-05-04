import { useEffect, useRef, useState, useCallback } from 'react'
import { useApp } from '@/context/AppContext'
import { engineCommand, onTasks } from '@/lib/ipc'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import type { Task, TaskStatus } from '@/types'
import styles from './TaskSelectModal.module.css'

const STATUS_FILTERS: Array<{ value: TaskStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
]

function statusLabel(status: TaskStatus | undefined): string {
  if (status === 'in-progress') return 'In Progress'
  if (status === 'completed') return 'Completed'
  return 'Pending'
}

function badgeClass(status: TaskStatus | undefined): string {
  if (status === 'in-progress') return `${styles.badge} ${styles.badgeInProgress}`
  if (status === 'completed') return `${styles.badge} ${styles.badgeCompleted}`
  return `${styles.badge} ${styles.badgePending}`
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
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const paletteRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const open = state.taskModalOpen
  useFocusTrap(paletteRef, open)

  useEffect(() => {
    if (!open || !state.activeProject) return
    setLoading(true)
    setTasks([])
    setSearch('')
    setFilter('all')
    setSelectedIndex(0)
    setTimeout(() => searchRef.current?.focus(), 50)
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

  const close = useCallback(() => dispatch({ type: 'CLOSE_TASK_MODAL' }), [dispatch])

  const assign = useCallback(
    (task: Task) => {
      dispatch({ type: 'ADD_TASK', task })
      close()
    },
    [dispatch, close]
  )

  // Merge live status from activeTasks
  const mergedTasks = tasks.map((t) => {
    const live = state.activeTasks.find((a) => a.id === t.id)
    return live ? { ...t, status: live.status } : t
  })

  const q = search.toLowerCase().trim()

  // Apply search first, then compute per-status counts from search results
  const searchFiltered = mergedTasks.filter((t) => {
    if (!q) return true
    return t.id.toLowerCase().includes(q) || t.title.toLowerCase().includes(q)
  })

  const counts: Record<string, number> = {
    all: searchFiltered.length,
    pending: searchFiltered.filter((t) => (t.status ?? 'pending') === 'pending').length,
    'in-progress': searchFiltered.filter((t) => (t.status ?? 'pending') === 'in-progress').length,
    completed: searchFiltered.filter((t) => (t.status ?? 'pending') === 'completed').length,
  }

  const visible = searchFiltered.filter((t) => {
    if (filter === 'all') return true
    return (t.status ?? 'pending') === filter
  })

  const isActive = (task: Task) => state.activeTasks.some((a) => a.id === task.id)

  // Reset selection on filter/search change
  useEffect(() => {
    setSelectedIndex(0)
  }, [filter, search])

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.children[selectedIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  // Keyboard navigation
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        close()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, visible.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' && visible.length > 0) {
        const task = visible[selectedIndex]
        if (task && !isActive(task)) assign(task)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, close, visible, selectedIndex, assign]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null

  return (
    <div className={styles.overlay} onClick={close} role="presentation">
      <div
        className={styles.palette}
        ref={paletteRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Select Task"
      >
        {/* Search row */}
        <div className={styles.searchRow}>
          <svg className={styles.searchIcon} viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M10.5 10.5L14 14"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <input
            ref={searchRef}
            className={styles.searchInput}
            type="text"
            placeholder="Search by ID or title…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <kbd className={styles.kbdEsc}>Esc</kbd>
        </div>

        {/* Filter chips row */}
        <div className={styles.filterRow}>
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              className={`${styles.filterChip} ${filter === f.value ? styles.filterChipActive : ''}`}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
              {!loading && <span className={styles.filterCount}>{counts[f.value] ?? 0}</span>}
            </button>
          ))}
          <div className={styles.filterSpacer} />
          <span className={styles.kbdHint}>
            <kbd>↑↓</kbd> navigate · <kbd>↵</kbd> assign
          </span>
        </div>

        {/* Task list */}
        <div className={styles.list} ref={listRef}>
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
                Add a <code>harness/tasks/</code> folder with <code>.md</code> files.
              </p>
              <ol className={styles.setupSteps}>
                <li>
                  Create <code>{state.activeProject?.path ?? '<project>'}/harness/tasks/</code>
                </li>
                <li>
                  Add task files: <code>TASK-001 — Title.md</code>
                </li>
                <li>
                  Each file needs a <code># TASK-XXX: Title</code> heading
                </li>
                <li>Reopen this panel to see your tasks</li>
              </ol>
            </div>
          ) : visible.length === 0 ? (
            <div className={styles.empty}>
              {q
                ? `No tasks match "${search}"`
                : `No ${filter !== 'all' ? statusLabel(filter as TaskStatus) : ''} tasks`}
            </div>
          ) : (
            visible.map((task, idx) => {
              const active = isActive(task)
              const selected = idx === selectedIndex
              return (
                <div
                  key={task.id}
                  className={[
                    styles.taskItem,
                    selected ? styles.taskItemSelected : '',
                    active ? styles.taskItemActive : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => !active && assign(task)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <div className={styles.taskLeft}>
                    <span className={styles.taskId}>{task.id}</span>
                    <span className={styles.taskTitle}>{task.title}</span>
                  </div>
                  <div className={styles.taskRight}>
                    {task.type && (
                      <span
                        className={[
                          styles.typeTag,
                          styles[`typeTag_${task.type}` as keyof typeof styles] ?? '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        {task.type}
                      </span>
                    )}
                    <span className={badgeClass(task.status)}>{statusLabel(task.status)}</span>
                    {active ? (
                      <span className={styles.activeTag}>Active</span>
                    ) : (
                      <span
                        className={`${styles.assignHint} ${selected ? styles.assignHintVisible : ''}`}
                      >
                        ↵ Assign
                      </span>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        {!loading && tasks.length > 0 && (
          <div className={styles.footer}>
            {visible.length} task{visible.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  )
}

export default TaskSelectModal

import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useApp } from '@/context/AppContext'
import { engineCommand } from '@/lib/ipc'
import { onTasks } from '@/lib/events'
import type { Task, TaskStatus } from '@/types'
import styles from './Workspace.module.css'

const STATUS_FILTERS: Array<{ value: TaskStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'completed', label: 'Done' },
]

const ITEM_H = 40
const OVERSCAN = 8

function dotClass(status: TaskStatus | undefined): string {
  if (status === 'in-progress') return `${styles.dot} ${styles.dotRunning}`
  if (status === 'completed') return `${styles.dot} ${styles.dotDone}`
  return `${styles.dot} ${styles.dotPending}`
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className={styles.skeletonRow}>
          <span className={styles.skeletonDot} />
          <span className={styles.skeletonId} />
          <span className={styles.skeletonTitle} />
          <span className={styles.skeletonPill} />
        </div>
      ))}
    </>
  )
}

function Workspace() {
  const { state, dispatch } = useApp()
  const { activeProject, activeTasks, activeTaskIndex, engineStatus } = state

  const [allTasks, setAllTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all')

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [taskContent, setTaskContent] = useState('')
  const [contentLoading, setContentLoading] = useState(false)

  const listRef = useRef<HTMLDivElement>(null)
  const selectedItemRef = useRef<HTMLButtonElement>(null)
  const [listScrollTop, setListScrollTop] = useState(0)
  const [listHeight, setListHeight] = useState(500)

  // Track list container height for virtualization
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setListHeight(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Load all tasks whenever the active project changes
  useEffect(() => {
    if (!activeProject) return
    let alive = true
    const unsubs: Array<() => void> = []
    setLoading(true)
    setAllTasks([])
    setSelectedId(null)
    setListScrollTop(0)

    engineCommand({ action: 'get_tasks', path: activeProject.path + '/harness' }).catch(() => {})
    onTasks((received) => {
      if (!alive) return
      setAllTasks(received ?? [])
      setLoading(false)
      requestAnimationFrame(() => {
        if (listRef.current) listRef.current.scrollTop = 0
      })
    }).then((fn) => (alive ? unsubs.push(fn) : fn()))

    return () => {
      alive = false
      unsubs.forEach((fn) => fn())
    }
  }, [activeProject?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Only pull commitHash from the live session — status comes from the file
  const tasks = allTasks.map((t) => {
    const live = activeTasks.find((a) => a.id === t.id)
    return live?.commitHash ? { ...t, commitHash: live.commitHash } : t
  })

  const filtered =
    filter === 'all' ? tasks : tasks.filter((t) => (t.status ?? 'pending') === filter)

  // Virtual list window
  const firstVisible = Math.max(0, Math.floor(listScrollTop / ITEM_H) - OVERSCAN)
  const lastVisible = Math.min(
    filtered.length - 1,
    Math.ceil((listScrollTop + listHeight) / ITEM_H) + OVERSCAN
  )
  const topPad = firstVisible * ITEM_H
  const bottomPad = Math.max(0, (filtered.length - 1 - lastVisible) * ITEM_H)
  const visibleItems = filtered.slice(firstVisible, lastVisible + 1)

  const selectedTask = tasks.find((t) => t.id === selectedId) ?? null

  // Scroll selected item into view when selection changes
  useEffect(() => {
    selectedItemRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedId])

  const handleSelectTask = useCallback(
    async (task: Task) => {
      if (selectedId === task.id) return
      setSelectedId(task.id)
      setTaskContent('')

      const existingIdx = activeTasks.findIndex((a) => a.id === task.id)
      if (existingIdx >= 0) {
        dispatch({ type: 'SET_ACTIVE_TASK', index: existingIdx })
      } else {
        dispatch({ type: 'ADD_TASK', task })
      }

      if (!activeProject) return
      const absPath = task.file_path
        ? `${activeProject.path}/${task.file_path}`
        : task.filename
          ? `${activeProject.path}/harness/tasks/${task.filename}`
          : null
      if (!absPath) return
      setContentLoading(true)
      try {
        const content = await invoke<string>('read_file_content', { path: absPath })
        setTaskContent(content)
      } catch {
        setTaskContent('')
      } finally {
        setContentLoading(false)
      }
    },
    [selectedId, activeTasks, activeProject, dispatch]
  )

  const activeTask = activeTasks[activeTaskIndex] ?? null
  const isIdle = engineStatus === 'idle'
  const isRunning = engineStatus === 'running'
  const isPaused = engineStatus === 'paused'
  const isCompleted = selectedTask?.status === 'completed'
  const canRun = isIdle && !!selectedTask && !!activeProject && !isCompleted

  async function handleRun() {
    if (!canRun || !selectedTask || !activeProject) return
    dispatch({ type: 'LOG_CLEAR' })
    dispatch({ type: 'SET_ENGINE_STATUS', status: 'running' })
    await engineCommand({
      action: 'start',
      task_id: selectedTask.id,
      task_title: selectedTask.title,
      prompt: selectedTask.prompt,
      project_path: activeProject.path,
    }).catch(() => dispatch({ type: 'SET_ENGINE_STATUS', status: 'idle' }))
  }

  if (!activeProject) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>No project open</p>
        <p className={styles.emptyHint}>Click the project selector to open a project</p>
      </div>
    )
  }

  return (
    <div className={styles.split}>
      {/* ── Left panel — task list ──────────────────────── */}
      <div className={styles.left}>
        <div className={styles.leftHeader}>
          <span className={styles.leftTitle}>
            Tasks
            {!loading && tasks.length > 0 && (
              <span className={styles.count}>{filtered.length}</span>
            )}
          </span>
          {loading && <span className={styles.loadingDot} />}
        </div>

        <div className={styles.chips}>
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              className={`${styles.chip} ${filter === f.value ? styles.chipActive : ''}`}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div
          className={styles.list}
          ref={listRef}
          onScroll={(e) => setListScrollTop(e.currentTarget.scrollTop)}
        >
          {loading ? (
            <SkeletonRows />
          ) : tasks.length === 0 ? (
            <div className={styles.leftEmpty}>
              <p>No tasks found.</p>
              <p>
                Add <code>.md</code> files to <code>harness/tasks/</code>
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className={styles.leftEmpty}>
              <p>No {filter !== 'all' ? filter : ''} tasks.</p>
            </div>
          ) : (
            <>
              {topPad > 0 && <div style={{ height: topPad }} />}
              {visibleItems.map((task) => {
                const st = task.status ?? 'pending'
                const isSelected = selectedId === task.id
                return (
                  <button
                    key={task.id}
                    ref={isSelected ? selectedItemRef : null}
                    className={`${styles.listItem} ${isSelected ? styles.listItemActive : ''}`}
                    style={{ height: ITEM_H }}
                    onClick={() => handleSelectTask(task)}
                  >
                    <span className={dotClass(task.status)} />
                    <span className={styles.itemId}>{task.id}</span>
                    <span className={styles.itemTitle}>{task.title}</span>
                    <span className={`${styles.statusPill} ${styles[`pill_${st}`]}`}>
                      {st === 'in-progress' ? 'Active' : st === 'completed' ? 'Done' : 'Pending'}
                    </span>
                  </button>
                )
              })}
              {bottomPad > 0 && <div style={{ height: bottomPad }} />}
            </>
          )}
        </div>
      </div>

      {/* ── Right panel — task detail ───────────────────── */}
      <div className={styles.right}>
        {!selectedTask ? (
          <div className={styles.noSelection}>
            <span className={styles.noSelectionIcon}>←</span>
            <span>Select a task</span>
          </div>
        ) : (
          <>
            <div className={styles.rightHeader}>
              <div className={styles.rightHeaderInfo}>
                <span className={styles.detailId}>{selectedTask.id}</span>
                <span className={styles.detailTitle}>{selectedTask.title}</span>
              </div>

              {isRunning ? (
                <span className={styles.runningBadge}>● Running…</span>
              ) : isPaused ? (
                <span className={styles.pausedBadge}>⏸ Paused</span>
              ) : isCompleted ? (
                <span className={styles.doneBadge}>✓ Done</span>
              ) : (
                <button className={styles.runBtn} onClick={handleRun} disabled={!canRun}>
                  ▶ Run
                </button>
              )}
            </div>

            <div className={styles.metaRow}>
              {selectedTask.type && (
                <span
                  className={`${styles.badge} ${styles[`type_${selectedTask.type}` as keyof typeof styles] ?? styles.badgeDefault}`}
                >
                  {selectedTask.type}
                </span>
              )}
              {selectedTask.due && (
                <span className={styles.metaItem}>
                  Due <strong>{selectedTask.due}</strong>
                </span>
              )}
              {selectedTask.commitHash && (
                <span className={styles.commitBadge}>✓ {selectedTask.commitHash.slice(0, 7)}</span>
              )}
              {activeTask?.id === selectedTask.id && engineStatus !== 'idle' && (
                <span className={styles.engineBadge}>{engineStatus}</span>
              )}
            </div>

            <div className={styles.rightBody}>
              <div className={styles.sectionLabel}>Task</div>
              {contentLoading ? (
                <div className={styles.contentSkeleton}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className={styles.contentSkeletonLine}
                      style={{ width: `${70 + (i % 3) * 10}%` }}
                    />
                  ))}
                </div>
              ) : taskContent ? (
                <pre className={styles.contentBlock}>{taskContent}</pre>
              ) : (
                <div className={styles.loadingText}>No content available.</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default Workspace

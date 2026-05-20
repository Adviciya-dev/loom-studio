import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useApp } from '@/context/AppContext'
import { engineCommand } from '@/lib/ipc'
import { onTasks } from '@/lib/events'
import type { Task, TaskStatus, BugItem } from '@/types'
import styles from './Workspace.module.css'

const STATUS_FILTERS: Array<{ value: TaskStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'completed', label: 'Done' },
]

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

  const [activeTab, setActiveTab] = useState<'tasks' | 'bugs'>('tasks')
  const [allTasks, setAllTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all')
  const [taskSearch, setTaskSearch] = useState('')
  const [bugs, setBugs] = useState<BugItem[]>([])
  const [bugFilter, setBugFilter] = useState<'all' | 'open' | 'fixed'>('all')
  const [bugSearch, setBugSearch] = useState('')
  const [selectedBug, setSelectedBug] = useState<BugItem | null>(null)
  const [bugContent, setBugContent] = useState('')
  const [bugContentLoading, setBugContentLoading] = useState(false)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [taskContent, setTaskContent] = useState('')
  const [contentLoading, setContentLoading] = useState(false)

  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)

  const listRef = useRef<HTMLDivElement>(null)
  const selectedItemRef = useRef<HTMLButtonElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [splitPct, setSplitPct] = useState(() => {
    const saved = localStorage.getItem('workspace-split')
    return saved ? parseFloat(saved) : 30
  })

  function onDividerMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    const container = containerRef.current
    if (!container) return
    function onMove(me: MouseEvent) {
      const rect = container!.getBoundingClientRect()
      const pct = ((me.clientX - rect.left) / rect.width) * 100
      const clamped = Math.max(18, Math.min(50, pct))
      setSplitPct(clamped)
      localStorage.setItem('workspace-split', String(clamped))
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // Load bugs when Bugs tab is opened
  useEffect(() => {
    if (!activeProject || activeTab !== 'bugs') return
    invoke<BugItem[]>('read_bugs', { path: activeProject.path })
      .then(setBugs)
      .catch(() => setBugs([]))
  }, [activeProject?.id, activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load all tasks whenever the active project changes
  useEffect(() => {
    if (!activeProject) return
    let alive = true
    const unsubs: Array<() => void> = []
    setLoading(true)
    setAllTasks([])
    setSelectedId(null)

    // Use a flag so only the FIRST tasks response after our get_tasks is used.
    // This prevents TaskSelectModal's concurrent get_tasks from overwriting our list
    // with potentially different data and causing duplicates.
    let gotFirstResponse = false
    engineCommand({ action: 'get_tasks', path: activeProject.path + '/harness' }).catch(() => {})
    onTasks((received) => {
      if (!alive) return
      if (gotFirstResponse) return
      gotFirstResponse = true
      const seen = new Set<string>()
      const unique = (received ?? []).filter((t) => {
        if (seen.has(t.id)) return false
        seen.add(t.id)
        return true
      })
      setAllTasks(unique)
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

  // Only pull commitHash from the live session — status comes from the file.
  // De-duplicate by ID a second time in case multiple onTasks events race.
  const seenIds = new Set<string>()
  const tasks = allTasks
    .filter((t) => {
      if (seenIds.has(t.id)) return false
      seenIds.add(t.id)
      return true
    })
    .map((t) => {
      const live = activeTasks.find((a) => a.id === t.id)
      return live?.commitHash ? { ...t, commitHash: live.commitHash } : t
    })

  const filtered = tasks
    .filter((t) => filter === 'all' || (t.status ?? 'pending') === filter)
    .filter((t) => {
      if (!taskSearch.trim()) return true
      const q = taskSearch.toLowerCase()
      return t.id.toLowerCase().includes(q) || t.title.toLowerCase().includes(q)
    })

  const selectedTask = tasks.find((t) => t.id === selectedId) ?? null

  // Scroll selected item into view when selection changes
  useEffect(() => {
    selectedItemRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedId])

  // When the user clicks a TaskTab in the TopBar, sync the right panel to that task
  const activeTabTaskId = activeTasks[activeTaskIndex]?.id
  useEffect(() => {
    if (!activeTabTaskId || activeTabTaskId === selectedId) return
    const task = allTasks.find((t) => t.id === activeTabTaskId)
    if (task) handleSelectTask(task)
  }, [activeTabTaskId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectTask = useCallback(
    async (task: Task) => {
      if (selectedId === task.id) return
      setSelectedId(task.id)
      setTaskContent('')
      setIsEditing(false)
      setEditContent('')

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
    dispatch({ type: 'SET_ENGINE_STATUS', status: 'running' })
    await engineCommand({
      action: 'start',
      task_id: selectedTask.id,
      task_title: selectedTask.title,
      prompt: selectedTask.prompt,
      project_path: activeProject.path,
    }).catch(() => dispatch({ type: 'SET_ENGINE_STATUS', status: 'idle' }))
  }

  async function handleFixBug() {
    if (!isIdle || !selectedBug || !activeProject || !bugContent) return
    const fixPrompt =
      'You are fixing a bug in this project. Read the full bug report below and implement the fix.\n\n' +
      '## Bug Report\n\n' +
      bugContent +
      '\n\n---\n\n' +
      'Instructions:\n' +
      '1. Read the files referenced in the bug report (test case, source files).\n' +
      '2. Understand the root cause stated in the report.\n' +
      '3. Implement the fix so the Actual Result matches the Expected Result.\n' +
      '4. Do NOT modify test case files or bug report files.\n' +
      '5. When done, update the bug file at `' +
      selectedBug.file_path +
      '`:\n' +
      '   - Set **Status** to `✅ Fixed`\n' +
      '   - Set **Fixed Date** to today (YYYY-MM-DD)\n' +
      '   Make this the very last thing you do.'
    dispatch({ type: 'LOG_CLEAR' })
    dispatch({ type: 'SET_ENGINE_STATUS', status: 'running' })
    await engineCommand({
      action: 'start',
      task_id: selectedBug.id,
      task_title: selectedBug.title,
      prompt: fixPrompt,
      project_path: activeProject.path,
    }).catch(() => dispatch({ type: 'SET_ENGINE_STATUS', status: 'idle' }))
  }

  const isDirty = isEditing && editContent !== taskContent

  function handleStartEdit() {
    setEditContent(taskContent)
    setIsEditing(true)
  }

  function handleCancelEdit() {
    setIsEditing(false)
    setEditContent(taskContent)
  }

  async function handleSave() {
    if (!selectedTask || !activeProject || !isDirty) return
    const absPath = selectedTask.file_path
      ? `${activeProject.path}/${selectedTask.file_path}`
      : selectedTask.filename
        ? `${activeProject.path}/harness/tasks/${selectedTask.filename}`
        : null
    if (!absPath) return
    setSaving(true)
    try {
      await invoke('write_file_content', { path: absPath, content: editContent })
      setTaskContent(editContent)
      setIsEditing(false)
    } catch {
      // keep editing state open so user doesn't lose changes
    } finally {
      setSaving(false)
    }
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
    <div className={styles.split} ref={containerRef}>
      {/* ── Left panel — task/bug list ─────────────────── */}
      <div className={styles.left} style={{ width: `${splitPct}%` }}>
        {/* Tab bar */}
        <div className={styles.tabBar}>
          <button
            className={`${styles.tabBtn} ${activeTab === 'tasks' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('tasks')}
          >
            Tasks
            {!loading && tasks.length > 0 && (
              <span className={styles.tabCount}>{filtered.length}</span>
            )}
            {loading && <span className={styles.loadingDot} />}
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'bugs' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('bugs')}
          >
            Bugs
            {bugs.length > 0 && <span className={styles.tabCount}>{bugs.length}</span>}
          </button>
        </div>

        {/* Tasks list */}
        {activeTab === 'tasks' && (
          <>
            <div className={styles.chips}>
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  className={`${styles.chip} ${filter === f.value ? styles.chipActive : ''}`}
                  onClick={() => {
                    setFilter(f.value)
                    if (listRef.current) listRef.current.scrollTop = 0
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className={styles.searchBar}>
              <input
                className={styles.searchInput}
                placeholder="Search tasks…"
                value={taskSearch}
                onChange={(e) => setTaskSearch(e.target.value)}
              />
              {taskSearch && (
                <button className={styles.searchClear} onClick={() => setTaskSearch('')}>
                  ×
                </button>
              )}
            </div>
            <div className={styles.list} ref={listRef}>
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
                filtered.map((task) => {
                  const st = task.status ?? 'pending'
                  const isSelected = selectedId === task.id
                  return (
                    <button
                      key={task.id}
                      ref={isSelected ? selectedItemRef : null}
                      className={`${styles.listItem} ${isSelected ? styles.listItemActive : ''}`}
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
                })
              )}
            </div>
          </>
        )}

        {/* Bugs list */}
        {activeTab === 'bugs' && (
          <>
            <div className={styles.chips}>
              {(
                [
                  { value: 'all', label: 'All' },
                  { value: 'open', label: 'Open' },
                  { value: 'fixed', label: 'Fixed' },
                ] as const
              ).map((f) => (
                <button
                  key={f.value}
                  className={`${styles.chip} ${bugFilter === f.value ? styles.chipActive : ''}`}
                  onClick={() => setBugFilter(f.value)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className={styles.searchBar}>
              <input
                className={styles.searchInput}
                placeholder="Search bugs…"
                value={bugSearch}
                onChange={(e) => setBugSearch(e.target.value)}
              />
              {bugSearch && (
                <button className={styles.searchClear} onClick={() => setBugSearch('')}>
                  ×
                </button>
              )}
            </div>
            <div className={styles.list}>
              {bugs.length === 0 ? (
                <div className={styles.leftEmpty}>
                  <p>No bug reports found.</p>
                  <p>Bugs are created automatically when QA tests fail.</p>
                </div>
              ) : (
                (() => {
                  const filtered = bugs
                    .filter((b) => {
                      if (bugFilter === 'all') return true
                      const s = b.status.toLowerCase()
                      if (bugFilter === 'fixed') return s.includes('fixed') || s.includes('✅')
                      return !s.includes('fixed') && !s.includes('✅')
                    })
                    .filter((b) => {
                      if (!bugSearch.trim()) return true
                      const q = bugSearch.toLowerCase()
                      return b.id.toLowerCase().includes(q) || b.title.toLowerCase().includes(q)
                    })
                  return filtered.length === 0 ? (
                    <div className={styles.leftEmpty}>
                      <p>No {bugSearch ? 'matching' : bugFilter} bugs.</p>
                    </div>
                  ) : (
                    filtered.map((bug) => (
                      <button
                        key={bug.id}
                        className={`${styles.listItem} ${selectedBug?.id === bug.id ? styles.listItemActive : ''}`}
                        onClick={async () => {
                          setSelectedBug(bug)
                          setBugContentLoading(true)
                          const content = await invoke<string>('read_file_content', {
                            path: bug.file_path,
                          }).catch(() => '')
                          setBugContent(content)
                          setBugContentLoading(false)
                        }}
                      >
                        <span
                          className={styles.bugDot}
                          style={
                            bug.status.includes('fixed') || bug.status.includes('✅')
                              ? { background: '#4ade80' }
                              : undefined
                          }
                        />
                        <span className={styles.itemId}>{bug.id}</span>
                        <span className={styles.itemTitle}>{bug.title}</span>
                      </button>
                    ))
                  )
                })()
              )}
            </div>
          </>
        )}
      </div>

      <div className={styles.divider} onMouseDown={onDividerMouseDown} />

      {/* ── Right panel ─────────────────────────────────── */}
      <div className={styles.right}>
        {/* Bug detail panel */}
        {activeTab === 'bugs' && !selectedBug && (
          <div className={styles.noSelection}>
            <span className={styles.noSelectionIcon}>←</span>
            <span>Select a bug</span>
          </div>
        )}
        {activeTab === 'bugs' && selectedBug && (
          <>
            <div className={styles.rightHeader}>
              <div className={styles.rightHeaderInfo}>
                <span className={styles.detailId}>{selectedBug.id}</span>
                <span className={styles.detailTitle}>{selectedBug.title}</span>
              </div>
              <div className={styles.headerActions}>
                {isRunning ? (
                  <span className={styles.runningBadge}>● Fixing…</span>
                ) : isPaused ? (
                  <span className={styles.pausedBadge}>⏸ Paused</span>
                ) : (
                  <button
                    className={styles.fixBtn}
                    onClick={handleFixBug}
                    disabled={!isIdle || !bugContent}
                  >
                    🔧 Fix Bug
                  </button>
                )}
              </div>
            </div>
            <div className={styles.metaRow}>
              {selectedBug.severity && (
                <span className={`${styles.badge} ${styles.badgeDefault}`}>
                  {selectedBug.severity}
                </span>
              )}
              {selectedBug.test_case && (
                <span className={styles.metaItem}>
                  Test: <strong>{selectedBug.test_case}</strong>
                </span>
              )}
              {selectedBug.found_date && (
                <span className={styles.metaItem}>Found {selectedBug.found_date}</span>
              )}
            </div>
            <div className={styles.rightBody}>
              <div className={styles.sectionLabel}>Bug Report</div>
              {bugContentLoading ? (
                <div className={styles.contentSkeleton}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className={styles.contentSkeletonLine}
                      style={{ width: `${70 + (i % 3) * 10}%` }}
                    />
                  ))}
                </div>
              ) : (
                <pre className={styles.contentBlock}>{bugContent}</pre>
              )}
            </div>
          </>
        )}

        {/* Task detail panel */}
        {activeTab === 'tasks' && !selectedTask && (
          <div className={styles.noSelection}>
            <span className={styles.noSelectionIcon}>←</span>
            <span>Select a task</span>
          </div>
        )}
        {activeTab === 'tasks' && selectedTask && (
          <>
            <div className={styles.rightHeader}>
              <div className={styles.rightHeaderInfo}>
                <span className={styles.detailId}>{selectedTask.id}</span>
                <span className={styles.detailTitle}>{selectedTask.title}</span>
              </div>

              <div className={styles.headerActions}>
                {isEditing ? (
                  <>
                    <button className={styles.btnCancel} onClick={handleCancelEdit}>
                      Cancel
                    </button>
                    <button
                      className={styles.btnSave}
                      onClick={handleSave}
                      disabled={!isDirty || saving}
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                  </>
                ) : (
                  <>
                    {taskContent && !isRunning && !isPaused && (
                      <button className={styles.btnEdit} onClick={handleStartEdit}>
                        ✎ Edit
                      </button>
                    )}
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
                  </>
                )}
              </div>
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
              <div className={styles.sectionLabel}>
                Task
                {isDirty && <span className={styles.dirtyDot} title="Unsaved changes" />}
              </div>
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
              ) : isEditing ? (
                <textarea
                  className={styles.contentEditor}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  spellCheck={false}
                  autoFocus
                />
              ) : taskContent ? (
                <pre className={styles.contentBlock} onDoubleClick={handleStartEdit}>
                  {taskContent}
                </pre>
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

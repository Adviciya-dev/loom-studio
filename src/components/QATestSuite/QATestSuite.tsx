import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useApp } from '@/context/AppContext'
import { engineCommand } from '@/lib/ipc'
import type { TestCase, TestCaseStatus } from '@/types/index'
import styles from './QATestSuite.module.css'

const ALL = 'all'

function statusColor(status: TestCaseStatus | 'idle'): string {
  if (status === 'running') return styles.dotRunning
  if (status === 'passed') return styles.dotPassed
  if (status === 'failed') return styles.dotFailed
  return styles.dotIdle
}

function QATestSuite() {
  const { state, dispatch } = useApp()
  const { activeProject, testCases, testStatuses } = state

  const [typeFilter, setTypeFilter] = useState(ALL)
  const [loading, setLoading] = useState(false)

  const [selectedTc, setSelectedTc] = useState<TestCase | null>(null)
  const [testContent, setTestContent] = useState('')
  const [contentLoading, setContentLoading] = useState(false)
  const [sending, setSending] = useState(false)

  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const [splitPct, setSplitPct] = useState(() => {
    const saved = localStorage.getItem('qa-split')
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
      localStorage.setItem('qa-split', String(clamped))
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  useEffect(() => {
    if (!activeProject) return
    setLoading(true)
    invoke<TestCase[]>('read_test_cases', { path: activeProject.path })
      .then((cases) => {
        dispatch({ type: 'SET_TEST_CASES', cases })
        dispatch({ type: 'CLEAR_TEST_RESULTS' })
        setSelectedTc(null)
        setTypeFilter(ALL)
        setIsEditing(false)
      })
      .catch(() => dispatch({ type: 'SET_TEST_CASES', cases: [] }))
      .finally(() => setLoading(false))
  }, [activeProject?.id, dispatch]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedStatus: TestCaseStatus | 'idle' = selectedTc
    ? (testStatuses[selectedTc.id] ?? 'idle')
    : 'idle'

  useEffect(() => {
    if (selectedStatus !== 'idle') setSending(false)
  }, [selectedStatus])

  // Reload file content after test completes so the updated Meta + history are shown
  useEffect(() => {
    if ((selectedStatus === 'passed' || selectedStatus === 'failed') && selectedTc) {
      invoke<string>('read_file_content', { path: selectedTc.file_path })
        .then(setTestContent)
        .catch(() => {})
    }
  }, [selectedStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectTest = useCallback(
    async (tc: TestCase) => {
      if (selectedTc?.id === tc.id) return
      setSelectedTc(tc)
      setSending(false)
      setIsEditing(false)
      setEditContent('')
      setContentLoading(true)
      try {
        const content = await invoke<string>('read_file_content', { path: tc.file_path })
        setTestContent(content)
      } catch {
        setTestContent('')
      } finally {
        setContentLoading(false)
      }
    },
    [selectedTc?.id]
  )

  const handleStop = useCallback(async () => {
    await engineCommand({ action: 'stop_test' }).catch(() => {})
    setSending(false)
  }, [])

  const handleGenerateAndRun = useCallback(async () => {
    if (!activeProject || !selectedTc || sending || selectedStatus === 'running') return
    setSending(true)
    await engineCommand({
      action: 'generate_and_run_test',
      project_path: activeProject.path,
      test_id: selectedTc.id,
      file_path: selectedTc.file_path,
    }).catch(() => setSending(false))
  }, [activeProject, selectedTc, sending, selectedStatus])

  const isDirty = isEditing && editContent !== testContent

  function handleStartEdit() {
    setEditContent(testContent)
    setIsEditing(true)
  }

  function handleCancelEdit() {
    setIsEditing(false)
    setEditContent(testContent)
  }

  async function handleSave() {
    if (!selectedTc || !isDirty) return
    setSaving(true)
    try {
      await invoke('write_file_content', { path: selectedTc.file_path, content: editContent })
      setTestContent(editContent)
      setIsEditing(false)
      // Reload test cases so updated title/type/priority reflect in the list
      if (activeProject) {
        invoke<TestCase[]>('read_test_cases', { path: activeProject.path })
          .then((cases) => dispatch({ type: 'SET_TEST_CASES', cases }))
          .catch(() => {})
      }
    } catch {
      // keep edit mode open on failure
    } finally {
      setSaving(false)
    }
  }

  const types = [ALL, ...Array.from(new Set(testCases.map((tc) => tc.type).filter(Boolean)))]
  const filtered = typeFilter === ALL ? testCases : testCases.filter((tc) => tc.type === typeFilter)

  if (!activeProject) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>🧪</span>
        <span>Select a project to view test cases.</span>
      </div>
    )
  }

  if (loading) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>🧪</span>
        <span>Loading test cases…</span>
      </div>
    )
  }

  return (
    <div className={styles.split} ref={containerRef}>
      {/* ── Left panel ─────────────────────────────────── */}
      <div className={styles.left} style={{ width: `${splitPct}%` }}>
        <div className={styles.leftHeader}>
          <span className={styles.leftTitle}>
            Tests
            {testCases.length > 0 && <span className={styles.count}>{filtered.length}</span>}
          </span>
        </div>

        {types.length > 1 && (
          <div className={styles.chips}>
            {types.map((t) => (
              <button
                key={t}
                className={`${styles.chip} ${typeFilter === t ? styles.chipActive : ''}`}
                onClick={() => setTypeFilter(t)}
              >
                {t === ALL ? 'All' : t}
              </button>
            ))}
          </div>
        )}

        {testCases.length === 0 ? (
          <div className={styles.leftEmpty}>
            <p>No test cases found.</p>
            <p>
              Add <code>.md</code> files to
              <br />
              <code>harness/test_cases/</code>
            </p>
          </div>
        ) : (
          <div className={styles.list}>
            {filtered.map((tc) => {
              const st: TestCaseStatus | 'idle' = testStatuses[tc.id] ?? 'idle'
              const isActive = selectedTc?.id === tc.id
              return (
                <button
                  key={tc.id}
                  className={`${styles.listItem} ${isActive ? styles.listItemActive : ''}`}
                  onClick={() => handleSelectTest(tc)}
                >
                  <span className={`${styles.dot} ${statusColor(st)}`} />
                  <span className={styles.itemId}>{tc.id}</span>
                  <span className={styles.itemTitle}>{tc.title}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className={styles.divider} onMouseDown={onDividerMouseDown} />

      {/* ── Right panel ────────────────────────────────── */}
      <div className={styles.right}>
        {!selectedTc ? (
          <div className={styles.noSelection}>
            <span className={styles.noSelectionIcon}>←</span>
            <span>Select a test case</span>
          </div>
        ) : (
          <>
            <div className={styles.rightHeader}>
              <div className={styles.rightHeaderInfo}>
                <span className={styles.detailId}>{selectedTc.id}</span>
                <span className={styles.detailTitle}>{selectedTc.title}</span>
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
                ) : selectedStatus === 'running' ? (
                  <div className={styles.runningControls}>
                    <span className={styles.runningLabel}>● Claude running…</span>
                    <button className={styles.btnStop} onClick={handleStop}>
                      ■ Stop
                    </button>
                  </div>
                ) : (
                  <>
                    {testContent && (
                      <button className={styles.btnEdit} onClick={handleStartEdit}>
                        ✎ Edit
                      </button>
                    )}
                    <button
                      className={`${styles.btnGenerate} ${sending ? styles.btnWorking : ''}`}
                      onClick={handleGenerateAndRun}
                      disabled={sending}
                    >
                      {sending ? '⟳ Sending…' : '▶ Generate & Run'}
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className={styles.rightBody}>
              {selectedStatus !== 'idle' && (
                <div className={styles.metaRow}>
                  <span
                    className={`${styles.statusBadge} ${styles[`statusBadge_${selectedStatus}`] ?? ''}`}
                  >
                    {selectedStatus === 'running'
                      ? '● Claude is working…'
                      : selectedStatus === 'passed'
                        ? '✓ Passed'
                        : '✗ Failed'}
                  </span>
                  {selectedStatus === 'running' && (
                    <span className={styles.outputHint}>See Output panel ↓</span>
                  )}
                </div>
              )}

              <div className={styles.metaRow}>
                {selectedTc.type && (
                  <span className={`${styles.badge} ${styles.badgeType}`}>{selectedTc.type}</span>
                )}
                {selectedTc.priority && (
                  <span className={`${styles.badge} ${styles.badgePriority}`}>
                    {selectedTc.priority}
                  </span>
                )}
                {selectedTc.automated && (
                  <span className={styles.metaItem}>
                    Auto: <strong>{selectedTc.automated}</strong>
                  </span>
                )}
              </div>

              <div className={styles.section}>
                <div className={styles.sectionLabel}>
                  Test Case
                  {isDirty && <span className={styles.dirtyDot} title="Unsaved changes" />}
                </div>
                {contentLoading ? (
                  <div className={styles.loadingText}>Loading…</div>
                ) : isEditing ? (
                  <textarea
                    className={styles.contentEditor}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    spellCheck={false}
                    autoFocus
                  />
                ) : (
                  <pre className={styles.contentBlock} onDoubleClick={handleStartEdit}>
                    {testContent}
                  </pre>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default QATestSuite

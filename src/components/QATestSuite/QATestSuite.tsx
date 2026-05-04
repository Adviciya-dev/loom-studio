import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useApp } from '@/context/AppContext'
import { engineCommand } from '@/lib/ipc'
import type { TestCase, TestRunResult } from '@/types/index'
import styles from './QATestSuite.module.css'

const ALL = 'all'

function statusLabel(status: string): string {
  if (status === 'running') return '● Running'
  if (status === 'passed') return '● Passed'
  if (status === 'failed') return '● Failed'
  return '● Idle'
}

function QATestSuite() {
  const { state, dispatch } = useApp()
  const { activeProject, testCases, testStatuses, testRunResult, isRunningTests } = state

  const [typeFilter, setTypeFilter] = useState(ALL)
  const [priorityFilter, setPriorityFilter] = useState(ALL)
  const [showReport, setShowReport] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!activeProject) return
    setLoading(true)
    invoke<TestCase[]>('read_test_cases', { path: activeProject.path })
      .then((cases) => {
        dispatch({ type: 'SET_TEST_CASES', cases })
        dispatch({ type: 'CLEAR_TEST_RESULTS' })
        setShowReport(false)
        setTypeFilter(ALL)
        setPriorityFilter(ALL)
      })
      .catch(() => dispatch({ type: 'SET_TEST_CASES', cases: [] }))
      .finally(() => setLoading(false))
  }, [activeProject?.id, dispatch]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (testRunResult) setShowReport(true)
  }, [testRunResult])

  const types = [ALL, ...Array.from(new Set(testCases.map((tc) => tc.type).filter(Boolean)))]
  const priorities = [
    ALL,
    ...Array.from(new Set(testCases.map((tc) => tc.priority).filter(Boolean))),
  ]

  const filtered = testCases.filter((tc) => {
    if (typeFilter !== ALL && tc.type !== typeFilter) return false
    if (priorityFilter !== ALL && tc.priority !== priorityFilter) return false
    return true
  })

  const hasAnyResult = Object.values(testStatuses).some((s) => s !== 'idle')

  const handleRunAll = useCallback(async () => {
    if (!activeProject || isRunningTests || filtered.length === 0) return
    dispatch({ type: 'SET_IS_RUNNING_TESTS', value: true })
    await engineCommand({
      action: 'run_all_test_cases',
      project_path: activeProject.path,
      test_ids: filtered.map((tc) => tc.id),
    }).catch(() => dispatch({ type: 'SET_IS_RUNNING_TESTS', value: false }))
  }, [activeProject, filtered, isRunningTests, dispatch])

  const handleRunSingle = useCallback(
    async (testId: string) => {
      if (!activeProject || isRunningTests) return
      await engineCommand({
        action: 'run_test_case',
        project_path: activeProject.path,
        test_id: testId,
      }).catch(() => {})
    },
    [activeProject, isRunningTests]
  )

  const handleClear = useCallback(() => {
    dispatch({ type: 'CLEAR_TEST_RESULTS' })
    setShowReport(false)
  }, [dispatch])

  const handleRerunFailed = useCallback(async () => {
    if (!activeProject || !testRunResult || isRunningTests) return
    const ids = testRunResult.failedTests.map((ft) => ft.id)
    dispatch({ type: 'SET_IS_RUNNING_TESTS', value: true })
    setShowReport(false)
    await engineCommand({
      action: 'run_all_test_cases',
      project_path: activeProject.path,
      test_ids: ids,
    }).catch(() => dispatch({ type: 'SET_IS_RUNNING_TESTS', value: false }))
  }, [activeProject, testRunResult, isRunningTests, dispatch])

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

  if (showReport && testRunResult) {
    return (
      <ReportView
        result={testRunResult}
        testCases={testCases}
        onBack={() => setShowReport(false)}
        onRerunFailed={handleRerunFailed}
        isRunning={isRunningTests}
      />
    )
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.headerTitle}>
          Test Cases
          {testCases.length > 0 && <span className={styles.headerCount}>{filtered.length}</span>}
        </span>
        <div className={styles.headerActions}>
          {hasAnyResult && (
            <button className={styles.btnSecondary} onClick={handleClear} disabled={isRunningTests}>
              Clear Results
            </button>
          )}
          {testRunResult && (
            <button className={styles.btnSecondary} onClick={() => setShowReport(true)}>
              View Report
            </button>
          )}
          <button
            className={styles.btnPrimary}
            onClick={handleRunAll}
            disabled={isRunningTests || filtered.length === 0}
          >
            {isRunningTests ? '● Running…' : `▶ Run All (${filtered.length})`}
          </button>
        </div>
      </div>

      {/* Filters */}
      {testCases.length > 0 && (
        <div className={styles.filters}>
          <div className={styles.filterGroup}>
            {types.map((t) => (
              <button
                key={t}
                className={`${styles.chip} ${typeFilter === t ? styles.chipActive : ''}`}
                onClick={() => setTypeFilter(t)}
              >
                {t === ALL ? 'All Types' : t}
              </button>
            ))}
          </div>
          {priorities.length > 1 && (
            <div className={styles.filterGroup}>
              {priorities.map((p) => (
                <button
                  key={p}
                  className={`${styles.chip} ${priorityFilter === p ? styles.chipActive : ''}`}
                  onClick={() => setPriorityFilter(p)}
                >
                  {p === ALL ? 'All' : p}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* List */}
      {testCases.length === 0 ? (
        <div className={styles.emptyList}>
          <p className={styles.emptyListTitle}>No test cases found</p>
          <p className={styles.emptyListHint}>
            Create <code>.md</code> files in <code>{activeProject.path}/harness/test_cases/</code>
          </p>
          <p className={styles.emptyListHint}>
            Each file should start with <code># TC-XXX: Title</code>
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.emptyList}>
          <p className={styles.emptyListHint}>No test cases match the current filters.</p>
        </div>
      ) : (
        <div className={styles.list}>
          {filtered.map((tc) => {
            const status = testStatuses[tc.id] ?? 'idle'
            const isExpanded = expanded === tc.id
            return (
              <div key={tc.id} className={`${styles.row} ${styles[`rowStatus_${status}`] ?? ''}`}>
                <div
                  className={styles.rowMain}
                  onClick={() => setExpanded(isExpanded ? null : tc.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setExpanded(isExpanded ? null : tc.id)
                  }}
                >
                  <button
                    className={styles.runBtn}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRunSingle(tc.id)
                    }}
                    disabled={isRunningTests}
                    aria-label={`Run ${tc.id}`}
                    title={`Run ${tc.id}`}
                  >
                    ▶
                  </button>
                  <span className={styles.tcId}>{tc.id}</span>
                  <span className={styles.tcTitle}>{tc.title}</span>
                  <div className={styles.badges}>
                    {tc.type && (
                      <span className={`${styles.badge} ${styles.badgeType}`}>{tc.type}</span>
                    )}
                    {tc.priority && (
                      <span className={`${styles.badge} ${styles.badgePriority}`}>
                        {tc.priority}
                      </span>
                    )}
                    <span
                      className={`${styles.statusPill} ${styles[`statusPill_${status}`] ?? ''}`}
                    >
                      {statusLabel(status)}
                    </span>
                  </div>
                  <span className={`${styles.chevron} ${isExpanded ? styles.chevronOpen : ''}`}>
                    ›
                  </span>
                </div>

                {isExpanded && (
                  <div className={styles.rowDetail}>
                    <div className={styles.detailMeta}>
                      {tc.type && (
                        <span>
                          Type: <strong>{tc.type}</strong>
                        </span>
                      )}
                      {tc.priority && (
                        <span>
                          Priority: <strong>{tc.priority}</strong>
                        </span>
                      )}
                      {tc.automated && (
                        <span>
                          Automated: <strong>{tc.automated}</strong>
                        </span>
                      )}
                    </div>
                    <div className={styles.detailPath}>{tc.file_path}</div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface ReportViewProps {
  result: TestRunResult
  testCases: TestCase[]
  onBack: () => void
  onRerunFailed: () => void
  isRunning: boolean
}

function ReportView({ result, testCases, onBack, onRerunFailed, isRunning }: ReportViewProps) {
  const titleFor = (id: string) => testCases.find((tc) => tc.id === id)?.title ?? id

  return (
    <div className={styles.report}>
      <div className={styles.reportHeader}>
        <span className={styles.headerTitle}>Test Results</span>
        <span className={styles.reportDuration}>{result.duration}</span>
      </div>

      <div className={styles.summaryCards}>
        <div className={styles.card}>
          <span className={styles.cardNum}>{result.total}</span>
          <span className={styles.cardLabel}>Total</span>
        </div>
        <div className={`${styles.card} ${styles.cardPassed}`}>
          <span className={styles.cardNum}>{result.passed}</span>
          <span className={styles.cardLabel}>Passed</span>
        </div>
        <div className={`${styles.card} ${styles.cardFailed}`}>
          <span className={styles.cardNum}>{result.failed}</span>
          <span className={styles.cardLabel}>Failed</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardNum}>{result.passRate}%</span>
          <span className={styles.cardLabel}>Pass Rate</span>
        </div>
      </div>

      <div className={styles.progressTrack}>
        <div className={styles.progressFill} style={{ width: `${result.passRate}%` }} />
      </div>

      {result.failedTests.length > 0 && (
        <div className={styles.failedSection}>
          <span className={styles.failedSectionTitle}>Failed ({result.failedTests.length})</span>
          {result.failedTests.map((ft) => (
            <div key={ft.id} className={styles.failedRow}>
              <div className={styles.failedRowHeader}>
                <span className={styles.failIcon}>✗</span>
                <span className={styles.failId}>{ft.id}</span>
                <span className={styles.failTitle}>{titleFor(ft.id)}</span>
              </div>
              {ft.error && <pre className={styles.failError}>{ft.error}</pre>}
            </div>
          ))}
        </div>
      )}

      <div className={styles.reportFooter}>
        <button className={styles.btnSecondary} onClick={onBack}>
          ↩ Back to List
        </button>
        {result.failedTests.length > 0 && (
          <button className={styles.btnPrimary} onClick={onRerunFailed} disabled={isRunning}>
            {isRunning ? '● Running…' : `↺ Re-run Failed (${result.failedTests.length})`}
          </button>
        )}
      </div>
    </div>
  )
}

export default QATestSuite

export interface Project {
  id: string
  name: string
  path: string
  color: string
  addedAt: string
}

export interface TaskStep {
  text: string
  done: boolean
}

export const TASK_TYPES = ['feature', 'perf', 'security', 'test', 'design'] as const
export type TaskType = (typeof TASK_TYPES)[number]

export const TASK_STATUSES = ['pending', 'in-progress', 'completed'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export interface Task {
  id: string
  title: string
  type: TaskType
  status: TaskStatus
  due: string | null
  description: string
  steps: TaskStep[]
  prompt: string
  filename?: string
  file_path?: string
  commitHash?: string
}

export interface Preferences {
  theme: 'dark' | 'light'
  logAutoscroll: boolean
  defaultDiffView: 'split' | 'unified'
}

export interface HarnessTemplate {
  id: string
  label: string
  prompt: string
}

export const ENGINE_STATUSES = [
  'idle',
  'running',
  'paused',
  'awaiting_approval',
  'completed',
] as const
export type EngineStatus = (typeof ENGINE_STATUSES)[number]

export const LOG_LEVELS = ['INFO', 'SUCCESS', 'WARN', 'ERROR', 'PASS', 'CLAUDE'] as const
export type LogLevel = (typeof LOG_LEVELS)[number]

export interface LogLine {
  timestamp: string
  level: LogLevel
  content: string
  kind?: 'prose' | 'tool' | 'result'
}

export interface DiffLine {
  lineNumber: number
  type: 'add' | 'rem' | 'neutral'
  content: string
}

export interface DiffFile {
  name: string
  added: number
  removed: number
  lines: DiffLine[]
}

export interface DiffPayload {
  sessionId: string
  files: DiffFile[]
}

export interface TestCase {
  id: string
  title: string
  type: string
  priority: string
  automated: string
  file_path: string
  linked_task: string
}

export const TEST_CASE_STATUSES = ['idle', 'running', 'passed', 'failed'] as const
export type TestCaseStatus = (typeof TEST_CASE_STATUSES)[number]

// ── Content Quality Checker ───────────────────────────────────────────────────

export interface CqcClient {
  id: string
  name: string
  tone: string
  audience: string
  restrictions: string
  keywords: string
  created_at: string
}

export interface CqcIssue {
  type: 'spelling' | 'grammar' | 'brand' | 'fact'
  severity: 'high' | 'medium' | 'low'
  snippet: string
  explanation: string
  suggested_fix?: string
}

export interface CqcCheckResult {
  approved: boolean
  summary: string
  issues: CqcIssue[]
  extracted_text: string
}

export interface CqcLogEntry {
  id: string
  client_id: string
  user: string
  content_preview: string
  issue_count: number
  approved: boolean
  summary: string
  issues_json: string
  created_at: string
}

export type CqcProgressStep = 'building_prompt' | 'running_claude' | 'parsing_result' | 'saving_log'

export type CqcSubView = 'check' | 'check-result' | 'clients' | 'log'

// ── Bug reports ───────────────────────────────────────────────────────────────

export interface BugItem {
  id: string
  title: string
  status: string
  severity: string
  test_case: string
  found_date: string
  file_path: string
}

export interface ScriptItem {
  test_id: string
  name: string
  file_path: string
}

export interface TestRunResult {
  total: number
  passed: number
  failed: number
  duration: string
  passRate: number
  failedTests: Array<{ id: string; error: string }>
}

// ─── Site Audit ────────────────────────────────────────────────────────────

export type AuditPhase =
  | 'intake'
  | 'running'
  | 'done'
  | 'report'
  | 'goals'
  | 'cancelled'
  | 'complete'

export type CmsOption = 'wordpress' | 'nextjs' | 'nuxt' | 'laravel' | 'shopify' | 'custom' | 'other'

export interface AuditIntake {
  siteUrl: string
  siteName: string
  cms: CmsOption
  cmsOther: string
  industry: string
  nicheKeywords: string
  targetMarket: string
  competitors: string[]
  localRepoPath: string | null
  businessGoal: string
  budgetTimeline: string
}

export interface AuditSession {
  id: string
  version: number
  projectId: string
  siteName: string
  siteUrl: string
  createdAt: string
  updatedAt: string
  phase: AuditPhase
  intakePath: string
  reportPath: string | null
  taskCount: number
}

export type DimensionStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped'

export interface AuditDimensionStatus {
  key: string
  label: string
  status: DimensionStatus
  score: number | null
  errorMessage: string | null
}

export type GoalBucket =
  | 'critical'
  | 'this_week'
  | 'high_priority'
  | 'this_month'
  | 'ongoing'
  | 'content_links'

export interface GoalTask {
  id: string
  title: string
  bucket: GoalBucket
  dimension: string
  effort: 'Low' | 'Medium' | 'High'
  owner: string | null
  notes: string
  linkedReportSection: string
}

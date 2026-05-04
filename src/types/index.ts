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
}

export const TEST_CASE_STATUSES = ['idle', 'running', 'passed', 'failed'] as const
export type TestCaseStatus = (typeof TEST_CASE_STATUSES)[number]

export interface TestRunResult {
  total: number
  passed: number
  failed: number
  duration: string
  passRate: number
  failedTests: Array<{ id: string; error: string }>
}

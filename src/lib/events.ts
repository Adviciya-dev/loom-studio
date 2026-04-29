import { listen } from '@tauri-apps/api/event'
import type {
  LogLine,
  DiffPayload,
  Task,
  Project,
  Preferences,
  EngineStatus,
  HarnessTemplate,
} from '@/types'

// ─── Payload types ────────────────────────────────────────────────────────────

export interface TaskCompletePayload {
  task_id: string
  commit_hash: string
}

export interface EngineErrorPayload {
  message: string
}

// ─── Event listeners ──────────────────────────────────────────────────────────

export const onEngineReady = (cb: () => void) => listen<null>('engine_ready', () => cb())

export const onLogLine = (cb: (line: LogLine) => void) =>
  listen<LogLine>('log_line', (e) => cb(e.payload))

export const onDiffReady = (cb: (diff: DiffPayload) => void) =>
  listen<DiffPayload>('diff_ready', (e) => cb(e.payload))

export const onTaskComplete = (cb: (taskId: string, commitHash: string) => void) =>
  listen<TaskCompletePayload>('task_complete', (e) => cb(e.payload.task_id, e.payload.commit_hash))

export const onEngineError = (cb: (message: string) => void) =>
  listen<EngineErrorPayload>('engine_error', (e) => cb(e.payload.message))

export const onProjects = (cb: (projects: Project[]) => void) =>
  listen<Project[]>('projects', (e) => cb(e.payload))

export const onTasks = (cb: (tasks: Task[]) => void) =>
  listen<Task[]>('tasks', (e) => cb(e.payload))

export const onPreferences = (cb: (prefs: Preferences) => void) =>
  listen<Preferences>('preferences', (e) => cb(e.payload))

export const onEngineStatus = (cb: (status: EngineStatus) => void) =>
  listen<EngineStatus>('engine_status', (e) => cb(e.payload))

export const onStoreReset = (cb: () => void) => listen<null>('store_reset', () => cb())

export interface GitInfoPayload {
  branch: string
  branches: string[]
}

export interface GitCommittedPayload {
  hash: string
}

export const onGitInfo = (cb: (info: GitInfoPayload) => void) =>
  listen<GitInfoPayload>('git_info', (e) => cb(e.payload))

export const onGitCommitted = (cb: (payload: GitCommittedPayload) => void) =>
  listen<GitCommittedPayload>('git_committed', (e) => cb(e.payload))

export interface GitRemoteInfoPayload {
  url: string
  ahead: number
  behind: number
}

export const onGitRemoteInfo = (cb: (info: GitRemoteInfoPayload) => void) =>
  listen<GitRemoteInfoPayload>('git_remote_info', (e) => cb(e.payload))

export const onSshUnlocked = (cb: () => void) => listen<null>('ssh_unlocked', () => cb())

export const onHarnessLogLine = (cb: (line: LogLine) => void) =>
  listen<LogLine>('harness_log_line', (e) => cb(e.payload))

export const onHarnessDone = (cb: () => void) => listen<null>('harness_done', () => cb())

export const onGhAvailable = (cb: (available: boolean) => void) =>
  listen<{ available: boolean }>('gh_available', (e) => cb(e.payload.available))

export const onGhDefaultBranch = (cb: (branch: string) => void) =>
  listen<{ branch: string }>('gh_default_branch', (e) => cb(e.payload.branch))

export const onGitLogBranchResult = (cb: (commits: string[]) => void) =>
  listen<{ commits: string[] }>('git_log_branch_result', (e) => cb(e.payload.commits))

export const onGitBranchPushedResult = (cb: (pushed: boolean) => void) =>
  listen<{ pushed: boolean }>('git_branch_pushed_result', (e) => cb(e.payload.pushed))

export const onGhPrCreated = (cb: (url: string) => void) =>
  listen<{ url: string }>('gh_pr_created', (e) => cb(e.payload.url))

export interface GhPrPayload {
  number: number
  title: string
  headRefName: string
  state: string
  url: string
}

export const onGhPrListResult = (cb: (prs: GhPrPayload[]) => void) =>
  listen<{ prs: GhPrPayload[] }>('gh_pr_list_result', (e) => cb(e.payload.prs))

export const onGitPullDiverged = (cb: (branch: string) => void) =>
  listen<{ branch: string }>('git_pull_diverged', (e) => cb(e.payload.branch))

export const onGitPullConflicts = (cb: (files: string[], branch: string) => void) =>
  listen<{ files: string[]; branch: string }>('git_pull_conflicts', (e) =>
    cb(e.payload.files, e.payload.branch)
  )

export const onGitMergeAborted = (cb: () => void) => listen<null>('git_merge_aborted', () => cb())

export const onTemplates = (cb: (templates: HarnessTemplate[]) => void) =>
  listen<HarnessTemplate[]>('templates', (e) => cb(e.payload))

import { invoke } from '@tauri-apps/api/core'
import type { Project, Preferences } from '@/types'

// ─── Tauri commands ────────────────────────────────────────────────────────────

/** Opens the native OS folder picker. Returns the selected path or null if cancelled. */
export const openFolderPicker = (): Promise<string | null> =>
  invoke<string | null>('open_folder_picker')

/** Reads all .md files from {projectPath}/harness/. Returns empty array if folder missing. */
export const readHarnessTasks = (
  projectPath: string
): Promise<Array<{ filename: string; content: string }>> =>
  invoke('read_harness_tasks', { path: projectPath })

/** Sends a typed command to the Go engine via stdin. Engine responds via events. */
export const engineCommand = (payload: EngineCommand): Promise<void> =>
  invoke('engine_command', { payload })

// ─── Engine command types ─────────────────────────────────────────────────────

export type EngineCommand =
  | { action: 'get_projects' }
  | { action: 'save_project'; project: Project }
  | { action: 'set_active_project'; id: string }
  | { action: 'get_preferences' }
  | { action: 'save_preferences'; preferences: Preferences }
  | { action: 'get_tasks'; path: string }
  | { action: 'start'; task_id: string; task_title: string; prompt: string; project_path: string }
  | { action: 'approve' }
  | { action: 'reject' }
  | { action: 'pause' }
  | { action: 'resume' }
  | { action: 'kill' }
  | { action: 'git_status'; project_path: string }
  | { action: 'git_remote_info'; project_path: string; branch: string }
  | { action: 'git_ssh_unlock'; passphrase: string }
  | {
      action: 'harness_chat'
      message: string
      history: { role: string; content: string }[]
      project_path: string
    }
  | { action: 'gh_check' }
  | { action: 'gh_default_branch'; project_path: string }
  | { action: 'git_log_branch'; project_path: string; base: string }
  | { action: 'git_branch_pushed'; project_path: string; branch: string }
  | {
      action: 'gh_pr_create'
      project_path: string
      title: string
      body: string
      base: string
      draft: boolean
    }
  | { action: 'gh_pr_list'; project_path: string }
  | { action: 'git_fetch'; project_path: string; branch: string }
  | { action: 'git_pull'; project_path: string; branch: string }
  | { action: 'git_push'; project_path: string; branch: string }
  | { action: 'git_checkout'; branch: string; project_path: string }
  | { action: 'git_create_branch'; branch: string; project_path: string }
  | { action: 'git_commit'; message: string; project_path: string }
  | { action: 'ping' }
  | { action: 'save_task_history'; task_id: string; project_id: string; completed_at: string }
  | { action: 'diff_retry' }

export type RawTaskFile = { filename: string; content: string }

// ─── Event listeners (re-exported from events.ts) ─────────────────────────────

export {
  onEngineReady,
  onLogLine,
  onDiffReady,
  onTaskComplete,
  onEngineError,
  onProjects,
  onTasks,
  onPreferences,
  onEngineStatus,
  onStoreReset,
  onGitInfo,
  onGitCommitted,
  onGitRemoteInfo,
  onSshUnlocked,
} from './events'

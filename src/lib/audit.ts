import { invoke } from '@tauri-apps/api/core'
import type { AuditIntake, AuditSession } from '@/types'

export async function auditSaveIntake(
  projectPath: string,
  sessionId: string,
  intake: AuditIntake
): Promise<void> {
  return invoke('audit_save_intake', { projectPath, sessionId, intake })
}

export async function auditListSessions(projectPath: string): Promise<AuditSession[]> {
  return invoke('audit_list_sessions', { projectPath })
}

export async function auditLoadSession(
  projectPath: string,
  sessionId: string
): Promise<AuditSession> {
  return invoke('audit_load_session', { projectPath, sessionId })
}

export async function auditOpenFolder(): Promise<string | null> {
  return invoke('audit_open_folder')
}

export async function auditSaveDraft(
  projectPath: string,
  sessionId: string,
  draft: unknown
): Promise<void> {
  return invoke('audit_save_draft', { projectPath, sessionId, draft })
}

export async function auditLoadDraft(
  projectPath: string,
  sessionId: string
): Promise<unknown | null> {
  return invoke('audit_load_draft', { projectPath, sessionId })
}

export async function auditStart(projectPath: string, sessionId: string): Promise<void> {
  return invoke('audit_start', { projectPath, sessionId })
}

export async function auditCancel(sessionId: string): Promise<void> {
  return invoke('audit_cancel', { sessionId })
}

export async function auditGenerateReport(projectPath: string, sessionId: string): Promise<void> {
  return invoke('audit_generate_report', { projectPath, sessionId })
}

export async function auditReadReport(projectPath: string, sessionId: string): Promise<string> {
  return invoke('audit_read_report', { projectPath, sessionId })
}

export async function auditExportReport(
  projectPath: string,
  sessionId: string,
  siteName: string
): Promise<string> {
  return invoke('audit_export_report', { projectPath, sessionId, siteName })
}

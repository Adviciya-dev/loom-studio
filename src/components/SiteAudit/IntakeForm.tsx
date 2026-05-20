import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import {
  auditSaveIntake,
  auditListSessions,
  auditSaveDraft,
  auditLoadDraft,
  auditLoadSession,
  auditStart,
} from '@/lib/audit'
import type { AuditIntake, AuditSession, CmsOption } from '@/types'
import {
  INITIAL_FORM_STATE,
  validateForm,
  hasErrors,
  normaliseUrl,
  type IntakeFormState,
  type FormErrors,
} from '@/lib/validateIntake'
import { CompetitorList } from './CompetitorList'
import { RepoPicker } from './RepoPicker'
import styles from './IntakeForm.module.css'

const CMS_OPTIONS: { value: CmsOption; label: string }[] = [
  { value: 'wordpress', label: 'WordPress' },
  { value: 'nextjs', label: 'Next.js' },
  { value: 'nuxt', label: 'Nuxt' },
  { value: 'laravel', label: 'Laravel' },
  { value: 'shopify', label: 'Shopify' },
  { value: 'custom', label: 'Custom' },
  { value: 'other', label: 'Other' },
]

export function IntakeForm() {
  const { state, dispatch } = useApp()
  const { activeProject, activeAuditSession, auditSessions } = state

  const [form, setForm] = useState<IntakeFormState>(INITIAL_FORM_STATE)
  const [errors, setErrors] = useState<FormErrors>({ competitors: [] })
  const [saving, setSaving] = useState(false)
  const [draftBanner, setDraftBanner] = useState(false)
  const [showDuplicate, setShowDuplicate] = useState(false)
  const [pendingDuplicate, setPendingDuplicate] = useState<AuditSession | null>(null)
  const [pendingForm, setPendingForm] = useState<IntakeFormState | null>(null)
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!activeAuditSession || !activeProject) {
      setForm(INITIAL_FORM_STATE)
      return
    }
    // Try draft first, then saved intake
    auditLoadDraft(activeProject.path, activeAuditSession.id)
      .then((draft) => {
        if (draft && activeAuditSession.phase === 'intake') {
          const d = draft as Record<string, unknown>
          setForm({ ...INITIAL_FORM_STATE, ...(d as Partial<IntakeFormState>) })
          setDraftBanner(true)
          return
        }
        return auditLoadSession(activeProject.path, activeAuditSession.id)
          .then((session) => {
            const intake = (session as unknown as Record<string, unknown>).intake as
              | Partial<IntakeFormState>
              | undefined
            if (intake) setForm({ ...INITIAL_FORM_STATE, ...intake })
            else setForm(INITIAL_FORM_STATE)
          })
          .catch(() => setForm(INITIAL_FORM_STATE))
      })
      .catch(() => setForm(INITIAL_FORM_STATE))
    setErrors({ competitors: [] })
    setDraftBanner(false)
  }, [activeAuditSession?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function patch(updates: Partial<IntakeFormState>) {
    setForm((f) => {
      const next = { ...f, ...updates }
      scheduleDraft(next)
      return next
    })
  }

  function scheduleDraft(next: IntakeFormState) {
    if (!activeAuditSession || !activeProject) return
    if (draftTimer.current) clearTimeout(draftTimer.current)
    draftTimer.current = setTimeout(() => {
      auditSaveDraft(activeProject.path, activeAuditSession.id, {
        ...next,
        sessionId: activeAuditSession.id,
        savedAt: new Date().toISOString(),
      }).catch(() => {})
    }, 300)
  }

  async function handleSave() {
    const normalised = {
      ...form,
      siteUrl: normaliseUrl(form.siteUrl),
      competitors: form.competitors.filter((c) => c.trim()),
    }
    const errs = validateForm(normalised)
    if (hasErrors(errs)) {
      setErrors(errs)
      return
    }
    const dup = auditSessions.find(
      (s) => s.id !== activeAuditSession?.id && s.siteUrl === normalised.siteUrl
    )
    if (dup) {
      setPendingDuplicate(dup)
      setPendingForm(normalised)
      setShowDuplicate(true)
      return
    }
    await doSave(normalised)
  }

  async function doSave(f: IntakeFormState) {
    if (!activeAuditSession || !activeProject) return
    setSaving(true)
    try {
      await auditSaveIntake(activeProject.path, activeAuditSession.id, f as unknown as AuditIntake)
      dispatch({ type: 'AUDIT_INTAKE_SAVED', payload: f as unknown as AuditIntake })
      const sessions = await auditListSessions(activeProject.path)
      dispatch({ type: 'AUDIT_SESSIONS_LOADED', payload: sessions })
      setErrors({ competitors: [] })
    } catch {
      /* keep form — toast handled by parent in future */
    } finally {
      setSaving(false)
    }
  }

  const hasSavedIntake = !!activeAuditSession?.siteUrl
  const phaseWarning = activeAuditSession && activeAuditSession.phase !== 'intake'

  async function handleStartAudit() {
    if (!activeProject || !activeAuditSession) return
    dispatch({ type: 'AUDIT_STARTED' })
    await auditStart(activeProject.path, activeAuditSession.id).catch(() => {})
  }

  const field = (label: string, required: boolean, error?: string, children?: React.ReactNode) => (
    <div className={styles.fieldGroup}>
      <label className={styles.label}>
        {label}
        {required && <span className={styles.req}>*</span>}
      </label>
      {children}
      {error && <span className={styles.errorMsg}>{error}</span>}
    </div>
  )

  if (!activeAuditSession) {
    return <div className={styles.empty}>Select or create a session to begin.</div>
  }

  return (
    <div className={styles.shell}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>Site Audit — Intake</span>
        <span className={styles.headerSub}>{activeAuditSession.siteName || 'New audit'}</span>
      </div>

      <div className={styles.body}>
        {phaseWarning && (
          <div className={styles.warnBanner}>
            <AlertTriangle size={13} strokeWidth={2} />
            Audit data exists for this session. Re-saving will not re-run the audit automatically.
          </div>
        )}
        {draftBanner && (
          <div className={styles.infoBanner}>
            Unsaved draft restored.
            <button className={styles.bannerClose} onClick={() => setDraftBanner(false)}>
              <X size={12} />
            </button>
          </div>
        )}

        {field(
          'Site URL',
          true,
          errors.siteUrl,
          <input
            className={`${styles.input} ${errors.siteUrl ? styles.inputError : ''}`}
            type="url"
            placeholder="https://example.com"
            value={form.siteUrl}
            onChange={(e) => patch({ siteUrl: e.target.value })}
          />
        )}
        {field(
          'Site name',
          true,
          errors.siteName,
          <input
            className={`${styles.input} ${errors.siteName ? styles.inputError : ''}`}
            placeholder="Acme Corp"
            value={form.siteName}
            onChange={(e) => patch({ siteName: e.target.value })}
          />
        )}
        {field(
          'CMS / Stack',
          true,
          undefined,
          <>
            <select
              className={styles.select}
              value={form.cms}
              onChange={(e) => patch({ cms: e.target.value as CmsOption })}
            >
              {CMS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {form.cms === 'other' && (
              <div className={styles.fieldGroup} style={{ marginTop: 8 }}>
                <input
                  className={`${styles.input} ${errors.cmsOther ? styles.inputError : ''}`}
                  placeholder="Describe your stack"
                  value={form.cmsOther}
                  onChange={(e) => patch({ cmsOther: e.target.value })}
                />
                {errors.cmsOther && <span className={styles.errorMsg}>{errors.cmsOther}</span>}
              </div>
            )}
          </>
        )}
        {field(
          'Industry',
          true,
          errors.industry,
          <input
            className={`${styles.input} ${errors.industry ? styles.inputError : ''}`}
            placeholder="e.g. E-commerce, SaaS"
            value={form.industry}
            onChange={(e) => patch({ industry: e.target.value })}
          />
        )}
        {field(
          'Niche + keywords',
          true,
          errors.nicheKeywords,
          <textarea
            className={`${styles.textarea} ${errors.nicheKeywords ? styles.inputError : ''}`}
            rows={3}
            placeholder="Target keywords, niche description…"
            value={form.nicheKeywords}
            onChange={(e) => patch({ nicheKeywords: e.target.value })}
          />
        )}
        {field(
          'Target market',
          true,
          errors.targetMarket,
          <input
            className={`${styles.input} ${errors.targetMarket ? styles.inputError : ''}`}
            placeholder="e.g. UK B2B SaaS founders, 30-50"
            value={form.targetMarket}
            onChange={(e) => patch({ targetMarket: e.target.value })}
          />
        )}
        {field(
          'Competitors',
          false,
          undefined,
          <CompetitorList
            values={form.competitors}
            errors={errors.competitors}
            onChange={(v) => patch({ competitors: v })}
          />
        )}
        {field(
          'Local repo path',
          false,
          errors.localRepoPath,
          <RepoPicker
            path={form.localRepoPath}
            error={errors.localRepoPath}
            onChange={(p) => patch({ localRepoPath: p })}
            onError={(msg) => setErrors((e) => ({ ...e, localRepoPath: msg || undefined }))}
          />
        )}
        {field(
          'Business goal',
          true,
          errors.businessGoal,
          <textarea
            className={`${styles.textarea} ${errors.businessGoal ? styles.inputError : ''}`}
            rows={3}
            placeholder="What does the business want to achieve?"
            value={form.businessGoal}
            onChange={(e) => patch({ businessGoal: e.target.value })}
          />
        )}
        {field(
          'Budget / timeline',
          false,
          undefined,
          <input
            className={styles.input}
            placeholder="e.g. 3 months, £5k budget"
            value={form.budgetTimeline}
            onChange={(e) => patch({ budgetTimeline: e.target.value })}
          />
        )}
      </div>

      <div className={styles.footer}>
        <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save intake'}
        </button>
        <button className={styles.startBtn} onClick={handleStartAudit} disabled={!hasSavedIntake}>
          Start Audit ▶
        </button>
      </div>

      {showDuplicate && pendingDuplicate && (
        <div className={styles.dialogBackdrop}>
          <div className={styles.dialog}>
            <p className={styles.dialogMsg}>
              You already have an audit for <strong>{pendingDuplicate.siteUrl}</strong>. Start a new
              one or continue the existing session?
            </p>
            <div className={styles.dialogActions}>
              <button
                className={styles.cancelBtn}
                onClick={() => {
                  dispatch({ type: 'AUDIT_ACTIVE_SESSION_SET', payload: pendingDuplicate })
                  setShowDuplicate(false)
                }}
              >
                Continue existing
              </button>
              <button
                className={styles.saveBtn}
                onClick={() => {
                  setShowDuplicate(false)
                  if (pendingForm) doSave(pendingForm)
                }}
              >
                Start new
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

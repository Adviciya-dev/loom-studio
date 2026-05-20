import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Plus, Users } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import type { CqcClient } from '@/types'
import styles from './ClientsPanel.module.css'

type FormState = {
  id: string
  name: string
  tone: string
  audience: string
  restrictions: string
  keywords: string
}

function emptyForm(): FormState {
  return { id: '', name: '', tone: '', audience: '', restrictions: '', keywords: '' }
}

function ClientsPanel() {
  const { state } = useApp()
  const { activeProject, globalCqcPath, cqcClients } = state
  const cqcPath = activeProject?.path ?? globalCqcPath

  const [selected, setSelected] = useState<string | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)

  function handleNew() {
    setSelected(null)
    setForm(emptyForm())
  }

  function handleSelect(client: CqcClient) {
    setSelected(client.id)
    setForm({
      id: client.id,
      name: client.name,
      tone: client.tone,
      audience: client.audience,
      restrictions: client.restrictions,
      keywords: client.keywords,
    })
  }

  function handleCancel() {
    setForm(null)
    setSelected(null)
  }

  async function handleSave() {
    if (!cqcPath || !form || !form.name.trim()) return
    setSaving(true)
    try {
      await invoke('cqc_save_client', {
        projectPath: cqcPath,
        client: {
          id: form.id || undefined,
          name: form.name.trim(),
          tone: form.tone.trim(),
          audience: form.audience.trim(),
          restrictions: form.restrictions.trim(),
          keywords: form.keywords.trim(),
        },
      })
      setForm(null)
      setSelected(null)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!cqcPath || !selected) return
    if (!confirm('Delete this client? This cannot be undone.')) return
    await invoke('cqc_delete_client', { projectPath: cqcPath, id: selected })
    setForm(null)
    setSelected(null)
  }

  function field(key: keyof Omit<FormState, 'id'>, value: string) {
    setForm((f) => (f ? { ...f, [key]: value } : f))
  }

  return (
    <div className={styles.root}>
      {/* Left: client list */}
      <div className={styles.list}>
        <div className={styles.listHeader}>
          <span className={styles.listTitle}>Clients</span>
          <button className={styles.addBtn} onClick={handleNew}>
            <Plus size={12} strokeWidth={2.5} />
            New
          </button>
        </div>
        <div className={styles.listItems}>
          {cqcClients.length === 0 && <div className={styles.emptyList}>No clients yet</div>}
          {cqcClients.map((c) => (
            <div
              key={c.id}
              className={`${styles.clientItem} ${selected === c.id ? styles.clientItemActive : ''}`}
              onClick={() => handleSelect(c)}
            >
              <div className={styles.clientAvatar}>{c.name[0]?.toUpperCase()}</div>
              <div>
                <div className={styles.clientName}>{c.name}</div>
                {c.tone && <div className={styles.clientTone}>{c.tone}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: form or placeholder */}
      {form ? (
        <div className={styles.form}>
          <div className={styles.formTitle}>{form.id ? 'Edit Client' : 'New Client'}</div>

          <div className={styles.field}>
            <label className={styles.label}>Client name *</label>
            <input
              className={styles.input}
              placeholder="e.g. Acme Corp"
              value={form.name}
              onChange={(e) => field('name', e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Tone of voice</label>
            <input
              className={styles.input}
              placeholder="e.g. Professional, friendly, no slang"
              value={form.tone}
              onChange={(e) => field('tone', e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Target audience</label>
            <input
              className={styles.input}
              placeholder="e.g. B2B SaaS founders, 25-45"
              value={form.audience}
              onChange={(e) => field('audience', e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Restrictions / banned words</label>
            <span className={styles.hint}>Words or phrases that must never appear</span>
            <textarea
              className={styles.textarea}
              placeholder="e.g. competitor names, slang, emoji"
              value={form.restrictions}
              onChange={(e) => field('restrictions', e.target.value)}
              rows={3}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Required keywords / hashtags</label>
            <span className={styles.hint}>Must be present in approved content</span>
            <textarea
              className={styles.textarea}
              placeholder="e.g. #AcmeCorp, Acme™"
              value={form.keywords}
              onChange={(e) => field('keywords', e.target.value)}
              rows={3}
            />
          </div>

          <div className={styles.actions}>
            <button
              className={styles.saveBtn}
              onClick={handleSave}
              disabled={saving || !form.name.trim()}
            >
              {saving ? 'Saving…' : 'Save Client'}
            </button>
            <button className={styles.cancelBtn} onClick={handleCancel}>
              Cancel
            </button>
            {form.id && (
              <button className={styles.deleteBtn} onClick={handleDelete}>
                Delete
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className={styles.noSelection}>
          <Users size={28} strokeWidth={1.25} style={{ opacity: 0.25 }} />
          <span>Select a client to edit or click New to add one</span>
        </div>
      )}
    </div>
  )
}

export default ClientsPanel

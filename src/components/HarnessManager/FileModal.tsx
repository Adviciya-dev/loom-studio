import { useEffect, useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import styles from './FileModal.module.css'

interface Props {
  path: string
  onClose: () => void
  onAttach?: (path: string) => void
}

function renderMarkdown(text: string): string {
  return text
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hlbi]|<li|<block)(.+)$/gm, '$1<br/>')
}

function FileModal({ path, onClose, onAttach }: Props) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const fileName = path.split('/').pop() ?? path
  const ext = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() : ''
  const isMarkdown = ext === 'md' || ext === 'mdx'
  const isSvg = ext === 'svg'

  useEffect(() => {
    invoke<string>('read_file_content', { path })
      .then(setContent)
      .catch((e: unknown) => setError(String(e)))
  }, [path])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (editing) {
          setEditing(false)
          setEditValue('')
        } else onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, editing])

  const handleCopy = useCallback(() => {
    if (!content) return
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [content])

  function handleEdit() {
    setEditValue(content ?? '')
    setSaveError(null)
    setEditing(true)
  }

  function handleCancel() {
    setEditing(false)
    setEditValue('')
    setSaveError(null)
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      await invoke('write_file_content', { path, content: editValue })
      setContent(editValue)
      setEditing(false)
      setEditValue('')
    } catch (e: unknown) {
      setSaveError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const lines = content?.split('\n') ?? []

  return (
    <div className={styles.overlay} onClick={editing ? undefined : onClose} role="presentation">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog">
        <div className={styles.header}>
          <span className={styles.filePath}>{path}</span>
          {!editing && content && !isSvg && (
            <span className={styles.lineCount}>{lines.length.toLocaleString()} lines</span>
          )}
          {!editing && content && (
            <button className={styles.copyBtn} onClick={handleCopy} title="Copy content">
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          )}
          {!editing && content && (
            <button className={styles.editBtn} onClick={handleEdit} title="Edit file">
              Edit
            </button>
          )}
          {!editing && onAttach && (
            <button
              className={styles.attachBtn}
              onClick={() => onAttach(path)}
              title="Attach to chat"
            >
              📎 Attach to chat
            </button>
          )}
          {editing ? (
            <>
              <button className={styles.cancelBtn} onClick={handleCancel} disabled={saving}>
                Cancel
              </button>
              <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          ) : (
            <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
              ×
            </button>
          )}
        </div>

        {saveError && <div className={styles.saveError}>{saveError}</div>}

        <div className={styles.body}>
          {editing ? (
            <textarea
              className={styles.editor}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              spellCheck={false}
              autoFocus
            />
          ) : error ? (
            <div className={styles.error}>{error}</div>
          ) : content === null ? (
            <div className={styles.loading}>Loading…</div>
          ) : isSvg ? (
            <div className={styles.svgPreview} dangerouslySetInnerHTML={{ __html: content }} />
          ) : isMarkdown ? (
            <div
              className={styles.markdown}
              dangerouslySetInnerHTML={{ __html: `<p>${renderMarkdown(content)}</p>` }}
            />
          ) : (
            <pre className={styles.code}>
              {lines.slice(0, 1000).map((line, i) => (
                <div key={i} className={styles.codeLine}>
                  <span className={styles.lineNum}>{i + 1}</span>
                  <span className={styles.lineText}>{line}</span>
                </div>
              ))}
              {lines.length > 1000 && (
                <div className={styles.truncated}>… {lines.length - 1000} more lines</div>
              )}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}

export default FileModal

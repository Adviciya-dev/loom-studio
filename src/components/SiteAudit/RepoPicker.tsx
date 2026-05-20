import { FolderOpen, X } from 'lucide-react'
import { auditOpenFolder } from '@/lib/audit'
import styles from './IntakeForm.module.css'

interface Props {
  path: string | null
  error?: string
  onChange: (path: string | null) => void
  onError: (msg: string) => void
}

export function RepoPicker({ path, error, onChange, onError }: Props) {
  async function handleBrowse() {
    try {
      const picked = await auditOpenFolder()
      if (picked === null) return
      onChange(picked)
      onError('')
    } catch (err) {
      if (String(err).includes('INVALID_REPO_PATH')) {
        onError('Could not find a valid project at this path')
        onChange(null)
      }
    }
  }

  return (
    <div className={styles.repoPickerWrap}>
      <div className={styles.repoRow}>
        <input
          className={`${styles.input} ${styles.repoInput}`}
          readOnly
          value={path ?? ''}
          placeholder="No folder selected"
        />
        <button type="button" className={styles.browseBtn} onClick={handleBrowse}>
          <FolderOpen size={13} strokeWidth={2} />
          Browse
        </button>
        {path && (
          <button
            type="button"
            className={styles.removeBtn}
            onClick={() => {
              onChange(null)
              onError('')
            }}
            title="Clear"
          >
            <X size={13} strokeWidth={2.5} />
          </button>
        )}
      </div>
      {error && <span className={styles.errorMsg}>{error}</span>}
    </div>
  )
}

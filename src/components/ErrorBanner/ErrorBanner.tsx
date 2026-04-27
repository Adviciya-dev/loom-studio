import { useApp } from '@/context/AppContext'
import styles from './ErrorBanner.module.css'

const DEP_LABELS: Record<string, { name: string; url: string }> = {
  git: { name: 'Git', url: 'https://git-scm.com/downloads' },
  claude: { name: 'Claude Code CLI', url: 'https://docs.anthropic.com/claude-code' },
}

function parseMissingDep(message: string): { dep: string; label: string; url: string } | null {
  // Format: "missing_dep:<dep>:<human message>"
  if (!message.startsWith('missing_dep:')) return null
  const parts = message.split(':')
  const dep = parts[1] ?? ''
  const info = DEP_LABELS[dep]
  return info ? { dep, label: info.name, url: info.url } : null
}

function ErrorBanner() {
  const { state, dispatch } = useApp()
  const { engineError } = state

  if (!engineError) return null

  const dep = parseMissingDep(engineError)
  if (!dep) return null

  return (
    <div className={styles.banner} role="alert">
      <span className={styles.icon}>⚠</span>
      <span className={styles.message}>
        <strong>{dep.label}</strong> is not installed. Loom requires it to run tasks.
      </span>
      <a className={styles.installBtn} href={dep.url} target="_blank" rel="noreferrer">
        Install {dep.label}
      </a>
      <button
        className={styles.dismissBtn}
        onClick={() => dispatch({ type: 'CLEAR_ENGINE_ERROR' })}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}

export default ErrorBanner

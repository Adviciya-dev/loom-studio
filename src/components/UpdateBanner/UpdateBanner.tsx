import { useEffect, useState } from 'react'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import styles from './UpdateBanner.module.css'

type Phase = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error'

export default function UpdateBanner() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [update, setUpdate] = useState<Update | null>(null)
  const [progress, setProgress] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Check on startup after a short delay so the app renders first
    const t = setTimeout(() => runCheck(), 3000)
    return () => clearTimeout(t)
  }, [])

  async function runCheck() {
    setPhase('checking')
    try {
      const u = await check()
      if (u) {
        setUpdate(u)
        setPhase('available')
      } else {
        setPhase('idle')
      }
    } catch {
      setPhase('idle')
    }
  }

  async function handleDownload() {
    if (!update) return
    setPhase('downloading')
    setProgress(0)
    try {
      let downloaded = 0
      let total = 0
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? 0
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength
          setProgress(total > 0 ? Math.round((downloaded / total) * 100) : 0)
        } else if (event.event === 'Finished') {
          setProgress(100)
        }
      })
      setPhase('ready')
    } catch {
      setPhase('error')
    }
  }

  async function handleRestart() {
    await relaunch()
  }

  if (dismissed || phase === 'idle' || phase === 'checking') return null

  return (
    <div className={styles.banner}>
      {phase === 'available' && (
        <>
          <span className={styles.icon}>↑</span>
          <span className={styles.msg}>
            Update available — <strong>v{update?.version}</strong>
          </span>
          <button className={styles.btn} onClick={handleDownload}>
            Download & Install
          </button>
          <button className={styles.dismiss} onClick={() => setDismissed(true)} title="Dismiss">
            ×
          </button>
        </>
      )}

      {phase === 'downloading' && (
        <>
          <span className={styles.icon}>↓</span>
          <span className={styles.msg}>Downloading update…</span>
          <div className={styles.progressWrap}>
            <div className={styles.progressBar} style={{ width: `${progress}%` }} />
          </div>
          <span className={styles.pct}>{progress}%</span>
        </>
      )}

      {phase === 'ready' && (
        <>
          <span className={styles.icon}>✓</span>
          <span className={styles.msg}>Update ready — restart to apply</span>
          <button className={styles.btn} onClick={handleRestart}>
            Restart Now
          </button>
          <button className={styles.dismiss} onClick={() => setDismissed(true)} title="Later">
            Later
          </button>
        </>
      )}

      {phase === 'error' && (
        <>
          <span className={styles.icon}>!</span>
          <span className={styles.msg}>Update failed</span>
          <button className={styles.btn} onClick={runCheck}>
            Retry
          </button>
          <button className={styles.dismiss} onClick={() => setDismissed(true)} title="Dismiss">
            ×
          </button>
        </>
      )}
    </div>
  )
}

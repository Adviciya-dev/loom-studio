import { getCurrentWindow } from '@tauri-apps/api/window'
import { usePlatform } from '@/hooks/usePlatform'
import styles from './WindowControls.module.css'

const win = getCurrentWindow()

function WindowControls() {
  const platform = usePlatform()

  if (platform === 'windows' || platform === 'linux') {
    return (
      <div className={styles.winControls}>
        <button className={styles.winBtn} onClick={() => win.minimize()} title="Minimize">
          ─
        </button>
        <button className={styles.winBtn} onClick={() => win.toggleMaximize()} title="Maximize">
          □
        </button>
        <button
          className={`${styles.winBtn} ${styles.winClose}`}
          onClick={() => win.close()}
          title="Close"
        >
          ✕
        </button>
      </div>
    )
  }

  // macOS — traffic light circles
  return (
    <div className={styles.controls}>
      <button
        className={`${styles.btn} ${styles.close}`}
        onClick={() => win.close()}
        title="Close"
        aria-label="Close"
      />
      <button
        className={`${styles.btn} ${styles.minimize}`}
        onClick={() => win.minimize()}
        title="Minimize"
        aria-label="Minimize"
      />
      <button
        className={`${styles.btn} ${styles.maximize}`}
        onClick={() => win.toggleMaximize()}
        title="Maximize"
        aria-label="Maximize"
      />
    </div>
  )
}

export default WindowControls

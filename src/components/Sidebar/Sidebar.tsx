import { Play, FolderOpen, GitBranch, FlaskConical, Settings } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import styles from './Sidebar.module.css'

function Sidebar() {
  const { state, dispatch } = useApp()
  const { appMode } = state

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>L</div>
      <nav className={styles.nav}>
        <button
          className={`${styles.navItem} ${appMode === 'run' ? styles.active : ''}`}
          title="Run"
          onClick={() => dispatch({ type: 'SET_APP_MODE', mode: 'run' })}
        >
          <Play size={18} strokeWidth={1.75} />
        </button>
        <button
          className={`${styles.navItem} ${appMode === 'harness' ? styles.active : ''}`}
          title="Harness Manager"
          onClick={() => dispatch({ type: 'SET_APP_MODE', mode: 'harness' })}
        >
          <FolderOpen size={18} strokeWidth={1.75} />
        </button>
        <button
          className={`${styles.navItem} ${appMode === 'qa' ? styles.active : ''}`}
          title="QA & Testing"
          onClick={() => dispatch({ type: 'SET_APP_MODE', mode: 'qa' })}
        >
          <FlaskConical size={18} strokeWidth={1.75} />
        </button>
        <button
          className={`${styles.navItem} ${appMode === 'github' ? styles.active : ''}`}
          title="GitHub PR"
          onClick={() => dispatch({ type: 'SET_APP_MODE', mode: 'github' })}
        >
          <GitBranch size={18} strokeWidth={1.75} />
        </button>
      </nav>
      <div className={styles.bottom}>
        <button className={styles.navItem} title="Settings">
          <Settings size={18} strokeWidth={1.75} />
        </button>
      </div>
    </aside>
  )
}

export default Sidebar

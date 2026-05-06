import { useApp } from '@/context/AppContext'
import ProjectSelector from './ProjectSelector'
import GitControls from './GitControls'
import RunControls from './RunControls'
import TaskTabs from './TaskTabs'
import styles from './TopBar.module.css'

function TopBar() {
  const { state } = useApp()
  const isHarness =
    state.appMode === 'harness' || state.appMode === 'qa' || state.appMode === 'github'

  return (
    <header className={styles.topBar}>
      <div className={styles.left}>
        <ProjectSelector />
        {!isHarness && (
          <>
            <div className={styles.divider} />
            <TaskTabs />
          </>
        )}
      </div>
      <div className={styles.right}>
        <GitControls />
        {!isHarness && <RunControls />}
      </div>
    </header>
  )
}

export default TopBar

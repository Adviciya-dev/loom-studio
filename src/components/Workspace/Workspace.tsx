import { useApp } from '@/context/AppContext'
import TaskDetailPanel from './TaskDetailPanel'
import LogPanel from './LogPanel'
import styles from './Workspace.module.css'

function Workspace() {
  const { state } = useApp()
  const activeTask = state.activeTasks[state.activeTaskIndex] ?? null

  return (
    <div className={styles.workspace}>
      {activeTask ? (
        <TaskDetailPanel task={activeTask} />
      ) : (
        <div className={styles.taskDetailPanel}>
          <div className={styles.emptyState}>
            {!state.activeProject ? (
              <>
                <p className={styles.emptyTitle}>No project open</p>
                <p className={styles.emptyHint}>
                  Click the project selector in the top bar to open a project
                </p>
              </>
            ) : (
              <>
                <p className={styles.emptyTitle}>No task selected</p>
                <p className={styles.emptyHint}>
                  Click "+ Task" to select a task from your project
                </p>
              </>
            )}
          </div>
        </div>
      )}
      <div className={styles.divider} />
      <LogPanel />
    </div>
  )
}

export default Workspace

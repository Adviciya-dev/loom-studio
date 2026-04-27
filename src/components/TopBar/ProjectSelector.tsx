import { useState, useRef, useEffect } from 'react'
import { useApp } from '@/context/AppContext'
import { openFolderPicker, engineCommand, readHarnessTasks } from '@/lib/ipc'
import type { Project } from '@/types'
import ProjectDropdown from '@/components/ProjectDropdown/ProjectDropdown'
import styles from './ProjectSelector.module.css'

const PROJECT_COLORS = [
  '#7c6cfc',
  '#34c759',
  '#0a84ff',
  '#ff9f0a',
  '#ff453a',
  '#5ac8fa',
  '#ff6b81',
  '#30d158',
]

function projectNameFromPath(path: string): string {
  return path.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? 'Project'
}

export default function ProjectSelector() {
  const { state, dispatch } = useApp()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  async function handleAddProject() {
    setOpen(false)
    const path = await openFolderPicker()
    if (!path) return

    const project: Project = {
      id: `proj_${Date.now().toString(36)}`,
      name: projectNameFromPath(path),
      path,
      color: PROJECT_COLORS[state.projects.length % PROJECT_COLORS.length],
      addedAt: new Date().toISOString(),
    }
    await engineCommand({ action: 'save_project', project })
    await engineCommand({ action: 'set_active_project', id: project.id })
    dispatch({ type: 'SET_ACTIVE_PROJECT', project })

    const tasks = await readHarnessTasks(path)
    dispatch({ type: 'SET_HARNESS_EMPTY', empty: tasks.length === 0 })
  }

  async function handleSelectProject(project: Project) {
    setOpen(false)
    await engineCommand({ action: 'set_active_project', id: project.id })
    dispatch({ type: 'SET_ACTIVE_PROJECT', project })

    const tasks = await readHarnessTasks(project.path)
    dispatch({ type: 'SET_HARNESS_EMPTY', empty: tasks.length === 0 })
  }

  const { activeProject, harnessEmpty } = state

  return (
    <div ref={ref} className={styles.wrapper}>
      <button className={styles.selector} onClick={() => setOpen((o) => !o)}>
        <span
          className={styles.dot}
          style={{ backgroundColor: activeProject?.color ?? 'var(--text-muted)' }}
        />
        <span className={styles.name}>{activeProject?.name ?? 'Select Project'}</span>
        <span className={styles.chevron}>▾</span>
      </button>

      {activeProject && harnessEmpty && (
        <span className={styles.warning} title="No harness/ folder or tasks found">
          ⚠
        </span>
      )}

      {open && (
        <ProjectDropdown
          projects={state.projects}
          activeProjectId={activeProject?.id ?? null}
          onSelect={handleSelectProject}
          onAdd={handleAddProject}
        />
      )}
    </div>
  )
}

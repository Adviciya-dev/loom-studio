import type { Project } from '@/types'
import styles from './ProjectDropdown.module.css'

interface Props {
  projects: Project[]
  activeProjectId: string | null
  onSelect: (project: Project) => void
  onAdd: () => void
}

export default function ProjectDropdown({ projects, activeProjectId, onSelect, onAdd }: Props) {
  return (
    <div className={styles.dropdown}>
      {projects.length === 0 ? (
        <p className={styles.empty}>No projects yet</p>
      ) : (
        <ul className={styles.list}>
          {projects.map((p) => (
            <li key={p.id}>
              <button
                className={`${styles.item} ${p.id === activeProjectId ? styles.active : ''}`}
                onClick={() => onSelect(p)}
              >
                <span className={styles.dot} style={{ backgroundColor: p.color }} />
                <span className={styles.name}>{p.name}</span>
                {p.id === activeProjectId && <span className={styles.check}>✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.footer}>
        <button className={styles.addBtn} onClick={onAdd}>
          + Add Project
        </button>
      </div>
    </div>
  )
}

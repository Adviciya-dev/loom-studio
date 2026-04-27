import type { DiffFile } from '@/types'
import styles from './FileList.module.css'

interface Props {
  files: DiffFile[]
  selectedIndex: number
  onSelect: (index: number) => void
}

function FileList({ files, selectedIndex, onSelect }: Props) {
  return (
    <div className={styles.list}>
      <div className={styles.header}>
        <span className={styles.headerLabel}>Changed Files</span>
        <span className={styles.count}>{files.length}</span>
      </div>
      <ul className={styles.items}>
        {files.map((file, i) => (
          <li
            key={file.name}
            className={`${styles.item} ${i === selectedIndex ? styles.selected : ''}`}
            onClick={() => onSelect(i)}
          >
            <span className={styles.filename} title={file.name}>
              {basename(file.name)}
            </span>
            <span className={styles.badges}>
              {file.added > 0 && <span className={styles.added}>+{file.added}</span>}
              {file.removed > 0 && <span className={styles.removed}>-{file.removed}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function basename(path: string): string {
  return path.split('/').pop() ?? path
}

export default FileList

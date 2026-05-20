import { useEffect, useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import FileModal from './FileModal'
import styles from './FileExplorer.module.css'

interface FileNode {
  name: string
  path: string
  is_dir: boolean
  extension?: string
  children?: FileNode[]
}

const HARNESS_KEY_FILES = ['prd.md', 'architecture.md', 'feature.md', 'claude.md']

function fileIcon(node: FileNode): string {
  if (node.is_dir) return ''
  const ext = node.extension?.toLowerCase()
  if (ext === 'md' || ext === 'mdx') return '📄'
  if (ext === 'ts' || ext === 'tsx') return '⚡'
  if (ext === 'js' || ext === 'jsx') return '⚡'
  if (ext === 'go') return '🔷'
  if (ext === 'rs') return '🦀'
  if (ext === 'json' || ext === 'jsonc') return '{}'
  if (ext === 'css') return '🎨'
  if (ext === 'svg') return '🖼️'
  if (ext === 'toml' || ext === 'yaml' || ext === 'yml') return '⚙'
  if (ext === 'sh' || ext === 'bash') return '$'
  return '·'
}

function getMissingCount(node: FileNode): number {
  const harnessNode = node.children?.find((n) => n.name === 'harness' && n.is_dir)
  if (!harnessNode) return HARNESS_KEY_FILES.length
  const existing = new Set(harnessNode.children?.map((n) => n.name) ?? [])
  return HARNESS_KEY_FILES.filter((f) => !existing.has(f)).length
}

interface TreeNodeProps {
  node: FileNode
  depth: number
  expanded: Set<string>
  onToggle: (path: string) => void
  onFileClick: (path: string) => void
  rootMissing: number
}

function TreeNode({ node, depth, expanded, onToggle, onFileClick, rootMissing }: TreeNodeProps) {
  const isExpanded = expanded.has(node.path)
  const indent = depth * 12

  if (node.is_dir) {
    const missingBadge = node.name === 'harness' && rootMissing > 0
    return (
      <div>
        <button
          className={styles.row}
          style={{ paddingLeft: 8 + indent }}
          onClick={() => onToggle(node.path)}
        >
          <span className={styles.chevron}>{isExpanded ? '▾' : '▸'}</span>
          <span className={styles.folderIcon}>📁</span>
          <span className={styles.name}>{node.name}</span>
          {missingBadge && (
            <span className={styles.badge} title={`${rootMissing} key harness files missing`}>
              {rootMissing}
            </span>
          )}
        </button>
        {isExpanded &&
          node.children?.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onFileClick={onFileClick}
              rootMissing={0}
            />
          ))}
      </div>
    )
  }

  return (
    <button
      className={styles.row}
      style={{ paddingLeft: 8 + indent + 16 }}
      onClick={() => onFileClick(node.path)}
    >
      <span className={styles.fileIcon}>{fileIcon(node)}</span>
      <span className={styles.name}>{node.name}</span>
    </button>
  )
}

interface Props {
  projectPath: string
  reloadKey?: number
  onAttachFile?: (path: string) => void
}

function FileExplorer({ projectPath, reloadKey, onAttachFile }: Props) {
  const [tree, setTree] = useState<FileNode | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [modalPath, setModalPath] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    invoke<FileNode>('read_directory', { path: projectPath })
      .then((node) => {
        setTree(node)
        // Auto-expand root and harness/ folder
        setExpanded(
          new Set([
            node.path,
            ...(node.children?.filter((c) => c.name === 'harness').map((c) => c.path) ?? []),
          ])
        )
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [projectPath])

  useEffect(() => {
    load()
  }, [load, reloadKey])

  const toggleExpanded = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const missingCount = tree ? getMissingCount(tree) : 0

  return (
    <div className={styles.explorer}>
      <div className={styles.header}>
        <span className={styles.title}>Explorer</span>
        <button className={styles.refreshBtn} onClick={load} title="Refresh">
          ↻
        </button>
      </div>

      <div className={styles.tree}>
        {loading && <div className={styles.status}>Loading…</div>}
        {error && <div className={`${styles.status} ${styles.error}`}>{error}</div>}
        {tree && (
          <TreeNode
            node={tree}
            depth={0}
            expanded={expanded}
            onToggle={toggleExpanded}
            onFileClick={setModalPath}
            rootMissing={missingCount}
          />
        )}
      </div>

      {modalPath && (
        <FileModal
          path={modalPath}
          onClose={() => setModalPath(null)}
          onAttach={
            onAttachFile
              ? (p) => {
                  onAttachFile(p)
                  setModalPath(null)
                }
              : undefined
          }
        />
      )}
    </div>
  )
}

export default FileExplorer

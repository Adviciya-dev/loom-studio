import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '@/context/AppContext'
import FileExplorer from './FileExplorer'
import ChatPanel from './ChatPanel'
import styles from './HarnessManager.module.css'

function HarnessManager() {
  const { state } = useApp()
  const { activeProject } = state

  const containerRef = useRef<HTMLDivElement>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const triggerReload = useCallback(() => setReloadKey((k) => k + 1), [])
  const [pendingAttach, setPendingAttach] = useState<string | null>(null)

  // Reload file tree when branch changes, commit happens, or pull brings new files.
  useEffect(() => {
    triggerReload()
  }, [state.gitBranch, state.gitAhead, triggerReload])

  const [splitPct, setSplitPct] = useState(() => {
    const saved = localStorage.getItem('harness-split')
    return saved ? parseFloat(saved) : 28
  })

  function onDividerMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    const container = containerRef.current
    if (!container) return

    function onMove(me: MouseEvent) {
      const rect = container!.getBoundingClientRect()
      const pct = ((me.clientX - rect.left) / rect.width) * 100
      const clamped = Math.max(18, Math.min(48, pct))
      setSplitPct(clamped)
      localStorage.setItem('harness-split', String(clamped))
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  if (!activeProject) {
    return (
      <div className={styles.empty}>
        <p>Select a project to open the Harness Manager.</p>
      </div>
    )
  }

  return (
    <div className={styles.container} ref={containerRef}>
      <div className={styles.left} style={{ width: `${splitPct}%` }}>
        <FileExplorer
          projectPath={activeProject.path}
          reloadKey={reloadKey}
          onAttachFile={setPendingAttach}
        />
      </div>

      <div className={styles.divider} onMouseDown={onDividerMouseDown} />

      <div className={styles.right} style={{ width: `${100 - splitPct}%` }}>
        <ChatPanel
          projectPath={activeProject.path}
          projectName={activeProject.name}
          onFileChange={triggerReload}
          pendingAttach={pendingAttach}
          onAttachConsumed={() => setPendingAttach(null)}
        />
      </div>
    </div>
  )
}

export default HarnessManager

import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '@/context/AppContext'
import { registerDropZone, updateHover, tryDrop } from '@/lib/fileDrag'
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

  // Reload file tree when branch changes or after commits/pulls
  useEffect(() => {
    triggerReload()
  }, [state.gitBranch, state.gitAhead, triggerReload])

  // ── Panel split ──────────────────────────────────────────
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

  // ── Custom file drag ─────────────────────────────────────
  // We bypass HTML5 drag-and-drop (unreliable in Tauri WKWebView) and implement
  // drag detection with plain mouse events. Drop zones are registered in the
  // global fileDrag registry so components outside this tree (e.g. Terminal)
  // can also receive drops.

  const draggingFileRef = useRef<string | null>(null)
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null)
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null)
  const [ghostName, setGhostName] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const dropZoneRef = useRef<HTMLDivElement>(null)

  // Register ChatPanel's input card as a drop zone
  useEffect(() => {
    return registerDropZone('chat-input', {
      getRect: () => dropZoneRef.current?.getBoundingClientRect() ?? null,
      onDrop: (path) => setPendingAttach(path),
      onHover: (isOver) => setIsDragOver(isOver),
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function onFileDragStart(path: string, e: React.MouseEvent) {
    // Only left button
    if (e.button !== 0) return
    draggingFileRef.current = path
    dragStartPosRef.current = { x: e.clientX, y: e.clientY }
    setGhostName(path.split('/').pop() ?? path)
  }

  useEffect(() => {
    let dragging = false

    function onMouseMove(e: MouseEvent) {
      if (!draggingFileRef.current || !dragStartPosRef.current) return

      const dx = e.clientX - dragStartPosRef.current.x
      const dy = e.clientY - dragStartPosRef.current.y

      // Start showing ghost after 6px movement
      if (!dragging && Math.sqrt(dx * dx + dy * dy) < 6) return
      dragging = true

      setGhostPos({ x: e.clientX, y: e.clientY })

      // Update hover highlights across all registered drop zones
      updateHover(e.clientX, e.clientY)
    }

    function onMouseUp(e: MouseEvent) {
      const path = draggingFileRef.current
      const wasDragging = dragging

      // Reset drag state
      draggingFileRef.current = null
      dragStartPosRef.current = null
      dragging = false
      setGhostPos(null)

      if (!path || !wasDragging) return

      // Dispatch to whichever registered zone is under the cursor
      tryDrop(path, e.clientX, e.clientY)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
          onFileDragStart={onFileDragStart}
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
          dropZoneRef={dropZoneRef}
          isDragOver={isDragOver}
        />
      </div>

      {/* Floating drag ghost — follows cursor while dragging */}
      {ghostPos && (
        <div className={styles.dragGhost} style={{ left: ghostPos.x + 14, top: ghostPos.y + 4 }}>
          <span className={styles.dragGhostIcon}>📄</span>
          <span className={styles.dragGhostName}>{ghostName}</span>
        </div>
      )}
    </div>
  )
}

export default HarnessManager

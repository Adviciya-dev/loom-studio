import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '@/context/AppContext'
import { registerDropZone, updateHover, tryDrop } from '@/lib/fileDrag'
import FileExplorer from './FileExplorer'
import ChatPanel from './ChatPanel'
import FileEditor from './FileEditor'
import FloatingChat from './FloatingChat'
import styles from './HarnessManager.module.css'

// ── Tab types ────────────────────────────────────────────────────────
type ChatTab = { id: 'chat'; type: 'chat' }
type FileTab = { id: string; type: 'file'; path: string; dirty: boolean }
type Tab = ChatTab | FileTab

function tabLabel(tab: Tab): string {
  if (tab.type === 'chat') return 'Claude Chat'
  return (tab as FileTab).path.split('/').pop() ?? (tab as FileTab).path
}

function tabIcon(tab: Tab): string {
  if (tab.type === 'chat') return '⎇'
  const ext = (tab as FileTab).path.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'md' || ext === 'mdx') return '📄'
  if (ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx') return '⚡'
  if (ext === 'css' || ext === 'scss') return '🎨'
  if (ext === 'rs') return '🦀'
  if (ext === 'json' || ext === 'jsonc') return '{}'
  return '📄'
}

function HarnessManager() {
  const { state } = useApp()
  const { activeProject, harnessExplorerOpen } = state

  const containerRef = useRef<HTMLDivElement>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const triggerReload = useCallback(() => setReloadKey((k) => k + 1), [])
  const [pendingAttach, setPendingAttach] = useState<string | null>(null)

  // Reload file tree when branch changes or after commits/pulls
  useEffect(() => {
    triggerReload()
  }, [state.gitBranch, state.gitAhead, triggerReload])

  // ── Tab state ─────────────────────────────────────────────────────────
  const [tabs, setTabs] = useState<Tab[]>([{ id: 'chat', type: 'chat' }])
  const [activeTabId, setActiveTabId] = useState<string>('chat')

  function openFile(path: string) {
    setTabs((prev) => {
      const existing = prev.find((t) => t.type === 'file' && (t as FileTab).path === path)
      if (existing) {
        setActiveTabId(existing.id)
        return prev
      }
      const newTab: FileTab = { id: `file-${Date.now()}`, type: 'file', path, dirty: false }
      setActiveTabId(newTab.id)
      return [...prev, newTab]
    })
  }

  function closeTab(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id)
      const next = prev.filter((t) => t.id !== id)
      if (activeTabId === id) {
        const newActive = next[Math.min(idx, next.length - 1)]
        setActiveTabId(newActive?.id ?? 'chat')
      }
      return next
    })
  }

  function setTabDirty(id: string, dirty: boolean) {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, dirty } : t)))
  }

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

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0]

  return (
    <div className={styles.container} ref={containerRef}>
      {/* ── Left: file explorer (collapsible via sidebar folder button) ── */}
      {harnessExplorerOpen && (
        <>
          <div className={styles.left} style={{ width: `${splitPct}%` }}>
            <FileExplorer
              projectPath={activeProject.path}
              reloadKey={reloadKey}
              onAttachFile={setPendingAttach}
              onFileDragStart={onFileDragStart}
              onOpenFile={openFile}
            />
          </div>
          <div className={styles.divider} onMouseDown={onDividerMouseDown} />
        </>
      )}

      {/* ── Right: tab bar + content ── */}
      <div
        className={styles.right}
        style={{ width: harnessExplorerOpen ? `${100 - splitPct}%` : '100%' }}
      >
        {/* Tab bar */}
        <div className={styles.tabBar}>
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`${styles.tab} ${tab.id === activeTabId ? styles.tabActive : ''}`}
              onClick={() => setActiveTabId(tab.id)}
              title={tab.type === 'file' ? (tab as FileTab).path : 'Claude Chat'}
              role="tab"
            >
              <span className={styles.tabLabel}>
                {tabIcon(tab)}&nbsp;{tabLabel(tab)}
              </span>
              {tab.type === 'file' && (tab as FileTab).dirty && (
                <span className={styles.tabDirty} title="Unsaved changes">
                  ●
                </span>
              )}
              {tab.type === 'file' && (
                <button
                  className={styles.tabClose}
                  onClick={(e) => closeTab(tab.id, e)}
                  title="Close"
                  aria-label="Close tab"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Tab content */}
        <div className={styles.tabContent}>
          {/* Chat tab — keep mounted, hide when inactive */}
          <div style={{ display: activeTab?.type === 'chat' ? 'contents' : 'none' }}>
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

          {/* File editor tabs — each mounts on first activation, stays alive */}
          {tabs
            .filter((t): t is FileTab => t.type === 'file')
            .map((tab) => (
              <div key={tab.id} style={{ display: activeTabId === tab.id ? 'contents' : 'none' }}>
                <FileEditor
                  path={tab.path}
                  onDirtyChange={(dirty) => setTabDirty(tab.id, dirty)}
                  onSaved={triggerReload}
                />
              </div>
            ))}
        </div>

        {/* Floating chat — shown only when a file tab is active */}
        {activeTab?.type === 'file' && (
          <FloatingChat
            key={(activeTab as FileTab).path}
            projectPath={activeProject.path}
            projectName={activeProject.name}
            currentFilePath={(activeTab as FileTab).path}
            onFileChange={triggerReload}
          />
        )}
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

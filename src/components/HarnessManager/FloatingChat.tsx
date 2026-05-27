import { useState, useRef, useCallback } from 'react'
import { MessageSquare, X, Minus } from 'lucide-react'
import ChatPanel from './ChatPanel'
import styles from './FloatingChat.module.css'

interface Props {
  projectPath: string
  projectName: string
  currentFilePath: string
  onFileChange?: () => void
}

function FloatingChat({ projectPath, projectName, currentFilePath, onFileChange }: Props) {
  const [open, setOpen] = useState(false)
  const [pendingAttach, setPendingAttach] = useState<string | null>(null)
  const [size, setSize] = useState({ w: 420, h: 600 })
  const resizeRef = useRef<{
    startX: number
    startY: number
    startW: number
    startH: number
  } | null>(null)

  const fileName = currentFilePath.split('/').pop() ?? currentFilePath

  function handleOpen() {
    // Auto-attach current file on first open so Claude has context
    setPendingAttach(currentFilePath)
    setOpen(true)
  }

  const onResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      resizeRef.current = { startX: e.clientX, startY: e.clientY, startW: size.w, startH: size.h }
      function onMove(ev: MouseEvent) {
        if (!resizeRef.current) return
        const dw = resizeRef.current.startX - ev.clientX
        const dh = resizeRef.current.startY - ev.clientY
        setSize({
          w: Math.max(280, Math.min(640, resizeRef.current.startW + dw)),
          h: Math.max(300, Math.min(800, resizeRef.current.startH + dh)),
        })
      }
      function onUp() {
        resizeRef.current = null
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [size]
  )

  if (!open) {
    return (
      <button className={styles.fab} onClick={handleOpen} title="Open Claude Chat for this file">
        <MessageSquare size={18} strokeWidth={1.75} />
      </button>
    )
  }

  return (
    <div className={styles.window} style={{ width: size.w, height: size.h }}>
      {/* Resize handle — top-left corner, dragging grows the window */}
      <div className={styles.resizeHandle} onMouseDown={onResizeMouseDown} title="Drag to resize" />

      {/* Window header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.headerAvatar}>C</span>
          <span className={styles.headerTitle}>Claude</span>
          <span className={styles.headerSep}>·</span>
          <span className={styles.headerFile} title={currentFilePath}>
            {fileName}
          </span>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.headerBtn} onClick={() => setOpen(false)} title="Minimise">
            <Minus size={12} strokeWidth={2} />
          </button>
          <button className={styles.headerBtn} onClick={() => setOpen(false)} title="Close">
            <X size={12} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Chat body — compact mode hides ChatPanel's own header */}
      <div className={styles.body}>
        <ChatPanel
          projectPath={projectPath}
          projectName={projectName}
          onFileChange={onFileChange}
          pendingAttach={pendingAttach}
          onAttachConsumed={() => setPendingAttach(null)}
          compact
        />
      </div>
    </div>
  )
}

export default FloatingChat

import '@xterm/xterm/css/xterm.css'
import { invoke } from '@tauri-apps/api/core'
import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { onTerminalOutput, onTerminalExit } from '../../lib/events'
import { registerDropZone } from '../../lib/fileDrag'
import styles from './Terminal.module.css'

interface TerminalProps {
  id: string
  cwd?: string
  height: number
}

export default function Terminal({ id, cwd, height }: TerminalProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const isFirstMount = useRef(true)
  const [exited, setExited] = useState(false)
  const [isDragTarget, setIsDragTarget] = useState(false)

  // Register this terminal as a drop zone so files can be dragged from the explorer
  useEffect(() => {
    return registerDropZone(`terminal-${id}`, {
      getRect: () => wrapperRef.current?.getBoundingClientRect() ?? null,
      onDrop: (filePath) => {
        // Write the path directly into the PTY so it appears at the cursor
        invoke('write_to_terminal', { id, data: filePath }).catch(() => {})
      },
      onHover: setIsDragTarget,
    })
  }, [id])

  const startSession = async (term: XTerm, fitAddon: FitAddon) => {
    fitAddon.fit()
    const { cols, rows } = term
    try {
      await invoke('create_terminal', { id, cwd, cols, rows })
    } catch (err) {
      term.writeln(`\r\n\x1b[31m[Failed to start terminal: ${err}]\x1b[0m`)
    }
  }

  const handleRestart = async () => {
    const term = xtermRef.current
    const fitAddon = fitAddonRef.current
    if (!term || !fitAddon) return
    setExited(false)
    term.reset()
    await startSession(term, fitAddon)
  }

  useEffect(() => {
    if (!containerRef.current) return

    const term = new XTerm({
      theme: {
        background: '#111111',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        selectionBackground: 'rgba(255,255,255,0.2)',
      },
      fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)
    term.open(containerRef.current)
    xtermRef.current = term
    fitAddonRef.current = fitAddon

    // Forward keyboard input to PTY
    term.onData((data) => {
      invoke('write_to_terminal', { id, data }).catch(() => {})
    })

    // Subscribe to PTY output events
    const unsubOutput = onTerminalOutput((evtId, data) => {
      if (evtId !== id) return
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
      term.write(bytes)
    })

    const unsubExit = onTerminalExit((evtId) => {
      if (evtId !== id) return
      setExited(true)
    })

    // Resize observer
    const ro = new ResizeObserver(() => {
      try {
        fitAddon.fit()
        const { cols, rows } = term
        invoke('resize_terminal', { id, cols, rows }).catch(() => {})
      } catch {
        // fit() can throw if the terminal isn't fully laid out yet — safe to ignore
      }
    })
    if (containerRef.current) ro.observe(containerRef.current)

    startSession(term, fitAddon)

    return () => {
      ro.disconnect()
      Promise.all([unsubOutput, unsubExit]).then((unsubs) => unsubs.forEach((fn) => fn()))
      invoke('kill_terminal', { id }).catch(() => {})
      term.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-cd on project switch
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false
      return
    }
    if (!cwd) return
    // Send cd command directly to the shell
    invoke('write_to_terminal', { id, data: `cd "${cwd}"\n` }).catch(() => {})
  }, [cwd]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={wrapperRef} className={styles.wrapper} style={{ height }}>
      <div ref={containerRef} className={styles.container} />
      {exited && (
        <div className={styles.exitOverlay}>
          <span className={styles.exitMsg}>Terminal process ended.</span>
          <button className={styles.restartBtn} onClick={handleRestart}>
            Restart
          </button>
        </div>
      )}
      {isDragTarget && (
        <div className={styles.dropOverlay}>
          <span className={styles.dropOverlayIcon}>⊕</span>
          <span className={styles.dropOverlayText}>Drop to paste path</span>
        </div>
      )}
    </div>
  )
}

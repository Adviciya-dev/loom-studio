import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useApp } from '@/context/AppContext'
import { onLogLine, onEngineStatus } from '@/lib/events'
import type { LogLine } from '@/types'
import styles from './LogPanel.module.css'

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const LINE_HEIGHT = 32
const OVERSCAN = 10
const VIRT_THRESHOLD = 2000
const HEADER_H = 33
const DEFAULT_H = 260
const MIN_H = 120
const MAX_H = 700

type LineKind = 'tool' | 'error' | 'warn' | 'success' | 'claude' | 'text'

interface ParsedLine {
  kind: LineKind
  toolName?: string
  toolArg?: string
  text: string
}

function parseLine(content: string, level: string): ParsedLine {
  if (level === 'CLAUDE') return { kind: 'claude', text: content }
  const toolMatch = content.match(/^\[tool:\s*([^\]]+)\]\s*(.*)$/)
  if (toolMatch) {
    return {
      kind: 'tool',
      toolName: toolMatch[1].trim(),
      toolArg: toolMatch[2].trim(),
      text: content,
    }
  }
  const lower = content.toLowerCase()
  if (lower.startsWith('error:') || lower.startsWith('✗') || lower.startsWith('err '))
    return { kind: 'error', text: content }
  if (lower.startsWith('warn:') || lower.startsWith('warning:'))
    return { kind: 'warn', text: content }
  if (lower.startsWith('✓') || lower.startsWith('done') || lower.startsWith('success'))
    return { kind: 'success', text: content }
  return { kind: 'text', text: content }
}

const INTERNAL_TOOLS = new Set(['todowrite', 'todoread', 'toolsearch', 'websearch', 'webfetch'])
const TOOL_ICON: Record<string, string> = {
  read: '↳',
  write_file: '↳',
  write: '↳',
  edit: '↳',
  multiedit: '↳',
  bash: '»',
  find: '⌕',
  grep: '⌕',
  glob: '⌕',
  list_directory: '⌕',
  ls: '⌕',
  todowrite: '·',
  todoread: '·',
  toolsearch: '·',
  websearch: '·',
  webfetch: '·',
  default: '·',
}
function toolIcon(name: string): string {
  return TOOL_ICON[name.toLowerCase()] ?? TOOL_ICON.default
}

function ToolLine({ toolName, toolArg }: { toolName: string; toolArg?: string }) {
  const displayArg = toolArg ? toolArg.replace(/^.*?([\w.-]+\/[\w.-]+)$/, '$1') || toolArg : ''
  return (
    <span className={styles.toolLine}>
      <span className={styles.toolIcon}>{toolIcon(toolName)}</span>
      <span className={styles.toolBadge}>{toolName}</span>
      {toolArg && (
        <span className={styles.toolArg} title={toolArg}>
          {displayArg}
        </span>
      )}
    </span>
  )
}

function ClaudeBubble({ content, timestamp }: { content: string; timestamp: string }) {
  return (
    <div className={styles.bubble}>
      <span className={styles.bubbleText}>{content}</span>
      <span className={styles.bubbleTs}>{timestamp}</span>
    </div>
  )
}

function LogLine({
  content,
  level,
  timestamp,
}: {
  content: string
  level: string
  timestamp: string
}) {
  const parsed = parseLine(content, level)
  if (parsed.kind === 'claude') return <ClaudeBubble content={content} timestamp={timestamp} />

  const isInternal =
    parsed.kind === 'tool' && INTERNAL_TOOLS.has((parsed.toolName ?? '').toLowerCase())
  const lineClass = [
    styles.line,
    parsed.kind === 'tool' ? styles.kindTool : '',
    parsed.kind === 'tool' && isInternal ? styles.dimmed : '',
    parsed.kind === 'error'
      ? styles.kindError
      : parsed.kind === 'warn'
        ? styles.kindWarn
        : parsed.kind === 'success'
          ? styles.kindSuccess
          : level === 'ERROR'
            ? styles.kindError
            : level === 'WARN'
              ? styles.kindWarn
              : level === 'SUCCESS'
                ? styles.kindSuccess
                : parsed.kind !== 'tool'
                  ? styles.kindText
                  : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={lineClass}>
      <span className={styles.ts}>{timestamp}</span>
      <span className={styles.text}>
        {parsed.kind === 'tool' ? (
          <ToolLine toolName={parsed.toolName!} toolArg={parsed.toolArg} />
        ) : (
          parsed.text
        )}
      </span>
    </div>
  )
}

function ThinkingIndicator() {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), 80)
    return () => clearInterval(id)
  }, [])
  return (
    <div className={styles.thinking}>
      <span className={styles.spinnerChar}>{SPINNER_FRAMES[frame]}</span>
      <span className={styles.thinkingText}>Claude is working</span>
      <span className={styles.thinkingDots}>
        <span>.</span>
        <span>.</span>
        <span>.</span>
      </span>
      <span className={styles.thinkingCursor} />
    </div>
  )
}

function LogPanel() {
  const { state } = useApp()
  const { engineStatus } = state

  // Local log state — NOT in global context so only LogPanel re-renders on each line.
  // Lines accumulate in a ref and flush to state via RAF so 100 events/frame = 1 render.
  const linesRef = useRef<LogLine[]>([])
  const rafRef = useRef<number | null>(null)
  const [logLines, setLogLines] = useState<LogLine[]>([])

  function flushLines() {
    setLogLines([...linesRef.current])
    rafRef.current = null
  }

  useEffect(() => {
    const unlistens: Array<() => void> = []

    onLogLine((line) => {
      linesRef.current.push(line)
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(flushLines)
      }
    }).then((fn) => unlistens.push(fn))

    onEngineStatus((status) => {
      if (status === 'running') {
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current)
          rafRef.current = null
        }
        linesRef.current = []
        setLogLines([])
        setAutoScroll(true)
        setOpen(true)
      }
    }).then((fn) => unlistens.push(fn))

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      unlistens.forEach((fn) => fn())
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [open, setOpen] = useState(true)
  const [panelHeight, setPanelHeight] = useState(DEFAULT_H)
  const [autoScroll, setAutoScroll] = useState(true)
  const [scrollTop, setScrollTop] = useState(0)
  const bodyRef = useRef<HTMLDivElement>(null)
  const isRunning = engineStatus === 'running'
  const virtualize = logLines.length > VIRT_THRESHOLD

  useEffect(() => {
    if (autoScroll && open && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight
    }
  }, [logLines, autoScroll, open])

  const handleScroll = useCallback(() => {
    const el = bodyRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 8
    setAutoScroll(atBottom)
    if (virtualize) setScrollTop(el.scrollTop)
  }, [virtualize])

  const conflictFiles = useMemo(() => {
    const hasPrettierConflict = logLines.some(
      (l) =>
        l.content.includes('prettier --write') &&
        (l.content.includes('FAILED') || l.content.includes('[FAILED]'))
    )
    if (!hasPrettierConflict) return []
    const files: string[] = []
    const seen = new Set<string>()
    for (const line of logLines) {
      const match = line.content.match(/\[error\]\s+(.+?):\s+SyntaxError:\s+Merge conflict marker/)
      if (match) {
        const f = match[1].trim()
        if (!seen.has(f)) {
          seen.add(f)
          files.push(f)
        }
      }
    }
    return files
  }, [logLines])

  // Resize drag
  function startResize(e: React.MouseEvent) {
    e.preventDefault()
    const startY = e.clientY
    const startH = panelHeight
    function onMove(ev: MouseEvent) {
      const delta = startY - ev.clientY
      setPanelHeight(Math.max(MIN_H, Math.min(MAX_H, startH + delta)))
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const renderLines = () => {
    if (!virtualize) {
      return logLines.map((line, i) => (
        <LogLine key={i} content={line.content} level={line.level} timestamp={line.timestamp} />
      ))
    }
    const containerHeight = bodyRef.current?.clientHeight ?? 600
    const firstVisible = Math.max(0, Math.floor(scrollTop / LINE_HEIGHT) - OVERSCAN)
    const lastVisible = Math.min(
      logLines.length - 1,
      Math.ceil((scrollTop + containerHeight) / LINE_HEIGHT) + OVERSCAN
    )
    const totalHeight = logLines.length * LINE_HEIGHT
    const offsetTop = firstVisible * LINE_HEIGHT
    const visibleLines = logLines
      .slice(firstVisible, lastVisible + 1)
      .map((line, i) => (
        <LogLine
          key={firstVisible + i}
          content={line.content}
          level={line.level}
          timestamp={line.timestamp}
        />
      ))
    return (
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ position: 'absolute', top: offsetTop, width: '100%' }}>{visibleLines}</div>
      </div>
    )
  }

  const totalH = open ? panelHeight : HEADER_H

  return (
    <div className={styles.panel} style={{ height: totalH }}>
      {open && <div className={styles.resizeHandle} onMouseDown={startResize} />}

      <div className={styles.header}>
        <button className={styles.tabBtn} onClick={() => setOpen((o) => !o)}>
          <span className={styles.tabLabel}>OUTPUT</span>
          {isRunning && <span className={styles.liveDot} aria-label="running" />}
          {logLines.length > 0 && (
            <span className={styles.lineCount}>{logLines.length.toLocaleString()}</span>
          )}
        </button>

        <div className={styles.headerActions}>
          {conflictFiles.length > 0 && (
            <button
              className={styles.conflictBtn}
              onClick={() =>
                invoke('open_in_editor', { path: state.activeProject?.path ?? '' }).catch(() => {})
              }
              title={`${conflictFiles.length} file(s) have merge conflicts`}
            >
              ⚠ {conflictFiles.length} conflict{conflictFiles.length > 1 ? 's' : ''}
            </button>
          )}
          {!autoScroll && open && logLines.length > 0 && (
            <button
              className={styles.scrollBtn}
              onClick={() => {
                setAutoScroll(true)
                bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' })
              }}
            >
              ↓ latest
            </button>
          )}
          {logLines.length > 0 && (
            <button
              className={styles.clearBtn}
              onClick={() => {
                linesRef.current = []
                setLogLines([])
              }}
              title="Clear output"
            >
              Clear
            </button>
          )}
          <button
            className={styles.toggleBtn}
            onClick={() => setOpen((o) => !o)}
            title={open ? 'Collapse panel' : 'Expand panel'}
          >
            {open ? '▾' : '▴'}
          </button>
        </div>
      </div>

      {open && (
        <div className={styles.body} ref={bodyRef} onScroll={handleScroll}>
          {logLines.length === 0 && isRunning ? (
            <ThinkingIndicator />
          ) : logLines.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyPrompt}>$</span>
              <span>waiting for output…</span>
            </div>
          ) : (
            <>
              {renderLines()}
              {isRunning && <ThinkingIndicator />}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default LogPanel

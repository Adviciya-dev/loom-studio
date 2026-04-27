import { useEffect, useRef, useState, useCallback } from 'react'
import { useApp } from '@/context/AppContext'
import styles from './LogPanel.module.css'

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const LINE_HEIGHT = 32
const OVERSCAN = 10
const VIRT_THRESHOLD = 2000

// Detect line type for richer rendering
type LineKind = 'tool' | 'error' | 'warn' | 'success' | 'claude' | 'text'

interface ParsedLine {
  kind: LineKind
  toolName?: string
  toolArg?: string
  text: string
}

function parseLine(content: string, level: string): ParsedLine {
  if (level === 'CLAUDE') {
    return { kind: 'claude', text: content }
  }
  // [tool: name] arg
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
  if (lower.startsWith('error:') || lower.startsWith('✗') || lower.startsWith('err ')) {
    return { kind: 'error', text: content }
  }
  if (lower.startsWith('warn:') || lower.startsWith('warning:')) {
    return { kind: 'warn', text: content }
  }
  if (lower.startsWith('✓') || lower.startsWith('done') || lower.startsWith('success')) {
    return { kind: 'success', text: content }
  }
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
  // Shorten long paths: show last 2 segments
  const displayArg = toolArg ? toolArg.replace(/^.*?([\w.-]+\/[\w.-]+)$/, '$1') || toolArg : ''
  const fullArg = toolArg || ''

  return (
    <span className={styles.toolLine}>
      <span className={styles.toolIcon}>{toolIcon(toolName)}</span>
      <span className={styles.toolBadge}>{toolName}</span>
      {fullArg && (
        <span className={styles.toolArg} title={fullArg}>
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

  if (parsed.kind === 'claude') {
    return <ClaudeBubble content={content} timestamp={timestamp} />
  }

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
  const { state, dispatch } = useApp()
  const { logLines, engineStatus } = state
  const bodyRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [scrollTop, setScrollTop] = useState(0)
  const isRunning = engineStatus === 'running'
  const virtualize = logLines.length > VIRT_THRESHOLD

  useEffect(() => {
    if (autoScroll && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight
    }
  }, [logLines, autoScroll])

  useEffect(() => {
    if (engineStatus === 'running') setAutoScroll(true)
  }, [engineStatus])

  const handleScroll = useCallback(() => {
    const el = bodyRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 8
    setAutoScroll(atBottom)
    if (virtualize) setScrollTop(el.scrollTop)
  }, [virtualize])

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

  return (
    <div className={styles.logPanel}>
      <div className={styles.header}>
        <span className={styles.title}>Output</span>
        {isRunning && <span className={styles.liveDot} aria-label="running" />}
        {logLines.length > 0 && (
          <span className={styles.lineCount}>{logLines.length.toLocaleString()} lines</span>
        )}
        {!autoScroll && logLines.length > 0 && (
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
            onClick={() => dispatch({ type: 'LOG_CLEAR' })}
            title="Clear output"
          >
            Clear
          </button>
        )}
      </div>
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
    </div>
  )
}

export default LogPanel

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Paperclip, ArrowUp, Square, ChevronDown } from 'lucide-react'
import { onHarnessLogLine, onHarnessDone, onEngineError, onTemplates } from '@/lib/events'
import { engineCommand } from '@/lib/ipc'
import { useApp } from '@/context/AppContext'
import {
  PRD_PROMPT,
  ARCHITECTURE_PROMPT,
  FEATURE_PROMPT,
  TASK_PROMPT,
  TEST_CASE_PROMPT,
} from './prompts'
import FileModal from './FileModal'
import styles from './ChatPanel.module.css'

interface FileNode {
  name: string
  path: string
  is_dir: boolean
  children?: FileNode[]
}

function collectPaths(node: FileNode, paths: Set<string>) {
  if (!node.is_dir) paths.add(node.path)
  node.children?.forEach((c) => collectPaths(c, paths))
}

function findNewFiles(before: Set<string>, after: FileNode): string[] {
  const result: string[] = []
  function walk(node: FileNode) {
    if (!node.is_dir && !before.has(node.path)) result.push(node.path)
    node.children?.forEach(walk)
  }
  walk(after)
  return result
}

const WRITE_TOOLS = new Set([
  'write_file',
  'write',
  'edit',
  'multiedit',
  'str_replace_editor',
  'str_replace_based_edit',
])

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  createdFiles?: string[]
  updatedFiles?: string[]
  duration?: number // ms — total response time
}

// Typed streaming blocks — one per distinct item type from Claude
type StreamBlock =
  | { id: string; kind: 'prose'; text: string }
  | {
      id: string
      kind: 'tool'
      tool: string
      arg: string
      result: string
      startTime: number
      duration?: number
    }

function fmtMs(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  return `${m}m ${s}s`
}

interface Props {
  projectPath: string
  projectName: string
  onFileChange?: () => void
  pendingAttach?: string | null
  onAttachConsumed?: () => void
  dropZoneRef?: React.RefObject<HTMLDivElement>
  isDragOver?: boolean
  /** When true, hides the internal "Claude Chat" header (used by FloatingChat overlay) */
  compact?: boolean
}

function ts() {
  return new Date().toLocaleTimeString('en', { hour12: false })
}

const TOOL_ICONS: Record<string, string> = {
  bash: '»',
  read: '↳',
  write: '↳',
  write_file: '↳',
  edit: '↳',
  multiedit: '↳',
  find: '⌕',
  grep: '⌕',
  glob: '⌕',
  ls: '⌕',
}

function StreamToolBlock({
  tool,
  arg,
  result,
  duration,
}: {
  tool: string
  arg: string
  result: string
  duration?: number
}) {
  const [expanded, setExpanded] = useState(false)
  const icon = TOOL_ICONS[tool.toLowerCase()] ?? '·'
  const shortArg = arg.length > 55 ? arg.slice(0, 55) + '…' : arg

  return (
    <div className={styles.toolBlock}>
      <button className={styles.toolHeader} onClick={() => setExpanded((e) => !e)}>
        <span className={styles.toolIcon}>{icon}</span>
        <span className={styles.toolName}>{tool}</span>
        {shortArg && <span className={styles.toolArg}>{shortArg}</span>}
        {duration !== undefined && <span className={styles.toolDuration}>{fmtMs(duration)}</span>}
        <span className={styles.toolChevron}>{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && result && <pre className={styles.toolResult}>{result}</pre>}
      {expanded && !result && (
        <div className={styles.toolResultPending}>
          <span className={styles.miniDot} />
          <span className={styles.miniDot} />
          <span className={styles.miniDot} />
        </div>
      )}
    </div>
  )
}

function StreamProseBlock({ text, streaming }: { text: string; streaming: boolean }) {
  return (
    <div className={`${styles.streamProse} ${streaming ? styles.streamProseActive : ''}`}>
      <span className={styles.streamProseText}>{text}</span>
      {streaming && <span className={styles.streamCursor} />}
    </div>
  )
}

function FileChipGroup({
  label,
  files,
  chipClass,
  onOpenFile,
}: {
  label: string
  files: string[]
  chipClass: string
  onOpenFile?: (path: string) => void
}) {
  return (
    <div className={styles.createdFiles}>
      <span className={styles.createdLabel}>{label}</span>
      <div className={styles.fileChips}>
        {files.map((f) => {
          const name = f.split('/').pop() ?? f
          const rel = f.includes('/harness/') ? f.split('/harness/')[1] : f
          return (
            <button key={f} className={chipClass} onClick={() => onOpenFile?.(f)} title={f}>
              {rel || name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function AssistantBubble({
  content,
  timestamp,
  createdFiles,
  updatedFiles,
  onOpenFile,
  duration,
}: {
  content: string
  timestamp: string
  createdFiles?: string[]
  updatedFiles?: string[]
  onOpenFile?: (path: string) => void
  duration?: number
}) {
  return (
    <div className={styles.assistantMsg}>
      <div className={styles.assistantLabel}>
        <span className={styles.assistantAvatar}>C</span>
        <span className={styles.assistantName}>Claude</span>
      </div>
      <div className={styles.assistantBubble}>
        <span className={styles.bubbleContent}>{content || '…'}</span>
      </div>
      {createdFiles && createdFiles.length > 0 && (
        <FileChipGroup
          label="📁 Created"
          files={createdFiles}
          chipClass={styles.fileChip}
          onOpenFile={onOpenFile}
        />
      )}
      {updatedFiles && updatedFiles.length > 0 && (
        <FileChipGroup
          label="✏️ Updated"
          files={updatedFiles}
          chipClass={styles.fileChipUpdated}
          onOpenFile={onOpenFile}
        />
      )}
      <span className={styles.msgTs}>
        {timestamp}
        {duration !== undefined && <span className={styles.durationBadge}>{fmtMs(duration)}</span>}
      </span>
    </div>
  )
}

function UserBubble({ msg }: { msg: ChatMessage }) {
  return (
    <div className={styles.userMsg}>
      <div className={styles.userBubble}>{msg.content}</div>
      <span className={styles.msgTs}>{msg.timestamp}</span>
    </div>
  )
}

function ChatPanel({
  projectPath,
  projectName,
  onFileChange,
  pendingAttach,
  onAttachConsumed,
  dropZoneRef,
  isDragOver = false,
  compact = false,
}: Props) {
  const { state, dispatch } = useApp()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [model, setModel] = useState('claude-sonnet-4-6')
  const [showAddTemplate, setShowAddTemplate] = useState(false)
  const [newTplLabel, setNewTplLabel] = useState('')
  const [newTplPrompt, setNewTplPrompt] = useState('')
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const tplDropRef = useRef<HTMLDivElement>(null)
  const tplBtnRef = useRef<HTMLButtonElement>(null)
  const [tplDropPos, setTplDropPos] = useState<{ left: number; bottom: number } | null>(null)

  // Position the dropdown in fixed coords so it escapes inputCard's overflow:hidden
  useLayoutEffect(() => {
    if (!showTemplates || !tplBtnRef.current) return
    const r = tplBtnRef.current.getBoundingClientRect()
    setTplDropPos({ left: r.left, bottom: window.innerHeight - r.top + 4 })
  }, [showTemplates])

  // Rich streaming state: typed blocks instead of a single string
  const [streamBlocks, setStreamBlocks] = useState<StreamBlock[]>([])
  const isStreamingRef = useRef(false)

  // Timing
  const sendTimeRef = useRef<number>(0)
  const [elapsed, setElapsed] = useState(0)

  const [inputHeight, setInputHeight] = useState(120)
  const listRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function onInputResizeMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    const startY = e.clientY
    const startH = inputHeight
    function onMove(me: MouseEvent) {
      const delta = startY - me.clientY
      setInputHeight(Math.max(72, Math.min(480, startH + delta)))
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }
  const beforeSnapshotRef = useRef<Set<string>>(new Set())
  const touchedFilesRef = useRef<Set<string>>(new Set())
  const [modalPath, setModalPath] = useState<string | null>(null)
  const projectPathRef = useRef(projectPath)
  projectPathRef.current = projectPath
  const onFileChangeRef = useRef(onFileChange)
  onFileChangeRef.current = onFileChange

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages, streamBlocks])

  // Close templates dropdown when clicking outside
  useEffect(() => {
    if (!showTemplates) return
    function onDown(e: MouseEvent) {
      if (tplDropRef.current && !tplDropRef.current.contains(e.target as Node)) {
        setShowTemplates(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [showTemplates])

  // Live elapsed timer — updates every 100ms while Claude is working
  useEffect(() => {
    if (!sending) {
      setElapsed(0)
      return
    }
    const id = setInterval(() => setElapsed(Date.now() - sendTimeRef.current), 100)
    return () => clearInterval(id)
  }, [sending])

  useEffect(() => {
    let cancelled = false
    let cleanupFns: Array<() => void> = []

    engineCommand({ action: 'get_templates' }).catch(() => {})

    Promise.all([
      onTemplates((templates) => {
        dispatch({ type: 'SET_CUSTOM_TEMPLATES', templates })
      }),

      onHarnessLogLine((line) => {
        if (cancelled) return
        const kind = line.kind ?? 'prose'

        if (kind === 'prose') {
          setStreamBlocks((prev) => {
            const last = prev[prev.length - 1]
            if (last?.kind === 'prose') {
              return [...prev.slice(0, -1), { ...last, text: last.text + '\n' + line.content }]
            }
            return [...prev, { id: crypto.randomUUID(), kind: 'prose', text: line.content }]
          })
        } else if (kind === 'tool') {
          const match = line.content.match(/^\[tool:\s*([^\]]+)\]\s*(.*)$/)
          const tool = match?.[1]?.trim() ?? 'unknown'
          const arg = match?.[2]?.trim() ?? ''
          if (WRITE_TOOLS.has(tool.toLowerCase()) && arg) {
            touchedFilesRef.current.add(arg)
          }
          setStreamBlocks((prev) => [
            ...prev,
            { id: crypto.randomUUID(), kind: 'tool', tool, arg, result: '', startTime: Date.now() },
          ])
        } else if (kind === 'result') {
          setStreamBlocks((prev) => {
            const last = prev[prev.length - 1]
            if (last?.kind === 'tool') {
              const newResult = last.result ? last.result + '\n' + line.content : line.content
              // Record duration only on first result line
              const duration =
                last.duration !== undefined ? last.duration : Date.now() - last.startTime
              return [...prev.slice(0, -1), { ...last, result: newResult, duration }]
            }
            return prev
          })
        }
      }),

      onHarnessDone(() => {
        if (cancelled) return
        isStreamingRef.current = false
        const duration = Date.now() - sendTimeRef.current
        const touched = new Set(touchedFilesRef.current)

        setStreamBlocks((prev) => {
          const prose = prev
            .filter((b) => b.kind === 'prose')
            .map((b) => (b as { kind: 'prose'; text: string }).text)
            .join('\n\n')

          invoke<FileNode>('read_directory', { path: projectPathRef.current })
            .then((tree) => {
              const newFiles = findNewFiles(beforeSnapshotRef.current, tree)
              const newFileSet = new Set(newFiles)
              const updatedFiles = [...touched].filter(
                (p) => beforeSnapshotRef.current.has(p) && !newFileSet.has(p)
              )
              setMessages((msgs) => [
                ...msgs,
                {
                  id: crypto.randomUUID(),
                  role: 'assistant',
                  content: prose || '…',
                  timestamp: ts(),
                  duration,
                  createdFiles: newFiles.length > 0 ? newFiles : undefined,
                  updatedFiles: updatedFiles.length > 0 ? updatedFiles : undefined,
                },
              ])
            })
            .catch(() => {
              const updatedFiles = [...touched].filter((p) => beforeSnapshotRef.current.has(p))
              setMessages((msgs) => [
                ...msgs,
                {
                  id: crypto.randomUUID(),
                  role: 'assistant',
                  content: prose || '…',
                  timestamp: ts(),
                  duration,
                  updatedFiles: updatedFiles.length > 0 ? updatedFiles : undefined,
                },
              ])
            })

          setSending(false)
          onFileChangeRef.current?.()
          return []
        })
      }),

      onEngineError((msg) => {
        if (cancelled) return
        if (!msg.startsWith('missing_dep:')) {
          isStreamingRef.current = false
          setStreamBlocks([])
          setSending(false)
        }
      }),
    ]).then((fns) => {
      if (cancelled) fns.forEach((fn) => fn())
      else cleanupFns = fns
    })

    return () => {
      cancelled = true
      cleanupFns.forEach((fn) => fn())
    }
  }, [dispatch]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!pendingAttach) return
    setInput((prev) => prev + (prev.trim() ? '\n' : '') + `[file: ${pendingAttach}]`)
    textareaRef.current?.focus()
    onAttachConsumed?.()
  }, [pendingAttach, onAttachConsumed])

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || sending) return

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text.trim(),
        timestamp: ts(),
      }
      const history = messages.map((m) => ({ role: m.role, content: m.content }))

      invoke<FileNode>('read_directory', { path: projectPath })
        .then((tree) => {
          const paths = new Set<string>()
          collectPaths(tree, paths)
          beforeSnapshotRef.current = paths
        })
        .catch(() => {
          beforeSnapshotRef.current = new Set()
        })

      sendTimeRef.current = Date.now()
      setElapsed(0)
      setMessages((prev) => [...prev, userMsg])
      setStreamBlocks([])
      touchedFilesRef.current = new Set()
      isStreamingRef.current = true
      setInput('')
      setSending(true)

      await invoke('invoke_claude', {
        message: text.trim(),
        history,
        projectPath,
        model,
      }).catch(() => {
        setSending(false)
        isStreamingRef.current = false
        setStreamBlocks([])
      })
    },
    [messages, sending, projectPath, model]
  )

  function insertTemplate(prompt: string) {
    setInput((prev) => (prev.trim() ? prev.trimEnd() + '\n\n' + prompt : prompt))
    setShowTemplates(false)
    textareaRef.current?.focus()
  }

  async function handleAttach() {
    const path = await invoke<string | null>('open_file_picker').catch(() => null)
    if (path) {
      setInput((prev) => prev + (prev ? ' ' : '') + `[file: ${path}]`)
      textareaRef.current?.focus()
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
  }

  const defaultActions = [
    { id: '_prd', label: '📋 PRD', prompt: PRD_PROMPT(projectName) },
    { id: '_arch', label: '🏗 Architecture', prompt: ARCHITECTURE_PROMPT(projectName) },
    { id: '_feature', label: '✨ Feature Brief', prompt: FEATURE_PROMPT(projectName) },
    { id: '_task', label: '➕ New Task', prompt: TASK_PROMPT(projectName) },
    { id: '_test', label: '🧪 Generate Test Case', prompt: TEST_CASE_PROMPT(projectName) },
  ]

  function openAddTemplate() {
    setEditingTemplateId(null)
    setNewTplLabel('')
    setNewTplPrompt('')
    setShowAddTemplate(true)
  }

  function openEditTemplate(t: { id: string; label: string; prompt: string }) {
    setEditingTemplateId(t.id)
    setNewTplLabel(t.label)
    setNewTplPrompt(t.prompt)
    setShowAddTemplate(true)
  }

  function closeTemplatePopup() {
    setShowAddTemplate(false)
    setEditingTemplateId(null)
    setNewTplLabel('')
    setNewTplPrompt('')
  }

  async function handleSaveTemplate() {
    if (!newTplLabel.trim() || !newTplPrompt.trim()) return
    const id = editingTemplateId ?? `custom_${Date.now()}`
    await engineCommand({
      action: 'save_template',
      template: { id, label: newTplLabel.trim(), prompt: newTplPrompt.trim() },
    }).catch(() => {})
    closeTemplatePopup()
  }

  async function handleDeleteTemplate(id: string) {
    await engineCommand({ action: 'delete_template', id }).catch(() => {})
  }

  const isStreaming = streamBlocks.length > 0

  return (
    <>
      <div className={`${styles.panel} ${compact ? styles.panelCompact : ''}`}>
        {!compact && (
          <div className={styles.header}>
            <span className={styles.title}>Claude Chat</span>
            {(messages.length > 0 || sending) && (
              <button
                className={styles.clearBtn}
                onClick={() => {
                  setMessages([])
                  setStreamBlocks([])
                }}
              >
                Clear
              </button>
            )}
          </div>
        )}

        <div className={styles.messages} ref={listRef}>
          {messages.length === 0 && !sending && (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>⎇</div>
              <p className={styles.emptyTitle}>Harness Assistant</p>
              <p className={styles.emptyHint}>
                Ask Claude to generate harness files, create tasks, or explain the codebase. Use the
                quick actions below to get started.
              </p>
            </div>
          )}

          {messages.map((msg) =>
            msg.role === 'user' ? (
              <UserBubble key={msg.id} msg={msg} />
            ) : (
              <AssistantBubble
                key={msg.id}
                content={msg.content}
                timestamp={msg.timestamp}
                createdFiles={msg.createdFiles}
                updatedFiles={msg.updatedFiles}
                onOpenFile={setModalPath}
                duration={msg.duration}
              />
            )
          )}

          {/* Live streaming blocks — shown immediately on send, before first block arrives */}
          {sending && (
            <div className={styles.streamContainer}>
              <div className={styles.streamHeader}>
                <span className={styles.streamDot} />
                <span className={styles.streamLabel}>Claude</span>
                <span className={styles.streamTimer}>{fmtMs(elapsed)}</span>
              </div>
              {!isStreaming && (
                <div className={styles.thinkingRow}>
                  <span className={styles.miniDot} />
                  <span className={styles.miniDot} />
                  <span className={styles.miniDot} />
                </div>
              )}
              {streamBlocks.map((block, i) => {
                const isLast = i === streamBlocks.length - 1
                if (block.kind === 'prose') {
                  return (
                    <StreamProseBlock
                      key={block.id}
                      text={block.text}
                      streaming={isLast && sending}
                    />
                  )
                }
                return (
                  <StreamToolBlock
                    key={block.id}
                    tool={block.tool}
                    arg={block.arg}
                    result={block.result}
                    duration={block.duration}
                  />
                )
              })}
            </div>
          )}
        </div>

        <div className={styles.inputSection}>
          {showAddTemplate && (
            <div className={styles.addTemplatePopup}>
              <div className={styles.addTemplateTitle}>
                {editingTemplateId ? 'Edit Template' : 'New Template'}
              </div>
              <input
                className={styles.addTemplateInput}
                placeholder="Template name…"
                value={newTplLabel}
                onChange={(e) => setNewTplLabel(e.target.value)}
                autoFocus
              />
              <textarea
                className={styles.addTemplateTextarea}
                placeholder="Prompt text…"
                value={newTplPrompt}
                onChange={(e) => setNewTplPrompt(e.target.value)}
                rows={5}
              />
              <div className={styles.addTemplateActions}>
                <button className={styles.cancelBtn} onClick={closeTemplatePopup}>
                  Cancel
                </button>
                <button
                  className={styles.saveTemplateBtn}
                  onClick={handleSaveTemplate}
                  disabled={!newTplLabel.trim() || !newTplPrompt.trim()}
                >
                  {editingTemplateId ? 'Update' : 'Save'}
                </button>
              </div>
            </div>
          )}

          {/* Unified input card — drop zone managed by HarnessManager */}
          <div
            ref={dropZoneRef}
            className={`${styles.inputCard} ${isDragOver ? styles.inputCardDragOver : ''}`}
          >
            {isDragOver && (
              <div className={styles.dropOverlay}>
                <span className={styles.dropOverlayIcon}>⊕</span>
                <span className={styles.dropOverlayText}>Drop to attach file</span>
              </div>
            )}
            <div
              className={styles.inputResizeHandle}
              onMouseDown={onInputResizeMouseDown}
              title="Drag to resize"
            />
            <textarea
              ref={textareaRef}
              className={styles.textarea}
              style={{ height: inputHeight, maxHeight: inputHeight }}
              placeholder="Ask Claude anything… or drag a file from the explorer"
              value={input}
              onChange={onInputChange}
              onKeyDown={onKeyDown}
              disabled={sending}
            />
            <div className={styles.inputToolbar}>
              <div className={styles.toolbarLeft}>
                <button
                  className={styles.toolbarBtn}
                  onClick={handleAttach}
                  title="Attach file"
                  disabled={sending}
                >
                  <Paperclip size={13} strokeWidth={2} />
                  <span>Attach</span>
                </button>

                {/* Templates dropdown — fixed-position to escape inputCard's overflow:hidden */}
                <div className={styles.tplDropWrap} ref={tplDropRef}>
                  <button
                    ref={tplBtnRef}
                    className={`${styles.toolbarBtn} ${showTemplates ? styles.toolbarBtnActive : ''}`}
                    onClick={() => setShowTemplates((v) => !v)}
                    disabled={sending}
                    title="Templates"
                  >
                    <span>Templates</span>
                    <ChevronDown
                      size={10}
                      strokeWidth={2.5}
                      style={{ marginLeft: 2, opacity: 0.6 }}
                    />
                  </button>
                  {showTemplates && tplDropPos && (
                    <div
                      className={styles.tplDropdown}
                      style={{
                        position: 'fixed',
                        left: tplDropPos.left,
                        bottom: tplDropPos.bottom,
                      }}
                    >
                      {defaultActions.map((qa) => (
                        <button
                          key={qa.id}
                          className={styles.tplItem}
                          onClick={() => insertTemplate(qa.prompt)}
                        >
                          {qa.label}
                        </button>
                      ))}
                      {state.customTemplates.length > 0 && <div className={styles.tplDivider} />}
                      {state.customTemplates.map((t) => (
                        <div key={t.id} className={styles.tplItemRow}>
                          <button
                            className={styles.tplItem}
                            onClick={() => insertTemplate(t.prompt)}
                          >
                            {t.label}
                          </button>
                          <button
                            className={styles.tplRowAction}
                            onClick={() => {
                              openEditTemplate(t)
                              setShowTemplates(false)
                            }}
                            title="Edit"
                          >
                            ✏
                          </button>
                          <button
                            className={styles.tplRowAction}
                            onClick={() => handleDeleteTemplate(t.id)}
                            title="Delete"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <div className={styles.tplDivider} />
                      <button
                        className={styles.tplNewBtn}
                        onClick={() => {
                          openAddTemplate()
                          setShowTemplates(false)
                        }}
                      >
                        + New template
                      </button>
                    </div>
                  )}
                </div>

                <div className={styles.modelSelectWrap}>
                  <select
                    className={styles.modelSelect}
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    disabled={sending}
                    title="Claude model"
                  >
                    <option value="claude-sonnet-4-6">Sonnet 4.6</option>
                    <option value="claude-opus-4-7">Opus 4.7</option>
                    <option value="claude-haiku-4-5-20251001">Haiku 4.5</option>
                  </select>
                  <ChevronDown size={10} strokeWidth={2.5} className={styles.modelChevron} />
                </div>
              </div>
              <div className={styles.toolbarRight}>
                <span className={styles.inputHint}>⇧↵ new line</span>
                {sending ? (
                  <button
                    className={styles.stopBtn}
                    onClick={() => invoke('stop_harness_chat').catch(() => {})}
                    title="Stop"
                  >
                    <Square size={12} strokeWidth={2.5} />
                    Stop
                  </button>
                ) : (
                  <button
                    className={styles.sendBtn}
                    onClick={() => send(input)}
                    disabled={!input.trim()}
                    title="Send (Enter)"
                  >
                    <ArrowUp size={13} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {modalPath && (
        <FileModal path={modalPath} onClose={() => setModalPath(null)} onAttach={undefined} />
      )}
    </>
  )
}

export default ChatPanel

import { useEffect, useRef, useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
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

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  createdFiles?: string[]
}

interface Props {
  projectPath: string
  projectName: string
  onFileChange?: () => void
  pendingAttach?: string | null
  onAttachConsumed?: () => void
}

function ts() {
  return new Date().toLocaleTimeString('en', { hour12: false })
}

function ThinkingBubble({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false)

  // Show last meaningful line as a live status hint.
  const lines = content.split('\n').filter((l) => l.trim())
  const last = lines[lines.length - 1] ?? 'Working…'
  const status = last.length > 72 ? last.slice(0, 72) + '…' : last

  return (
    <div className={styles.thinkingMsg}>
      <div className={styles.thinkingBubble}>
        <div className={styles.thinkingHeader}>
          <div className={styles.thinkingLeft}>
            <span className={styles.thinkingDots}>
              <span />
              <span />
              <span />
            </span>
            <span className={styles.thinkingStatus}>{status}</span>
          </div>
          <button
            className={styles.expandBtn}
            onClick={() => setExpanded((e) => !e)}
            title={expanded ? 'Collapse' : 'Show details'}
          >
            {expanded ? '▲' : '▼'}
          </button>
        </div>
        {expanded && (
          <div className={styles.thinkingContent}>
            {content}
            <span className={styles.cursor} />
          </div>
        )}
      </div>
    </div>
  )
}

function AssistantBubble({
  content,
  timestamp,
  streaming,
  createdFiles,
  onOpenFile,
}: {
  content: string
  timestamp: string
  streaming?: boolean
  createdFiles?: string[]
  onOpenFile?: (path: string) => void
}) {
  return (
    <div className={styles.assistantMsg}>
      <div className={styles.assistantBubble}>
        <span className={styles.bubbleContent}>{content || '…'}</span>
        {streaming && <span className={styles.cursor} />}
      </div>
      {createdFiles && createdFiles.length > 0 && (
        <div className={styles.createdFiles}>
          <span className={styles.createdLabel}>📁 Files created</span>
          <div className={styles.fileChips}>
            {createdFiles.map((f) => {
              const name = f.split('/').pop() ?? f
              const rel = f.includes('/harness/') ? f.split('/harness/')[1] : f
              return (
                <button
                  key={f}
                  className={styles.fileChip}
                  onClick={() => onOpenFile?.(f)}
                  title={f}
                >
                  {rel || name}
                </button>
              )
            })}
          </div>
        </div>
      )}
      <span className={styles.msgTs}>{timestamp}</span>
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
}: Props) {
  const { state, dispatch } = useApp()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [model, setModel] = useState('claude-sonnet-4-6')
  const [showAddTemplate, setShowAddTemplate] = useState(false)
  const [newTplLabel, setNewTplLabel] = useState('')
  const [newTplPrompt, setNewTplPrompt] = useState('')
  // Streaming content lives in a ref + mirrored to state for rendering.
  // This avoids the race condition where events arrive before React commits state.
  const [streamingContent, setStreamingContent] = useState<string | null>(null)
  const streamRef = useRef('')
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const beforeSnapshotRef = useRef<Set<string>>(new Set())
  const [modalPath, setModalPath] = useState<string | null>(null)
  // Refs so the listener effect doesn't need these as deps (avoids re-registration).
  const projectPathRef = useRef(projectPath)
  projectPathRef.current = projectPath
  const onFileChangeRef = useRef(onFileChange)
  onFileChangeRef.current = onFileChange

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages, streamingContent])

  // Register Tauri event listeners with proper async pattern.
  useEffect(() => {
    // Use a `cancelled` flag instead of `mounted` so the Promise.then()
    // handler correctly handles React StrictMode's double-invoke of effects.
    let cancelled = false
    let cleanupFns: Array<() => void> = []

    engineCommand({ action: 'get_templates' }).catch(() => {})

    Promise.all([
      onTemplates((templates) => {
        dispatch({ type: 'SET_CUSTOM_TEMPLATES', templates })
      }),

      onHarnessLogLine((line) => {
        streamRef.current = streamRef.current
          ? streamRef.current + '\n' + line.content
          : line.content
        if (!flushTimerRef.current) {
          flushTimerRef.current = setTimeout(() => {
            setStreamingContent(streamRef.current)
            flushTimerRef.current = null
          }, 30)
        }
      }),

      onHarnessDone(() => {
        if (flushTimerRef.current) {
          clearTimeout(flushTimerRef.current)
          flushTimerRef.current = null
        }
        const content = streamRef.current
        streamRef.current = ''
        setStreamingContent(null)

        // Diff file tree to find files Claude created during this response.
        const snapshot = beforeSnapshotRef.current
        invoke<FileNode>('read_directory', { path: projectPathRef.current })
          .then((tree) => {
            const newFiles = findNewFiles(snapshot, tree)
            setMessages((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: content || '…',
                timestamp: ts(),
                createdFiles: newFiles.length > 0 ? newFiles : undefined,
              },
            ])
          })
          .catch(() => {
            if (content) {
              setMessages((prev) => [
                ...prev,
                { id: crypto.randomUUID(), role: 'assistant', content, timestamp: ts() },
              ])
            }
          })

        setSending(false)
        onFileChangeRef.current?.()
      }),

      onEngineError((msg) => {
        if (!msg.startsWith('missing_dep:')) {
          if (flushTimerRef.current) {
            clearTimeout(flushTimerRef.current)
            flushTimerRef.current = null
          }
          streamRef.current = ''
          setStreamingContent(null)
          setSending(false)
        }
      }),
    ]).then((fns) => {
      if (cancelled) {
        fns.forEach((fn) => fn())
      } else {
        cleanupFns = fns
      }
    })

    return () => {
      cancelled = true
      cleanupFns.forEach((fn) => fn())
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }
    }
  }, [dispatch]) // eslint-disable-line react-hooks/exhaustive-deps

  // Consume file path attached from the FileModal.
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

      streamRef.current = ''
      // Snapshot current file tree so we can diff after Claude responds.
      invoke<FileNode>('read_directory', { path: projectPath })
        .then((tree) => {
          const paths = new Set<string>()
          collectPaths(tree, paths)
          beforeSnapshotRef.current = paths
        })
        .catch(() => {
          beforeSnapshotRef.current = new Set()
        })
      setMessages((prev) => [...prev, userMsg])
      setStreamingContent('')
      setInput('')
      setSending(true)

      await invoke('invoke_claude', {
        message: text.trim(),
        history,
        projectPath,
        model,
      }).catch(() => {
        setSending(false)
        setStreamingContent(null)
        streamRef.current = ''
      })
    },
    [messages, sending, projectPath, model]
  )

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
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 220) + 'px'
  }

  const defaultActions = [
    { id: '_prd', label: '📋 PRD', prompt: PRD_PROMPT(projectName) },
    { id: '_arch', label: '🏗 Architecture', prompt: ARCHITECTURE_PROMPT(projectName) },
    { id: '_feature', label: '✨ Feature Brief', prompt: FEATURE_PROMPT(projectName) },
    { id: '_task', label: '➕ New Task', prompt: TASK_PROMPT(projectName) },
    { id: '_test', label: '🧪 Test Cases', prompt: TEST_CASE_PROMPT(projectName) },
  ]
  const quickActions = [
    ...defaultActions,
    ...state.customTemplates.map((t) => ({ id: t.id, label: t.label, prompt: t.prompt })),
  ]

  async function handleSaveTemplate() {
    if (!newTplLabel.trim() || !newTplPrompt.trim()) return
    const id = `custom_${Date.now()}`
    await engineCommand({
      action: 'save_template',
      template: { id, label: newTplLabel.trim(), prompt: newTplPrompt.trim() },
    }).catch(() => {})
    setShowAddTemplate(false)
    setNewTplLabel('')
    setNewTplPrompt('')
  }

  return (
    <>
      <div className={styles.panel}>
        <div className={styles.header}>
          <span className={styles.title}>Claude Chat</span>
          {(messages.length > 0 || streamingContent !== null) && (
            <button
              className={styles.clearBtn}
              onClick={() => {
                setMessages([])
                setStreamingContent(null)
                streamRef.current = ''
              }}
            >
              Clear
            </button>
          )}
        </div>

        <div className={styles.messages} ref={listRef}>
          {messages.length === 0 && streamingContent === null && (
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
                onOpenFile={setModalPath}
              />
            )
          )}
          {streamingContent !== null && <ThinkingBubble content={streamingContent} />}
        </div>

        <div className={styles.quickActions}>
          {showAddTemplate && (
            <div className={styles.addTemplatePopup}>
              <div className={styles.addTemplateTitle}>New Template</div>
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
                <button
                  className={styles.cancelBtn}
                  onClick={() => {
                    setShowAddTemplate(false)
                    setNewTplLabel('')
                    setNewTplPrompt('')
                  }}
                >
                  Cancel
                </button>
                <button
                  className={styles.saveTemplateBtn}
                  onClick={handleSaveTemplate}
                  disabled={!newTplLabel.trim() || !newTplPrompt.trim()}
                >
                  Save
                </button>
              </div>
            </div>
          )}
          {quickActions.map((qa) => (
            <button
              key={qa.id}
              className={styles.quickBtn}
              onClick={() => setInput(qa.prompt)}
              disabled={sending}
            >
              {qa.label}
            </button>
          ))}
          <button
            className={styles.addTemplateBtn}
            onClick={() => setShowAddTemplate((v) => !v)}
            title="Add template"
            disabled={sending}
          >
            +
          </button>
        </div>

        <div className={styles.inputBar}>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            placeholder="Ask Claude anything… (Enter to send, Shift+Enter for new line)"
            value={input}
            onChange={onInputChange}
            onKeyDown={onKeyDown}
            rows={3}
            disabled={sending}
          />
          <div className={styles.inputFooter}>
            <div className={styles.footerLeft}>
              <button
                className={styles.attachBtn}
                onClick={handleAttach}
                title="Attach file path"
                disabled={sending}
              >
                📎 Attach file
              </button>
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
            </div>
            <div className={styles.footerRight}>
              {sending && (
                <button
                  className={styles.stopBtn}
                  onClick={() => invoke('stop_harness_chat').catch(() => {})}
                  title="Stop"
                >
                  ⏹ Stop
                </button>
              )}
              <button
                className={styles.sendBtn}
                onClick={() => send(input)}
                disabled={!input.trim() || sending}
                title="Send (Enter)"
              >
                {sending ? 'Sending…' : 'Send ▶'}
              </button>
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

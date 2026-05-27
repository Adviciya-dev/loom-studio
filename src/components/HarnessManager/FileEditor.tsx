/**
 * FileEditor — Monaco-based VS Code-like file editor.
 *
 * Monaco workers are configured at module scope so the setup runs once
 * regardless of how many FileEditor instances are mounted.
 */
import * as monaco from 'monaco-editor'
import { loader, Editor } from '@monaco-editor/react'
import { useEffect, useRef, useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import styles from './FileEditor.module.css'

// ── Monaco worker bootstrap ──────────────────────────────────────────
// Use the locally installed monaco-editor package (no CDN)
loader.config({ monaco })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(self as any).MonacoEnvironment = {
  getWorker(_: unknown, _label: string) {
    // Inline a minimal no-op worker.  We only need Monaco's main-thread
    // tokenisation; we don't need the language service workers
    // (TS/CSS/HTML IntelliSense) for a plain file editor.
    const src = `
      self.onmessage = function(e) {
        // no-op: language-service features disabled for file viewer
      };
    `
    return new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })))
  },
}

// ── Language detection ────────────────────────────────────────────────
function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    json: 'json',
    jsonc: 'json',
    css: 'css',
    scss: 'scss',
    less: 'less',
    html: 'html',
    htm: 'html',
    md: 'markdown',
    mdx: 'markdown',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'ini',
    rs: 'rust',
    go: 'go',
    py: 'python',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    svg: 'xml',
    xml: 'xml',
  }
  return map[ext] ?? 'plaintext'
}

// ── Component ─────────────────────────────────────────────────────────
interface FileEditorProps {
  path: string
  onDirtyChange: (dirty: boolean) => void
  onSaved?: () => void
  /** Increment to reload content from disk (e.g. after external write) */
  externalReloadKey?: number
}

export default function FileEditor({
  path,
  onDirtyChange,
  onSaved,
  externalReloadKey,
}: FileEditorProps) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const valueRef = useRef<string>('')
  const dirtyRef = useRef(false)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const saveMsgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fileName = path.split('/').pop() ?? path
  const language = detectLanguage(path)

  // Load file
  useEffect(() => {
    setContent(null)
    setError(null)
    dirtyRef.current = false
    onDirtyChange(false)
    invoke<string>('read_file_content', { path })
      .then((c) => {
        setContent(c)
        valueRef.current = c
      })
      .catch((e: unknown) => setError(String(e)))
  }, [path]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reload file from disk without remounting the editor (preserves scroll/cursor)
  const reloadFromDisk = useCallback(async () => {
    try {
      const c = await invoke<string>('read_file_content', { path })
      valueRef.current = c
      dirtyRef.current = false
      onDirtyChange(false)
      if (editorRef.current) {
        const model = editorRef.current.getModel()
        if (model) {
          // Preserve viewport & cursor so the view doesn't jump
          const pos = editorRef.current.getPosition()
          const scrollTop = editorRef.current.getScrollTop()
          model.setValue(c)
          if (pos) editorRef.current.setPosition(pos)
          editorRef.current.setScrollTop(scrollTop)
        }
      }
      if (saveMsgTimerRef.current) clearTimeout(saveMsgTimerRef.current)
      setSaveMsg('Updated')
      saveMsgTimerRef.current = setTimeout(() => setSaveMsg(null), 1800)
    } catch {
      // Silently ignore — file may be mid-write; next reload will catch it
    }
  }, [path, onDirtyChange])

  // Reload whenever an external change is signalled (e.g. FloatingChat wrote the file)
  const prevExternalKeyRef = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (externalReloadKey === undefined) return
    if (prevExternalKeyRef.current === undefined) {
      prevExternalKeyRef.current = externalReloadKey
      return // skip the initial render
    }
    if (externalReloadKey !== prevExternalKeyRef.current) {
      prevExternalKeyRef.current = externalReloadKey
      reloadFromDisk()
    }
  }, [externalReloadKey, reloadFromDisk])

  const save = useCallback(async () => {
    if (!dirtyRef.current) return
    try {
      await invoke('write_file_content', { path, content: valueRef.current })
      dirtyRef.current = false
      onDirtyChange(false)
      if (saveMsgTimerRef.current) clearTimeout(saveMsgTimerRef.current)
      setSaveMsg('Saved')
      saveMsgTimerRef.current = setTimeout(() => setSaveMsg(null), 1500)
      onSaved?.()
    } catch (e: unknown) {
      setSaveMsg(`Error: ${String(e)}`)
    }
  }, [path, onDirtyChange, onSaved])

  // Cmd+S / Ctrl+S shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save])

  function handleEditorChange(value: string | undefined) {
    const v = value ?? ''
    valueRef.current = v
    if (!dirtyRef.current) {
      dirtyRef.current = true
      onDirtyChange(true)
    }
  }

  function handleEditorMount(editor: monaco.editor.IStandaloneCodeEditor) {
    editorRef.current = editor
    // Add Cmd+S keybinding inside Monaco too
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      save()
    })
  }

  if (error) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.toolbar}>
          <span className={styles.fileName}>{fileName}</span>
        </div>
        <div className={styles.error}>{error}</div>
      </div>
    )
  }

  if (content === null) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.toolbar}>
          <span className={styles.fileName}>{fileName}</span>
        </div>
        <div className={styles.loading}>Loading…</div>
      </div>
    )
  }

  return (
    <div className={styles.wrapper}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <span className={styles.fileIcon}>📄</span>
        <span className={styles.fileName}>{fileName}</span>
        <span className={styles.filePath}>{path}</span>
        {saveMsg && (
          <span
            className={`${styles.saveMsg} ${saveMsg.startsWith('Error') ? styles.saveMsgError : ''}`}
          >
            {saveMsg}
          </span>
        )}
      </div>

      {/* Monaco Editor */}
      <div className={styles.editorWrap}>
        <Editor
          height="100%"
          language={language}
          defaultValue={content}
          theme="vs-dark"
          onChange={handleEditorChange}
          onMount={handleEditorMount}
          options={{
            fontSize: 12,
            fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
            lineHeight: 19,
            tabSize: 2,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            renderLineHighlight: 'none',
            renderWhitespace: 'none',
            wordWrap: 'off',
            automaticLayout: true,
            scrollbar: {
              verticalScrollbarSize: 6,
              horizontalScrollbarSize: 6,
              useShadows: false,
            },
            padding: { top: 8, bottom: 8 },
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            overviewRulerBorder: false,
            glyphMargin: false,
            folding: false,
            lineNumbers: 'on',
            lineNumbersMinChars: 3,
            // ── Scroll performance ──────────────────────
            smoothScrolling: false,
            fastScrollSensitivity: 5,
            mouseWheelScrollSensitivity: 1,
            // ── Reduce per-frame decoration work ────────
            occurrencesHighlight: 'off',
            selectionHighlight: false,
            renderControlCharacters: false,
            // ── Disable features unused in view-only editing
            hover: { enabled: false },
            quickSuggestions: false,
            suggestOnTriggerCharacters: false,
            parameterHints: { enabled: false },
            codeLens: false,
          }}
        />
      </div>
    </div>
  )
}

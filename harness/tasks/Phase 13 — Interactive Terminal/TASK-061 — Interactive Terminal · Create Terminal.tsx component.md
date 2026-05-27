---
id: TASK-061
title: "Interactive Terminal · Create Terminal.tsx component"
type: task
status: open
effort: High
priority: high
phase: 13
area: frontend
---

## Goal

Create `src/components/Workspace/Terminal.tsx` — the core interactive terminal component. It mounts xterm.js in a div, creates a PTY session via Tauri, streams output from the Rust backend into xterm, and forwards user keystrokes back to the shell.

## Files to create

- `src/components/Workspace/Terminal.tsx`

---

## 1 — Imports

```typescript
import '@xterm/xterm/css/xterm.css'
import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { onTerminalOutput, onTerminalExit } from '@/lib/events'
import styles from './Terminal.module.css'
```

---

## 2 — Props

```typescript
interface TerminalProps {
  id: string        // unique terminal session ID (e.g. crypto.randomUUID())
  cwd?: string      // working directory for the shell
  height: number    // panel body height in px (panel height minus header)
}
```

---

## 3 — Component structure

```typescript
export default function Terminal({ id, cwd, height }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [exited, setExited] = useState(false)
  const [exitCode, setExitCode] = useState<number | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    // 1. Create xterm instance
    const term = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#111111',
        foreground: '#cccccc',
        cursor: '#ffffff',
        selectionBackground: 'rgba(255,255,255,0.2)',
        black: '#000000', red: '#cc3333', green: '#33cc33',
        yellow: '#cccc33', blue: '#3399cc', magenta: '#cc33cc',
        cyan: '#33cccc', white: '#cccccc',
        brightBlack: '#666666', brightRed: '#ff4444', brightGreen: '#44ff44',
        brightYellow: '#ffff44', brightBlue: '#44aaff', brightMagenta: '#ff44ff',
        brightCyan: '#44ffff', brightWhite: '#ffffff',
      },
      allowTransparency: false,
      scrollback: 5000,
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)
    term.open(containerRef.current)
    fitAddon.fit()

    xtermRef.current = term
    fitAddonRef.current = fitAddon

    // 2. Create PTY session
    const { cols, rows } = term
    invoke('create_terminal', { id, cwd: cwd ?? null, cols, rows }).catch((err: unknown) => {
      term.writeln(`\r\n\x1b[31mFailed to start terminal: ${err}\x1b[0m\r\n`)
    })

    // 3. Stream output from PTY
    const unlistens: Array<() => void> = []

    onTerminalOutput((outId, data) => {
      if (outId !== id) return
      term.write(atob(data))
    }).then((fn) => unlistens.push(fn))

    onTerminalExit((exitId, code) => {
      if (exitId !== id) return
      setExited(true)
      setExitCode(code)
      term.writeln(`\r\n\x1b[2m[Process exited with code ${code ?? '?'}]\x1b[0m`)
    }).then((fn) => unlistens.push(fn))

    // 4. Forward keystrokes to PTY
    term.onData((data) => {
      invoke('write_to_terminal', { id, data }).catch(() => {})
    })

    // 5. Observe container resize (panel drag)
    const observer = new ResizeObserver(() => {
      fitAddon.fit()
      const { cols: c, rows: r } = term
      invoke('resize_terminal', { id, cols: c, rows: r }).catch(() => {})
    })
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
      unlistens.forEach((fn) => fn())
      invoke('kill_terminal', { id }).catch(() => {})
      term.dispose()
    }
  }, [id, cwd]) // eslint-disable-line react-hooks/exhaustive-deps

  // Refit when height prop changes (panel resize via drag)
  useEffect(() => {
    if (!fitAddonRef.current || !xtermRef.current) return
    fitAddonRef.current.fit()
    const { cols, rows } = xtermRef.current
    invoke('resize_terminal', { id, cols, rows }).catch(() => {})
  }, [height, id])

  function handleRestart() {
    setExited(false)
    setExitCode(null)
    const term = xtermRef.current
    const fitAddon = fitAddonRef.current
    if (!term || !fitAddon) return
    term.clear()
    fitAddon.fit()
    const { cols, rows } = term
    invoke('create_terminal', { id, cwd: cwd ?? null, cols, rows }).catch((err: unknown) => {
      term.writeln(`\r\n\x1b[31mFailed to restart terminal: ${err}\x1b[0m\r\n`)
    })
  }

  return (
    <div className={styles.wrapper} style={{ height }}>
      <div ref={containerRef} className={styles.container} />
      {exited && (
        <div className={styles.exitOverlay}>
          <span className={styles.exitMsg}>
            Process exited {exitCode !== null ? `(code ${exitCode})` : ''}
          </span>
          <button className={styles.restartBtn} onClick={handleRestart}>
            Restart
          </button>
        </div>
      )}
    </div>
  )
}
```

---

## Acceptance criteria

- [ ] xterm.js mounts and renders inside the container div
- [ ] Shell starts in the provided `cwd` (or home if not provided)
- [ ] Typing characters in the terminal sends them to the shell
- [ ] Shell output appears in the terminal (including ANSI colors)
- [ ] Ctrl+C interrupts running processes
- [ ] Resizing the panel (drag handle) reflowsthe terminal correctly
- [ ] Unmounting the component kills the PTY session
- [ ] Exit overlay appears when the shell exits, with a working Restart button
- [ ] `tsc --noEmit` passes with no TypeScript errors

import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AlertCircle, Loader2, Copy, Download, CheckCheck } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { auditGenerateReport, auditExportReport } from '@/lib/audit'
import { AuditProgress } from './AuditProgress'
import styles from './ReportViewer.module.css'

function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function parseTOC(markdown: string): { id: string; label: string }[] {
  return markdown
    .split('\n')
    .filter((l) => l.startsWith('## '))
    .map((l) => {
      const label = l.replace(/^##\s+/, '')
      return { id: headingId(label), label }
    })
}

function CodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(children).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className={styles.codeBlock}>
      <button className={styles.copyCodeBtn} onClick={handleCopy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre>
        <code>{children}</code>
      </pre>
    </div>
  )
}

export function ReportViewer() {
  const { state, dispatch } = useApp()
  const {
    activeProject,
    activeAuditSession,
    auditReport,
    auditReportGenerating,
    auditReportError,
  } = state
  // activeProject and activeAuditSession used in handlers below
  const [showLog, setShowLog] = useState(false)
  const [copied, setCopied] = useState(false)
  const [activeSection, setActiveSection] = useState('')
  const contentRef = useRef<HTMLDivElement>(null)

  // Scroll-spy via IntersectionObserver
  useEffect(() => {
    if (!contentRef.current || !auditReport) return
    const headings = contentRef.current.querySelectorAll('h2[id]')
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
        if (visible.length > 0) setActiveSection(visible[0].target.id)
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
    )
    headings.forEach((h) => obs.observe(h))
    return () => obs.disconnect()
  }, [auditReport])

  async function handleGenerateReport() {
    if (!activeProject || !activeAuditSession) return
    if (auditReport && !window.confirm('A report already exists for this session. Regenerate it?'))
      return
    dispatch({ type: 'AUDIT_REPORT_STARTED' })
    try {
      await auditGenerateReport(activeProject.path, activeAuditSession.id)
    } catch (err) {
      dispatch({ type: 'AUDIT_REPORT_FAILED', payload: String(err) })
    }
  }

  async function handleCopyReport() {
    if (!auditReport) return
    await navigator.clipboard.writeText(auditReport).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleExportMd() {
    if (!activeProject || !activeAuditSession) return
    try {
      await auditExportReport(
        activeProject.path,
        activeAuditSession.id,
        activeAuditSession.siteName
      )
    } catch (err) {
      if (String(err) !== 'cancelled') console.error(err) // eslint-disable-line no-console
    }
  }

  async function handleExportPdf() {
    if (!contentRef.current || !auditReport) return

    const siteName = activeAuditSession?.siteName || 'audit'
    const defaultName = `${siteName.toLowerCase().replace(/\s+/g, '-')}-audit-report.pdf`

    // Build a light-mode off-screen clone of the report content
    const clone = document.createElement('div')
    clone.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'width:794px',
      'padding:48px 56px',
      'background:#fff',
      'color:#111',
      'font-family:-apple-system,BlinkMacSystemFont,sans-serif',
      'font-size:13px',
      'line-height:1.65',
      'z-index:-9999',
      'pointer-events:none',
    ].join(';')
    clone.innerHTML = contentRef.current.innerHTML

    // Force light colours on all child elements
    const resetStyle = document.createElement('style')
    resetStyle.textContent = `
      #__pdf_clone__ * { color: #111 !important; background: transparent !important;
        border-color: #ccc !important; box-shadow: none !important; }
      #__pdf_clone__ h1 { font-size:22px; border-bottom:2px solid #ddd; padding-bottom:8px; }
      #__pdf_clone__ h2 { font-size:17px; margin-top:28px; }
      #__pdf_clone__ h3 { font-size:14px; margin-top:18px; }
      #__pdf_clone__ table { border-collapse:collapse; width:100%; }
      #__pdf_clone__ th, #__pdf_clone__ td { border:1px solid #ccc !important; padding:6px 10px; }
      #__pdf_clone__ th { background:#f4f4f4 !important; font-weight:600; }
      #__pdf_clone__ pre { background:#f5f5f5 !important; padding:10px; border-radius:4px; }
      #__pdf_clone__ code { background:#f0f0f0 !important; padding:1px 4px; border-radius:3px; }
    `
    clone.id = '__pdf_clone__'
    document.head.appendChild(resetStyle)
    document.body.appendChild(clone)

    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])

      const canvas = await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        windowWidth: 794,
      })

      const imgData = canvas.toDataURL('image/jpeg', 0.92)
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const imgW = pageW
      const imgH = (canvas.height * imgW) / canvas.width

      let y = 0
      let remaining = imgH
      while (remaining > 0) {
        pdf.addImage(imgData, 'JPEG', 0, -y, imgW, imgH)
        remaining -= pageH
        y += pageH
        if (remaining > 0) pdf.addPage()
      }

      const pdfBytes = Array.from(new Uint8Array(pdf.output('arraybuffer') as ArrayBuffer))
      await invoke('save_binary_file', { defaultName, data: pdfBytes })
    } catch (err) {
      if (String(err) !== 'cancelled') console.error('PDF export failed:', err) // eslint-disable-line no-console
    } finally {
      clone.remove()
      resetStyle.remove()
    }
  }

  const { auditDimensions } = state
  const canGenerate =
    activeAuditSession?.phase === 'done' || auditDimensions.some((d) => d.status === 'done')
  const toc = parseTOC(auditReport ?? '')

  if (auditReportGenerating) {
    return (
      <div className={styles.generatingState}>
        <Loader2 className={styles.spinner} size={36} />
        <p className={styles.generatingTitle}>Generating your site audit report…</p>
        <p className={styles.generatingSubtitle}>
          Claude is analysing all dimension results and writing a full report.
          <br />
          This usually takes 30–60 seconds.
        </p>
        <p className={styles.generatingHint}>
          Progress is streaming in the <strong>OUTPUT</strong> panel below ↓
        </p>
      </div>
    )
  }

  if (!auditReport) {
    return (
      <div className={styles.emptyState}>
        {auditReportError && (
          <div className={styles.errorBanner}>
            <AlertCircle size={16} />
            <span>Report generation failed. {auditReportError}</span>
            <button onClick={handleGenerateReport}>Retry</button>
          </div>
        )}
        <button
          className={styles.generateBtn}
          onClick={handleGenerateReport}
          disabled={!canGenerate}
          title={!canGenerate ? 'Complete the audit first before generating a report.' : undefined}
        >
          Generate Report
        </button>
        <button
          className={styles.rerunBtn}
          onClick={() => dispatch({ type: 'AUDIT_PHASE_SET', payload: 'done' })}
        >
          ↺ Re-run Audit
        </button>
      </div>
    )
  }

  if (showLog) {
    return (
      <div className={styles.shell}>
        <div className={styles.toolbar}>
          <button className={styles.toolBtn} onClick={() => setShowLog(false)}>
            View Report →
          </button>
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <AuditProgress />
        </div>
      </div>
    )
  }

  return (
    <div className={styles.shell}>
      {auditReportError && (
        <div className={styles.errorBanner}>
          <AlertCircle size={14} />
          <span>{auditReportError}</span>
          <button onClick={handleGenerateReport}>Retry</button>
        </div>
      )}
      <div className={styles.toolbar}>
        <button className={styles.toolBtn} onClick={handleCopyReport}>
          {copied ? <CheckCheck size={13} /> : <Copy size={13} />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <button className={styles.toolBtn} onClick={handleExportMd}>
          <Download size={13} /> Export .md
        </button>
        <button className={styles.toolBtn} onClick={handleExportPdf}>
          <Download size={13} /> Export PDF
        </button>
        <button className={styles.toolBtn} onClick={() => setShowLog(true)}>
          ← Audit Log
        </button>
        <button
          className={styles.toolBtn}
          onClick={() => dispatch({ type: 'AUDIT_PHASE_SET', payload: 'done' })}
        >
          ↺ Re-run Audit
        </button>
      </div>
      <div className={styles.body}>
        <nav className={styles.tocSidebar}>
          {toc.map(({ id, label }) => (
            <a
              key={id}
              href={`#${id}`}
              className={activeSection === id ? styles.tocActive : styles.tocItem}
            >
              {label}
            </a>
          ))}
        </nav>
        <div className={styles.content} ref={contentRef}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h2: ({ children }) => {
                const text = String(children)
                const id = headingId(text)
                return <h2 id={id}>{children}</h2>
              },
              code: ({ inline, children }: { inline?: boolean; children?: React.ReactNode }) =>
                inline ? <code>{children}</code> : <CodeBlock>{String(children)}</CodeBlock>,
            }}
          >
            {auditReport}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  )
}

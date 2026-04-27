import { useRef, useState, useCallback } from 'react'
import type { DiffFile, DiffLine } from '@/types'
import styles from './DiffCodeView.module.css'

interface Props {
  file: DiffFile
  viewMode: 'unified' | 'split'
}

interface SplitRow {
  left: DiffLine | null
  right: DiffLine | null
}

function buildSplitRows(lines: DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.type === 'neutral') {
      rows.push({ left: line, right: line })
      i++
    } else if (line.type === 'rem') {
      const rems: DiffLine[] = []
      while (i < lines.length && lines[i].type === 'rem') rems.push(lines[i++])
      const adds: DiffLine[] = []
      while (i < lines.length && lines[i].type === 'add') adds.push(lines[i++])
      const len = Math.max(rems.length, adds.length)
      for (let j = 0; j < len; j++) {
        rows.push({ left: rems[j] ?? null, right: adds[j] ?? null })
      }
    } else {
      rows.push({ left: null, right: line })
      i++
    }
  }
  return rows
}

const ROW_HEIGHT = 24
const OVERSCAN = 15
const VIRT_THRESHOLD = 500

interface VirtualTableProps {
  rowCount: number
  renderRow: (index: number) => React.ReactNode
  tableClass?: string
}

function VirtualTable({ rowCount, renderRow, tableClass }: VirtualTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)

  const handleScroll = useCallback(() => {
    setScrollTop(scrollRef.current?.scrollTop ?? 0)
  }, [])

  const containerHeight = scrollRef.current?.clientHeight ?? 500
  const firstVisible = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const lastVisible = Math.min(
    rowCount - 1,
    Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN
  )
  const totalHeight = rowCount * ROW_HEIGHT

  const rows: React.ReactNode[] = []
  for (let i = firstVisible; i <= lastVisible; i++) {
    rows.push(renderRow(i))
  }

  return (
    <div ref={scrollRef} className={styles.scroll} onScroll={handleScroll}>
      <table className={tableClass ?? styles.table}>
        <tbody>
          <tr style={{ height: firstVisible * ROW_HEIGHT, padding: 0 }} />
          {rows}
          <tr
            style={{ height: Math.max(0, (rowCount - 1 - lastVisible) * ROW_HEIGHT), padding: 0 }}
          />
        </tbody>
      </table>
      {/* phantom div to establish full scroll height */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          width: 1,
          height: totalHeight,
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}

function UnifiedView({ lines }: { lines: DiffLine[] }) {
  if (lines.length <= VIRT_THRESHOLD) {
    return (
      <div className={styles.scroll}>
        <table className={styles.table}>
          <tbody>
            {lines.map((line, i) => (
              <tr
                key={i}
                className={`${styles.row} ${styles[line.type]}`}
                style={{ height: ROW_HEIGHT }}
              >
                <td className={styles.lineNum}>{line.lineNumber || ''}</td>
                <td className={styles.gutter}>
                  {line.type === 'add' ? '+' : line.type === 'rem' ? '-' : ' '}
                </td>
                <td className={styles.code}>{line.content}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <VirtualTable
      rowCount={lines.length}
      renderRow={(i) => {
        const line = lines[i]
        return (
          <tr
            key={i}
            className={`${styles.row} ${styles[line.type]}`}
            style={{ height: ROW_HEIGHT }}
          >
            <td className={styles.lineNum}>{line.lineNumber || ''}</td>
            <td className={styles.gutter}>
              {line.type === 'add' ? '+' : line.type === 'rem' ? '-' : ' '}
            </td>
            <td className={styles.code}>{line.content}</td>
          </tr>
        )
      }}
    />
  )
}

function SplitView({ lines }: { lines: DiffLine[] }) {
  const rows = buildSplitRows(lines)

  if (rows.length <= VIRT_THRESHOLD) {
    return (
      <div className={styles.scroll}>
        <table className={`${styles.table} ${styles.splitTable}`}>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className={styles.row} style={{ height: ROW_HEIGHT }}>
                <td className={`${styles.lineNum} ${row.left ? styles[row.left.type] : ''}`}>
                  {row.left?.lineNumber || ''}
                </td>
                <td className={`${styles.code} ${row.left ? styles[row.left.type] : styles.empty}`}>
                  {row.left?.content ?? ''}
                </td>
                <td className={styles.splitDivider} />
                <td className={`${styles.lineNum} ${row.right ? styles[row.right.type] : ''}`}>
                  {row.right?.lineNumber || ''}
                </td>
                <td
                  className={`${styles.code} ${row.right ? styles[row.right.type] : styles.empty}`}
                >
                  {row.right?.content ?? ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <VirtualTable
      rowCount={rows.length}
      tableClass={`${styles.table} ${styles.splitTable}`}
      renderRow={(i) => {
        const row = rows[i]
        return (
          <tr key={i} className={styles.row} style={{ height: ROW_HEIGHT }}>
            <td className={`${styles.lineNum} ${row.left ? styles[row.left.type] : ''}`}>
              {row.left?.lineNumber || ''}
            </td>
            <td className={`${styles.code} ${row.left ? styles[row.left.type] : styles.empty}`}>
              {row.left?.content ?? ''}
            </td>
            <td className={styles.splitDivider} />
            <td className={`${styles.lineNum} ${row.right ? styles[row.right.type] : ''}`}>
              {row.right?.lineNumber || ''}
            </td>
            <td className={`${styles.code} ${row.right ? styles[row.right.type] : styles.empty}`}>
              {row.right?.content ?? ''}
            </td>
          </tr>
        )
      }}
    />
  )
}

function DiffCodeView({ file, viewMode }: Props) {
  if (file.lines.length === 0) {
    return <div className={styles.empty}>No changes in this file.</div>
  }

  return (
    <div className={styles.codeView}>
      <div className={styles.fileHeader}>
        <span className={styles.filePath}>{file.name}</span>
        {file.lines.length > VIRT_THRESHOLD && (
          <span className={styles.virtBadge}>virtualized</span>
        )}
      </div>
      {viewMode === 'unified' ? (
        <UnifiedView lines={file.lines} />
      ) : (
        <SplitView lines={file.lines} />
      )}
    </div>
  )
}

export default DiffCodeView

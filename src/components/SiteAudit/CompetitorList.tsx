import { Plus, X } from 'lucide-react'
import styles from './IntakeForm.module.css'

interface Props {
  values: string[]
  errors: (string | undefined)[]
  onChange: (values: string[]) => void
}

export function CompetitorList({ values, errors, onChange }: Props) {
  function update(i: number, val: string) {
    const next = [...values]
    next[i] = val
    onChange(next)
  }

  function remove(i: number) {
    onChange(values.filter((_, idx) => idx !== i))
  }

  function add() {
    if (values.length < 5) onChange([...values, ''])
  }

  return (
    <div className={styles.competitorList}>
      {values.map((val, i) => (
        <div key={i} className={styles.competitorRow}>
          <div className={styles.competitorInputWrap}>
            <input
              className={`${styles.input} ${errors[i] ? styles.inputError : ''}`}
              type="url"
              placeholder="https://competitor.com"
              value={val}
              onChange={(e) => update(i, e.target.value)}
            />
            {errors[i] && <span className={styles.errorMsg}>{errors[i]}</span>}
          </div>
          <button
            type="button"
            className={styles.removeBtn}
            onClick={() => remove(i)}
            title="Remove"
          >
            <X size={13} strokeWidth={2.5} />
          </button>
        </div>
      ))}
      <button type="button" className={styles.addBtn} onClick={add} disabled={values.length >= 5}>
        <Plus size={13} strokeWidth={2.5} />
        Add competitor
      </button>
    </div>
  )
}

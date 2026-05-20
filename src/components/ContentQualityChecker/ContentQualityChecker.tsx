import { useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { ShieldCheck, Users, ScrollText, ChevronLeft, CheckSquare } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import CheckPanel from './CheckPanel'
import ResultPanel from './ResultPanel'
import ClientsPanel from './ClientsPanel'
import CqcLogPanel from './CqcLogPanel'
import styles from './ContentQualityChecker.module.css'

function ContentQualityChecker() {
  const { state, dispatch } = useApp()
  const { activeProject, globalCqcPath, cqcSubView, cqcClients } = state
  const cqcPath = activeProject?.path ?? globalCqcPath

  useEffect(() => {
    if (!cqcPath) return
    invoke('cqc_list_clients', { projectPath: cqcPath }).catch(() => {})
    invoke('cqc_list_log', { projectPath: cqcPath, limit: 100 }).catch(() => {})
  }, [cqcPath]) // eslint-disable-line react-hooks/exhaustive-deps

  function setView(view: typeof cqcSubView) {
    dispatch({ type: 'SET_CQC_SUB_VIEW', view })
  }

  const isCheckResult = cqcSubView === 'check-result'

  return (
    <div className={styles.root}>
      <div className={styles.topNav}>
        <span className={styles.navTitle}>
          <ShieldCheck size={15} strokeWidth={2} />
          Content Quality
        </span>

        {isCheckResult && (
          <button className={styles.backBtn} onClick={() => setView('check')}>
            <ChevronLeft size={14} strokeWidth={2} />
            Back
          </button>
        )}

        {!isCheckResult && (
          <>
            <button
              className={`${styles.tabBtn} ${cqcSubView === 'check' ? styles.tabBtnActive : ''}`}
              onClick={() => setView('check')}
            >
              <CheckSquare size={13} strokeWidth={2} />
              Check
            </button>
            <button
              className={`${styles.tabBtn} ${cqcSubView === 'clients' ? styles.tabBtnActive : ''}`}
              onClick={() => setView('clients')}
            >
              <Users size={13} strokeWidth={2} />
              Clients
              {cqcClients.length > 0 && (
                <span style={{ fontSize: 10, opacity: 0.7 }}>({cqcClients.length})</span>
              )}
            </button>
            <button
              className={`${styles.tabBtn} ${cqcSubView === 'log' ? styles.tabBtnActive : ''}`}
              onClick={() => setView('log')}
            >
              <ScrollText size={13} strokeWidth={2} />
              Log
            </button>
          </>
        )}
      </div>

      <div className={styles.content}>
        {cqcSubView === 'check' && <CheckPanel />}
        {cqcSubView === 'check-result' && <ResultPanel />}
        {cqcSubView === 'clients' && <ClientsPanel />}
        {cqcSubView === 'log' && <CqcLogPanel />}
      </div>
    </div>
  )
}

export default ContentQualityChecker

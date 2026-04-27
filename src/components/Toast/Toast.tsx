import { useEffect } from 'react'
import { useApp } from '@/context/AppContext'
import styles from './Toast.module.css'

function Toast() {
  const { state, dispatch } = useApp()
  const { toastMessage } = state

  useEffect(() => {
    if (!toastMessage) return
    const id = setTimeout(() => dispatch({ type: 'HIDE_TOAST' }), 4000)
    return () => clearTimeout(id)
  }, [toastMessage, dispatch])

  if (!toastMessage) return null

  return (
    <div className={styles.toast} role="status" aria-live="polite">
      <span className={styles.icon}>✓</span>
      {toastMessage}
    </div>
  )
}

export default Toast

import { useRef, useState, useCallback, useEffect } from 'react'
import { useApp } from '@/context/AppContext'
import styles from './TaskTabs.module.css'

function TaskTabs() {
  const { state, dispatch } = useApp()
  const tabsRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const openModal = () => {
    if (state.activeProject) dispatch({ type: 'OPEN_TASK_MODAL' })
  }

  const updateScrollState = useCallback(() => {
    const el = tabsRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 0)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1)
  }, [])

  useEffect(() => {
    const el = tabsRef.current
    if (!el) return
    updateScrollState()
    el.addEventListener('scroll', updateScrollState)
    const ro = new ResizeObserver(updateScrollState)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', updateScrollState)
      ro.disconnect()
    }
  }, [updateScrollState, state.activeTasks.length])

  function scrollLeft() {
    tabsRef.current?.scrollBy({ left: -120, behavior: 'smooth' })
  }

  function scrollRight() {
    tabsRef.current?.scrollBy({ left: 120, behavior: 'smooth' })
  }

  return (
    <div className={styles.tabsWrapper}>
      {canScrollLeft && (
        <button className={styles.scrollArrow} onClick={scrollLeft} aria-label="Scroll tabs left">
          ‹
        </button>
      )}
      <div className={styles.tabs} ref={tabsRef}>
        {state.activeTasks.map((task, i) => (
          <div
            key={task.id}
            className={[
              styles.tab,
              i === state.activeTaskIndex ? styles.tabActive : '',
              task.status === 'completed' ? styles.tabCompleted : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => dispatch({ type: 'SET_ACTIVE_TASK', index: i })}
            role="tab"
            aria-selected={i === state.activeTaskIndex}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ')
                dispatch({ type: 'SET_ACTIVE_TASK', index: i })
            }}
          >
            {task.status === 'completed' && (
              <span className={styles.completedIcon} aria-label="Completed">
                ✓
              </span>
            )}
            <span className={styles.tabLabel}>{task.id || task.title}</span>
            <button
              className={styles.closeTab}
              onClick={(e) => {
                e.stopPropagation()
                dispatch({ type: 'REMOVE_TASK', taskId: task.id })
              }}
              title="Close task"
              aria-label={`Close ${task.id || task.title}`}
            >
              ×
            </button>
          </div>
        ))}
        <button className={styles.addBtn} onClick={openModal} title="Add task (Cmd+T)">
          + Task
        </button>
      </div>
      {canScrollRight && (
        <button className={styles.scrollArrow} onClick={scrollRight} aria-label="Scroll tabs right">
          ›
        </button>
      )}
    </div>
  )
}

export default TaskTabs

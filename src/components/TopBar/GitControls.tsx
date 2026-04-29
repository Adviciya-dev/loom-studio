import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useApp } from '@/context/AppContext'
import { engineCommand } from '@/lib/ipc'
import { onGitPullDiverged, onGitPullConflicts, onGitMergeAborted } from '@/lib/events'
import styles from './GitControls.module.css'

function GitControls() {
  const { state } = useApp()
  const { activeProject, gitBranch, gitBranches, gitRemoteUrl, gitAhead, gitBehind, gitSshError } =
    state
  const [open, setOpen] = useState(false)
  const [commitMsg, setCommitMsg] = useState('')
  const [committing, setCommitting] = useState(false)
  const [newBranch, setNewBranch] = useState('')
  const [creatingBranch, setCreatingBranch] = useState(false)
  const [showNewBranch, setShowNewBranch] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [showPullPicker, setShowPullPicker] = useState(false)
  const [pullBranch, setPullBranch] = useState('')
  const [pullDiverged, setPullDiverged] = useState(false)
  const [hasConflicts, setHasConflicts] = useState(false)
  const [conflictFiles, setConflictFiles] = useState<string[]>([])
  const [abortingMerge, setAbortingMerge] = useState(false)
  const [passphrase, setPassphrase] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Load git status + remote info when project changes.
  useEffect(() => {
    if (!activeProject) return
    engineCommand({ action: 'git_status', project_path: activeProject.path }).catch(() => {})
  }, [activeProject?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh remote info whenever the branch changes.
  useEffect(() => {
    if (!activeProject || !gitBranch) return
    engineCommand({
      action: 'git_remote_info',
      project_path: activeProject.path,
      branch: gitBranch,
    }).catch(() => {})
  }, [gitBranch, activeProject?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdown on outside click.
  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setShowNewBranch(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  // Auto-open dropdown when SSH auth fails so the passphrase field is visible.
  useEffect(() => {
    if (gitSshError) setOpen(true)
  }, [gitSshError])

  // Listen for diverged branch event — open dropdown and show strategy picker.
  useEffect(() => {
    let cleanup: (() => void) | null = null
    onGitPullDiverged((branch) => {
      setPullBranch(branch)
      setPullDiverged(true)
      setPulling(false)
      setOpen(true)
    }).then((fn) => {
      cleanup = fn
    })
    return () => {
      cleanup?.()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for merge conflict and abort events.
  useEffect(() => {
    let c1: (() => void) | null = null
    let c2: (() => void) | null = null
    onGitPullConflicts((files) => {
      setConflictFiles(files)
      setHasConflicts(true)
      setPulling(false)
      setOpen(true)
    }).then((fn) => {
      c1 = fn
    })
    onGitMergeAborted(() => {
      setHasConflicts(false)
      setConflictFiles([])
      setAbortingMerge(false)
    }).then((fn) => {
      c2 = fn
    })
    return () => {
      c1?.()
      c2?.()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!activeProject) return null

  const remoteLabel = gitRemoteUrl
    ? gitRemoteUrl
        .replace(/^https?:\/\//, '')
        .replace(/\.git$/, '')
        .replace(/^git@([^:]+):/, '$1/')
    : null

  const remoteOpsDisabled = fetching || pulling || pushing

  async function handleUnlockSsh() {
    if (!passphrase || unlocking) return
    setUnlocking(true)
    await engineCommand({ action: 'git_ssh_unlock', passphrase }).catch(() => {})
    setUnlocking(false)
    setPassphrase('')
  }

  async function handleFetch() {
    if (!activeProject || remoteOpsDisabled) return
    setFetching(true)
    await engineCommand({
      action: 'git_fetch',
      project_path: activeProject.path,
      branch: gitBranch ?? '',
    }).catch(() => {})
    setFetching(false)
  }

  function handlePull() {
    if (!activeProject || remoteOpsDisabled || !gitBranch) return
    setPullBranch(gitBranch)
    setShowPullPicker(true)
  }

  async function confirmPull(strategy?: 'merge' | 'rebase' | 'ff-only') {
    if (!activeProject || !pullBranch) return
    setShowPullPicker(false)
    setPullDiverged(false)
    setHasConflicts(false)
    setConflictFiles([])
    setPulling(true)
    await engineCommand({
      action: 'git_pull',
      project_path: activeProject.path,
      branch: pullBranch,
      ...(strategy ? { strategy } : {}),
    }).catch(() => {})
    setPulling(false)
  }

  async function handleMergeAbort() {
    if (!activeProject || abortingMerge) return
    setAbortingMerge(true)
    await engineCommand({ action: 'git_merge_abort', project_path: activeProject.path }).catch(
      () => {
        setAbortingMerge(false)
      }
    )
  }

  async function handlePush() {
    if (!activeProject || remoteOpsDisabled || !gitBranch) return
    setPushing(true)
    await engineCommand({
      action: 'git_push',
      project_path: activeProject.path,
      branch: gitBranch,
    }).catch(() => {})
    setPushing(false)
  }

  async function handleCheckout(branch: string) {
    if (!activeProject || branch === gitBranch) return
    await engineCommand({
      action: 'git_checkout',
      branch,
      project_path: activeProject.path,
    }).catch(() => {})
  }

  async function handleCreateBranch() {
    if (!activeProject || !newBranch.trim() || creatingBranch) return
    setCreatingBranch(true)
    await engineCommand({
      action: 'git_create_branch',
      branch: newBranch.trim(),
      project_path: activeProject.path,
    }).catch(() => {})
    setCreatingBranch(false)
    setNewBranch('')
    setShowNewBranch(false)
    setOpen(false)
  }

  async function handleCommit() {
    if (!activeProject || !commitMsg.trim() || committing) return
    setCommitting(true)
    await engineCommand({
      action: 'git_commit',
      message: commitMsg.trim(),
      project_path: activeProject.path,
    }).catch(() => {})
    setCommitting(false)
    setCommitMsg('')
    setOpen(false)
  }

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <button className={styles.trigger} onClick={() => setOpen((o) => !o)} title="Git">
        <span className={styles.branchIcon}>⎇</span>
        <span className={styles.branchName}>{gitBranch ?? '…'}</span>
        {gitAhead > 0 && <span className={styles.ahead}>↑{gitAhead}</span>}
        {gitBehind > 0 && <span className={styles.behind}>↓{gitBehind}</span>}
      </button>

      {open && (
        <div className={styles.dropdown}>
          {/* Remote section */}
          <div className={styles.remoteSection}>
            {remoteLabel ? (
              <>
                <div className={styles.remoteUrl} title={gitRemoteUrl ?? ''}>
                  {remoteLabel}
                </div>
                <div className={styles.remoteActions}>
                  <button
                    className={`${styles.remoteBtn} ${fetching ? styles.active : ''}`}
                    onClick={handleFetch}
                    disabled={remoteOpsDisabled}
                    title="Fetch from origin"
                  >
                    Fetch
                  </button>
                  <button
                    className={`${styles.remoteBtn} ${pulling ? styles.active : ''}`}
                    onClick={handlePull}
                    disabled={remoteOpsDisabled || !gitBranch}
                    title="Pull from origin"
                  >
                    Pull
                  </button>
                  <button
                    className={`${styles.remoteBtn} ${pushing ? styles.active : ''}`}
                    onClick={handlePush}
                    disabled={remoteOpsDisabled || !gitBranch}
                    title="Push to origin"
                  >
                    Push
                  </button>
                </div>
                {showPullPicker && !remoteOpsDisabled && (
                  <div className={styles.pullPicker}>
                    <span className={styles.pullPickerLabel}>Pull from branch:</span>
                    <select
                      className={styles.pullSelect}
                      value={pullBranch}
                      onChange={(e) => setPullBranch(e.target.value)}
                      autoFocus
                    >
                      {gitBranches.map((b) => (
                        <option key={b} value={b}>
                          {b}
                          {b === gitBranch ? ' (current)' : ''}
                        </option>
                      ))}
                    </select>
                    <div className={styles.rowActions}>
                      <button className={styles.cancelBtn} onClick={() => setShowPullPicker(false)}>
                        Cancel
                      </button>
                      <button
                        className={styles.primaryBtn}
                        onClick={() => confirmPull()}
                        disabled={!pullBranch}
                      >
                        Pull
                      </button>
                    </div>
                  </div>
                )}
                {pullDiverged && !remoteOpsDisabled && (
                  <div className={styles.divergedPicker}>
                    <div className={styles.divergedTitle}>⚠ Branches have diverged</div>
                    <p className={styles.divergedHint}>
                      Your local branch and <strong>origin/{pullBranch}</strong> have unrelated
                      commits. Choose how to reconcile them:
                    </p>
                    <div className={styles.strategyList}>
                      <button className={styles.strategyBtn} onClick={() => confirmPull('merge')}>
                        <span className={styles.strategyLabel}>Merge</span>
                        <span className={styles.strategyDesc}>
                          Create a merge commit combining both histories
                        </span>
                      </button>
                      <button className={styles.strategyBtn} onClick={() => confirmPull('rebase')}>
                        <span className={styles.strategyLabel}>Rebase</span>
                        <span className={styles.strategyDesc}>
                          Replay your commits on top of the remote branch
                        </span>
                      </button>
                      <button className={styles.strategyBtn} onClick={() => confirmPull('ff-only')}>
                        <span className={styles.strategyLabel}>Fast-forward only</span>
                        <span className={styles.strategyDesc}>
                          Fail if a merge commit would be needed
                        </span>
                      </button>
                    </div>
                    <button className={styles.cancelBtn} onClick={() => setPullDiverged(false)}>
                      Cancel
                    </button>
                  </div>
                )}
                {hasConflicts && !remoteOpsDisabled && (
                  <div className={styles.conflictPanel}>
                    <div className={styles.conflictTitle}>⚠ Merge conflicts</div>
                    <p className={styles.conflictHint}>
                      Resolve conflicts in your editor, then commit. Or abort to undo the merge.
                    </p>
                    <div className={styles.conflictFiles}>
                      {conflictFiles.map((f) => (
                        <div key={f} className={styles.conflictFile}>
                          <span className={styles.conflictFileDot}>●</span>
                          <span className={styles.conflictFilePath}>{f}</span>
                        </div>
                      ))}
                    </div>
                    <div className={styles.conflictActions}>
                      <button
                        className={styles.openEditorBtn}
                        onClick={() =>
                          invoke('open_in_editor', { path: activeProject.path }).catch(() => {})
                        }
                        title="Open project in VS Code or system editor"
                      >
                        ✎ Open in Editor
                      </button>
                      <button
                        className={styles.abortBtn}
                        onClick={handleMergeAbort}
                        disabled={abortingMerge}
                      >
                        {abortingMerge ? 'Aborting…' : '↩ Abort merge'}
                      </button>
                    </div>
                  </div>
                )}
                {remoteOpsDisabled && (
                  <div className={styles.remoteStatus}>
                    <span className={styles.spinner} />
                    <span>
                      {fetching && 'Fetching from origin…'}
                      {pulling && `Pulling from origin/${pullBranch || gitBranch}…`}
                      {pushing && `Pushing to origin/${gitBranch}…`}
                    </span>
                  </div>
                )}
                {gitSshError && (
                  <div className={styles.sshSection}>
                    <div className={styles.sshLabel}>🔐 SSH key passphrase required</div>
                    <input
                      className={styles.input}
                      type="password"
                      placeholder="Enter SSH passphrase…"
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleUnlockSsh()}
                      autoFocus
                    />
                    <button
                      className={styles.primaryBtn}
                      onClick={handleUnlockSsh}
                      disabled={!passphrase || unlocking}
                    >
                      {unlocking ? 'Unlocking…' : 'Unlock SSH Key'}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className={styles.noRemote}>No remote configured</div>
            )}
          </div>

          <div className={styles.divider} />

          {/* Branch list */}
          <div className={styles.branchList}>
            {gitBranches.map((b) => (
              <button
                key={b}
                className={`${styles.branchItem} ${b === gitBranch ? styles.activeBranch : ''}`}
                onClick={() => handleCheckout(b)}
              >
                <span className={styles.check}>{b === gitBranch ? '✓' : ''}</span>
                <span>{b}</span>
              </button>
            ))}
          </div>

          {/* New branch */}
          <div className={styles.divider} />
          {showNewBranch ? (
            <div className={styles.newBranchSection}>
              <input
                className={styles.input}
                type="text"
                placeholder="branch-name"
                value={newBranch}
                onChange={(e) => setNewBranch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateBranch()
                  if (e.key === 'Escape') {
                    setShowNewBranch(false)
                    setNewBranch('')
                  }
                }}
                autoFocus
              />
              <div className={styles.rowActions}>
                <button
                  className={styles.cancelBtn}
                  onClick={() => {
                    setShowNewBranch(false)
                    setNewBranch('')
                  }}
                >
                  Cancel
                </button>
                <button
                  className={styles.primaryBtn}
                  onClick={handleCreateBranch}
                  disabled={!newBranch.trim() || creatingBranch}
                >
                  {creatingBranch ? 'Creating…' : 'Create'}
                </button>
              </div>
            </div>
          ) : (
            <button className={styles.newBranchBtn} onClick={() => setShowNewBranch(true)}>
              <span>+</span>
              <span>New branch</span>
            </button>
          )}

          {/* Commit */}
          <div className={styles.divider} />
          <div className={styles.commitSection}>
            <input
              className={styles.input}
              type="text"
              placeholder="Commit message…"
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCommit()}
            />
            <button
              className={styles.primaryBtn}
              onClick={handleCommit}
              disabled={!commitMsg.trim() || committing}
            >
              {committing ? 'Committing…' : 'Commit'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default GitControls

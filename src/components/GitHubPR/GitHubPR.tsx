import { useEffect, useRef, useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useApp } from '@/context/AppContext'
import { engineCommand } from '@/lib/ipc'
import { onGhPrCreated, onHarnessLogLine, onHarnessDone } from '@/lib/events'
import styles from './GitHubPR.module.css'

function GitHubPR() {
  const { state, dispatch } = useApp()
  const {
    activeProject,
    gitBranch,
    gitAhead,
    ghAvailable,
    ghDefaultBranch,
    gitCommitsOnBranch,
    gitBranchPushed,
    ghOpenPrs,
  } = state

  const [base, setBase] = useState(ghDefaultBranch)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [draft, setDraft] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createdUrl, setCreatedUrl] = useState<string | null>(null)
  const [pushing, setPushing] = useState(false)
  const [generating, setGenerating] = useState(false)

  const streamRef = useRef('')
  const flushRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync base when default branch loads (skip if not yet resolved)
  useEffect(() => {
    if (ghDefaultBranch) setBase(ghDefaultBranch)
  }, [ghDefaultBranch])

  // Auto-fill title from first commit
  useEffect(() => {
    if (gitCommitsOnBranch.length > 0 && !title) {
      // Strip the short hash prefix (e.g. "abc1234 feat(auth): ..." → "feat(auth): ...")
      const msg = gitCommitsOnBranch[0].replace(/^[a-f0-9]+\s+/, '')
      setTitle(msg)
    }
  }, [gitCommitsOnBranch]) // eslint-disable-line react-hooks/exhaustive-deps

  // Register event listeners (only for pr_created and AI generation)
  useEffect(() => {
    let cancelled = false
    let cleanupFns: Array<() => void> = []

    Promise.all([
      onGhPrCreated((url) => {
        setCreatedUrl(url)
        setCreating(false)
      }),
      onHarnessLogLine((line) => {
        streamRef.current = streamRef.current
          ? streamRef.current + '\n' + line.content
          : line.content
        if (!flushRef.current) {
          flushRef.current = setTimeout(() => {
            setBody(streamRef.current)
            flushRef.current = null
          }, 30)
        }
      }),
      onHarnessDone(() => {
        if (flushRef.current) {
          clearTimeout(flushRef.current)
          flushRef.current = null
        }
        setBody(streamRef.current)
        streamRef.current = ''
        setGenerating(false)
      }),
    ]).then((fns) => {
      if (cancelled) {
        fns.forEach((fn) => fn())
        return
      }
      cleanupFns = fns
    })

    return () => {
      cancelled = true
      cleanupFns.forEach((fn) => fn())
      if (flushRef.current) clearTimeout(flushRef.current)
    }
  }, [dispatch])

  // Load branch-specific data via Rust
  useEffect(() => {
    if (!activeProject || !gitBranch || !base) return
    invoke<string[]>('git_log_branch', { projectPath: activeProject.path, base })
      .then((commits) => dispatch({ type: 'SET_GIT_COMMITS_ON_BRANCH', commits }))
      .catch(() => {})
    invoke<boolean>('git_branch_pushed', { projectPath: activeProject.path, branch: gitBranch })
      .then((pushed) => dispatch({ type: 'SET_GIT_BRANCH_PUSHED', pushed }))
      .catch(() => {})
  }, [activeProject?.id, gitBranch, base, dispatch]) // eslint-disable-line react-hooks/exhaustive-deps

  const handlePush = useCallback(async () => {
    if (!activeProject || !gitBranch) return
    setPushing(true)
    await engineCommand({
      action: 'git_push',
      project_path: activeProject.path,
      branch: gitBranch,
    }).catch(() => {})
    // Re-check via Rust after push completes
    const pushed = await invoke<boolean>('git_branch_pushed', {
      projectPath: activeProject.path,
      branch: gitBranch,
    }).catch(() => false)
    dispatch({ type: 'SET_GIT_BRANCH_PUSHED', pushed })
    const commits = await invoke<string[]>('git_log_branch', {
      projectPath: activeProject.path,
      base,
    }).catch(() => [])
    dispatch({ type: 'SET_GIT_COMMITS_ON_BRANCH', commits })
    setPushing(false)
  }, [activeProject, gitBranch, base, dispatch])

  const handleGenerate = useCallback(async () => {
    if (!activeProject || generating) return
    streamRef.current = ''
    setBody('')
    setGenerating(true)
    const commits = gitCommitsOnBranch.join('\n')
    const prompt = `Generate a professional GitHub pull request description for the following branch.

Branch: ${gitBranch}
Base: ${base}
Commits:
${commits}

Write ONLY the PR body in this format:
## Summary
- Brief bullet points of what changed

## Changes
- Technical details per commit

## Test plan
- [ ] Relevant tests to verify

Keep it concise and professional. Output ONLY the markdown body, no preamble.`

    await invoke('invoke_claude', {
      message: prompt,
      history: [],
      projectPath: activeProject.path,
      model: 'claude-sonnet-4-6',
    }).catch(() => {
      setGenerating(false)
    })
  }, [activeProject, gitBranch, base, gitCommitsOnBranch, generating])

  const handleCreate = useCallback(async () => {
    if (!activeProject || !title.trim() || creating) return
    setCreating(true)
    setCreatedUrl(null)
    await engineCommand({
      action: 'gh_pr_create',
      project_path: activeProject.path,
      title: title.trim(),
      body: body.trim(),
      base,
      draft,
    }).catch(() => {
      setCreating(false)
    })
  }, [activeProject, title, body, base, draft, creating])

  async function openUrl(url: string) {
    await invoke('plugin:opener|open', { url }).catch(() => {
      // fallback — copy to clipboard
      navigator.clipboard.writeText(url)
    })
  }

  if (!activeProject) {
    return <div className={styles.empty}>Select a project to create a PR.</div>
  }

  const isDefaultBranch = gitBranch === ghDefaultBranch
  const noCommits = gitCommitsOnBranch.length === 0
  const canCreate =
    !creating &&
    !isDefaultBranch &&
    !noCommits &&
    gitBranchPushed &&
    title.trim() &&
    ghAvailable !== false

  return (
    <div className={styles.container}>
      <div className={styles.panel}>
        {/* Branch header */}
        <div className={styles.branchRow}>
          <span className={styles.branchBadge}>⎇ {gitBranch ?? '—'}</span>
          <span className={styles.arrow}>→</span>
          <select
            className={styles.baseSelect}
            value={base}
            onChange={(e) => setBase(e.target.value)}
          >
            <option value={ghDefaultBranch}>{ghDefaultBranch || '…'}</option>
            {state.gitBranches
              .filter((b) => b !== gitBranch && b !== ghDefaultBranch)
              .map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
          </select>
        </div>

        {/* Warnings */}
        {ghAvailable === false && (
          <div className={`${styles.alert} ${styles.alertError}`}>
            ⚠ <code>gh</code> CLI not found. Install from{' '}
            <button className={styles.link} onClick={() => openUrl('https://cli.github.com')}>
              cli.github.com
            </button>
          </div>
        )}
        {isDefaultBranch && (
          <div className={`${styles.alert} ${styles.alertWarn}`}>
            ⚠ You are on the default branch. Switch to a feature branch to create a PR.
          </div>
        )}
        {!isDefaultBranch && gitBranchPushed === false && (
          <div className={`${styles.alert} ${styles.alertWarn}`}>
            ↑ Branch not pushed to remote.{' '}
            <button className={styles.alertBtn} onClick={handlePush} disabled={pushing}>
              {pushing ? 'Pushing…' : 'Push now'}
            </button>
          </div>
        )}
        {gitAhead > 0 && gitBranchPushed && (
          <div className={`${styles.alert} ${styles.alertInfo}`}>
            ↑ {gitAhead} unpushed commit{gitAhead > 1 ? 's' : ''}.{' '}
            <button className={styles.alertBtn} onClick={handlePush} disabled={pushing}>
              {pushing ? 'Pushing…' : 'Push'}
            </button>
          </div>
        )}

        {/* Title */}
        <label className={styles.fieldLabel}>PR Title</label>
        <input
          className={styles.titleInput}
          type="text"
          placeholder="feat: describe your change"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={creating}
        />

        {/* Description */}
        <div className={styles.bodyHeader}>
          <label className={styles.fieldLabel}>Description</label>
          <button
            className={styles.generateBtn}
            onClick={handleGenerate}
            disabled={generating || noCommits}
          >
            {generating ? '✨ Generating…' : '✨ Generate with AI'}
          </button>
        </div>
        <textarea
          className={styles.bodyInput}
          placeholder="Describe what changed and why…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={creating}
        />

        {/* Commits */}
        {gitCommitsOnBranch.length > 0 && (
          <div className={styles.commits}>
            <span className={styles.fieldLabel}>
              Commits on this branch ({gitCommitsOnBranch.length})
            </span>
            <ul className={styles.commitList}>
              {gitCommitsOnBranch.map((c, i) => (
                <li key={i} className={styles.commitItem}>
                  <span className={styles.commitHash}>{c.slice(0, 7)}</span>
                  <span className={styles.commitMsg}>{c.slice(8)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {noCommits && !isDefaultBranch && (
          <div className={`${styles.alert} ${styles.alertInfo}`}>
            No commits ahead of <strong>{base}</strong>. Make some commits first.
          </div>
        )}

        {/* Draft toggle */}
        <div className={styles.draftRow}>
          <label className={styles.radio}>
            <input type="radio" checked={!draft} onChange={() => setDraft(false)} /> Ready for
            review
          </label>
          <label className={styles.radio}>
            <input type="radio" checked={draft} onChange={() => setDraft(true)} /> Draft PR
          </label>
        </div>

        {/* Create button / success */}
        {createdUrl ? (
          <div className={styles.success}>
            <span>✓ PR created!</span>
            <button className={styles.urlBtn} onClick={() => openUrl(createdUrl)}>
              {createdUrl}
            </button>
            <button
              className={styles.resetBtn}
              onClick={() => {
                setCreatedUrl(null)
                setTitle('')
                setBody('')
              }}
            >
              Create another
            </button>
          </div>
        ) : (
          <button className={styles.createBtn} onClick={handleCreate} disabled={!canCreate}>
            {creating ? 'Creating PR…' : 'Create PR on GitHub ↗'}
          </button>
        )}
      </div>

      {/* Open PRs sidebar */}
      <div className={styles.prList}>
        <div className={styles.prListHeader}>Open PRs ({ghOpenPrs.length})</div>
        {ghOpenPrs.length === 0 ? (
          <div className={styles.prListEmpty}>No open PRs</div>
        ) : (
          ghOpenPrs.map((pr) => (
            <button key={pr.number} className={styles.prItem} onClick={() => openUrl(pr.url)}>
              <span className={styles.prNumber}>#{pr.number}</span>
              <div className={styles.prInfo}>
                <span className={styles.prTitle}>{pr.title}</span>
                <span className={styles.prBranch}>
                  {pr.headRefName} → {base}
                </span>
              </div>
              <span className={`${styles.prState} ${pr.state === 'OPEN' ? styles.prOpen : ''}`}>
                {pr.state === 'OPEN' ? '● open' : pr.state.toLowerCase()}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

export default GitHubPR

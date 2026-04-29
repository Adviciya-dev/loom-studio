package process

import (
	"fmt"
	"io"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/loom/engine/diff"
	git "github.com/loom/engine/git"
	"github.com/loom/engine/ipc"
	"github.com/loom/engine/task"
)

type Status string

const (
	StatusIdle             Status = "idle"
	StatusRunning          Status = "running"
	StatusPaused           Status = "paused"
	StatusAwaitingApproval Status = "awaiting_approval"
	StatusCompleted        Status = "completed"
)

type Manager struct {
	mu          sync.Mutex
	status      Status
	emitter     *ipc.Emitter
	cmd         *exec.Cmd
	stdin       io.WriteCloser
	killed      bool
	projectPath string
	taskID      string
	taskTitle   string

	// per-write approval channels (non-nil while a process is running)
	confirmCh  chan PendingOp // streamer → manager: write op needing approval
	resumeCh   chan struct{}  // manager → streamer: unblock after decision
	currentOp  PendingOp     // the op currently awaiting approval

	// post-run final approval channel (non-nil during awaiting_approval)
	approvalCh chan bool
}

func NewManager(emitter *ipc.Emitter) *Manager {
	return &Manager{status: StatusIdle, emitter: emitter}
}

func (m *Manager) Status() Status {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.status
}

func (m *Manager) ProjectPath() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.projectPath
}

func (m *Manager) Start(taskPrompt, projectPath, taskID, taskTitle string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.status == StatusRunning || m.status == StatusPaused || m.status == StatusAwaitingApproval {
		return fmt.Errorf("process already running")
	}

	// --dangerously-skip-permissions: Claude writes freely without pausing.
	// We intercept each write AFTER it completes via tool_result events,
	// SIGSTOP the process, show the diff, then SIGCONT or revert.
	cmd := exec.Command(
		"claude",
		"--dangerously-skip-permissions",
		"--print",
		"--verbose",
		"--output-format", "stream-json",
		taskPrompt,
	)
	cmd.Dir = projectPath
	// stdin = nil → no pipe, no 3-second wait warning.

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("stdout pipe: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start: %w", err)
	}

	m.cmd = cmd
	m.stdin = nil
	m.projectPath = projectPath
	m.taskID = taskID
	m.taskTitle = taskTitle
	m.status = StatusRunning
	m.killed = false
	m.confirmCh = make(chan PendingOp, 1)
	m.resumeCh = make(chan struct{})
	m.approvalCh = nil

	streamer := NewStreamer(stdout, stderr).WithApproval(m.confirmCh, m.resumeCh)

	go m.runApprovalHandler()

	go func() {
		stderrTail := streamer.Stream(m.emitter)
		waitErr := cmd.Wait()

		m.mu.Lock()
		close(m.confirmCh)
		m.confirmCh = nil
		m.resumeCh = nil
		m.cmd = nil
		m.stdin = nil
		killed := m.killed
		if killed {
			m.killed = false
			m.status = StatusIdle
		}
		path := m.projectPath
		id := m.taskID
		title := m.taskTitle
		m.mu.Unlock()

		if killed {
			m.emitter.Emit("engine_status", StatusIdle)
			return
		}

		if waitErr != nil {
			m.mu.Lock()
			m.status = StatusIdle
			m.mu.Unlock()
			tail := stderrTail
			if tail == "" {
				tail = waitErr.Error()
			}
			m.emitter.EmitEngineError(tail)
			m.emitter.Emit("engine_status", StatusIdle)
			return
		}

		// Claude exited 0 — show final diff summary before committing.
		m.mu.Lock()
		m.status = StatusAwaitingApproval
		approvalCh := make(chan bool, 1)
		m.approvalCh = approvalCh
		m.mu.Unlock()

		m.emitter.Emit("engine_status", StatusAwaitingApproval)
		m.emitter.EmitLogLine("✓ Claude finished. Review all changes below.")

		sessionID := fmt.Sprintf("%d", time.Now().UnixNano())
		raw, diffErr := diff.Extract(path)
		if diffErr == diff.ErrNoDiff {
			// Nothing to diff — either no changes or Claude committed everything itself.
			m.mu.Lock()
			m.status = StatusCompleted
			m.approvalCh = nil
			m.mu.Unlock()
			if id != "" {
				if err := task.UpdateTaskStatus(path, id); err != nil {
					m.emitter.EmitLogLine("warn: could not update task status: " + err.Error())
				}
			}
			hash, commitErr := git.StageAndCommit(path, id, title)
			if commitErr != nil {
				if strings.Contains(commitErr.Error(), "nothing to commit") {
					// Claude may have committed its own changes, or made no file changes.
					// Treat as success using current HEAD.
					hash, _ = git.HeadHash(path)
					m.emitter.EmitLogLine("✓ Task complete (no uncommitted changes).")
					m.emitter.EmitTaskComplete(id, hash)
				} else {
					m.emitter.EmitEngineError(fmt.Sprintf("commit: %v", commitErr))
				}
			} else {
				m.emitter.EmitTaskComplete(id, hash)
			}
			return
		} else if diffErr != nil {
			m.emitter.EmitEngineError(fmt.Sprintf("diff extraction: %v", diffErr))
			return
		}

		payload, parseErr := diff.Parse(raw, sessionID)
		if parseErr != nil {
			m.emitter.EmitEngineError(fmt.Sprintf("diff parse: %v", parseErr))
			return
		}
		m.emitter.EmitDiffReady(payload)

		approved := <-approvalCh

		if !approved {
			return
		}

		if id != "" {
			if err := task.UpdateTaskStatus(path, id); err != nil {
				m.emitter.EmitLogLine("warn: could not update task status: " + err.Error())
			}
		}
		hash, commitErr := git.StageAndCommit(path, id, title)
		m.mu.Lock()
		m.status = StatusCompleted
		m.mu.Unlock()
		if commitErr != nil {
			if strings.Contains(commitErr.Error(), "nothing to commit") {
				hash, _ = git.HeadHash(path)
				m.emitter.EmitLogLine("✓ Task complete (no uncommitted changes).")
				m.emitter.EmitTaskComplete(id, hash)
			} else {
				m.emitter.EmitEngineError(fmt.Sprintf("commit: %v", commitErr))
			}
		} else {
			m.emitter.EmitTaskComplete(id, hash)
		}
	}()

	return nil
}

// runApprovalHandler handles each post-write tool_result from the streamer.
// For each write: SIGSTOP Claude, show git diff of the file, wait for user
// decision, then SIGCONT (approve) or git checkout <file> + SIGCONT (reject).
func (m *Manager) runApprovalHandler() {
	for op := range m.confirmCh {
		m.mu.Lock()
		m.status = StatusAwaitingApproval
		path := m.projectPath
		cmd := m.cmd
		resumeCh := m.resumeCh
		m.mu.Unlock()

		// Pause Claude so it can't write more files while we ask.
		if cmd != nil {
			suspendProcess(cmd) //nolint:errcheck
		}

		m.mu.Lock()
		m.currentOp = op
		m.mu.Unlock()

		m.emitter.Emit("engine_status", StatusAwaitingApproval)

		sessionID := fmt.Sprintf("%d", time.Now().UnixNano())
		payload, err := m.buildDiff(op, path, sessionID)
		if err != nil {
			// No diff (e.g. file unchanged) — auto-approve and continue.
			if cmd != nil {
				resumeProcess(cmd) //nolint:errcheck
			}
			m.mu.Lock()
			m.status = StatusRunning
			m.mu.Unlock()
			m.emitter.Emit("engine_status", StatusRunning)
			if resumeCh != nil {
				resumeCh <- struct{}{}
			}
			continue
		}

		m.emitter.EmitDiffReady(payload)
		// Approve() or Reject() will SIGCONT and signal resumeCh.
	}
}

// buildDiff produces a DiffPayload for a just-written file.
// Since --dangerously-skip-permissions is used, the file is already on disk —
// we use `git diff -- <file>` for per-file diffs, falling back to full tree diff.
func (m *Manager) buildDiff(op PendingOp, projectPath, sessionID string) (diff.DiffPayload, error) {
	var raw string
	var err error

	if op.Path != "" {
		raw, err = diff.ExtractFile(projectPath, op.Path)
	}
	if raw == "" || err == diff.ErrNoDiff {
		raw, err = diff.Extract(projectPath)
	}
	if err != nil {
		return diff.DiffPayload{}, err
	}
	return diff.Parse(raw, sessionID)
}

// Approve writes "y\n" to Claude's stdin and resumes the streamer.
// Works for both per-write approval and final post-run approval.
func (m *Manager) Approve() error {
	m.mu.Lock()
	if m.status != StatusAwaitingApproval {
		m.mu.Unlock()
		return fmt.Errorf("not awaiting approval")
	}

	// Post-run final approval.
	if m.approvalCh != nil {
		approvalCh := m.approvalCh
		m.approvalCh = nil
		m.status = StatusRunning
		m.mu.Unlock()
		m.emitter.Emit("engine_status", StatusRunning)
		approvalCh <- true
		return nil
	}

	// Per-write approval — SIGCONT Claude and unblock streamer.
	cmd := m.cmd
	resumeCh := m.resumeCh
	m.status = StatusRunning
	m.mu.Unlock()

	m.emitter.Emit("engine_status", StatusRunning)

	if cmd != nil {
		resumeProcess(cmd) //nolint:errcheck
	}
	if resumeCh != nil {
		resumeCh <- struct{}{}
	}
	return nil
}

// Reject writes "n\n" to Claude's stdin, reverts changes, and transitions to idle.
func (m *Manager) Reject() error {
	m.mu.Lock()
	if m.status != StatusAwaitingApproval {
		m.mu.Unlock()
		return fmt.Errorf("not awaiting approval")
	}

	// Post-run final rejection.
	if m.approvalCh != nil {
		approvalCh := m.approvalCh
		m.approvalCh = nil
		path := m.projectPath
		m.status = StatusIdle
		m.mu.Unlock()

		revertCmd := exec.Command("git", "checkout", ".")
		revertCmd.Dir = path
		if err := revertCmd.Run(); err != nil {
			m.emitter.EmitEngineError(fmt.Sprintf("git checkout . failed: %v", err))
		} else {
			m.emitter.EmitLogLine("Changes rejected. Working tree reverted.")
		}
		m.emitter.Emit("engine_status", StatusIdle)
		approvalCh <- false
		return nil
	}

	// Per-write rejection — revert the specific file, kill Claude, go idle.
	cmd := m.cmd
	resumeCh := m.resumeCh
	path := m.projectPath
	filePath := m.currentOp.Path
	m.killed = true
	m.status = StatusIdle
	m.mu.Unlock()

	// Revert only the rejected file (or whole tree if path unknown).
	var revertArgs []string
	if filePath != "" {
		revertArgs = []string{"checkout", "--", filePath}
	} else {
		revertArgs = []string{"checkout", "."}
	}
	revertCmd := exec.Command("git", revertArgs...)
	revertCmd.Dir = path
	if err := revertCmd.Run(); err != nil {
		m.emitter.EmitEngineError(fmt.Sprintf("git revert failed: %v", err))
	} else {
		if filePath != "" {
			m.emitter.EmitLogLine(fmt.Sprintf("Rejected: %s reverted.", filePath))
		} else {
			m.emitter.EmitLogLine("Changes rejected. Working tree reverted.")
		}
	}

	// Kill Claude (it's SIGSTOPped; kill it cleanly).
	if cmd != nil && cmd.Process != nil {
		resumeProcess(cmd) //nolint:errcheck — resume briefly so Kill() works
		cmd.Process.Kill()
	}

	m.emitter.Emit("engine_status", StatusIdle)

	if resumeCh != nil {
		select {
		case resumeCh <- struct{}{}:
		default:
		}
	}
	return nil
}

func (m *Manager) Pause() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.status != StatusRunning {
		return fmt.Errorf("process not running")
	}
	if err := suspendProcess(m.cmd); err != nil {
		return err
	}
	m.status = StatusPaused
	return nil
}

func (m *Manager) Resume() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.status != StatusPaused {
		return fmt.Errorf("process not paused")
	}
	if err := resumeProcess(m.cmd); err != nil {
		return err
	}
	m.status = StatusRunning
	return nil
}

func (m *Manager) Kill() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.cmd == nil || m.cmd.Process == nil {
		return fmt.Errorf("no process to kill")
	}
	m.killed = true
	if err := m.cmd.Process.Kill(); err != nil {
		m.killed = false
		return err
	}
	m.status = StatusIdle
	m.cmd = nil
	return nil
}

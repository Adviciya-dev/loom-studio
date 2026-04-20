package process

import (
	"fmt"
	"os/exec"
	"sync"

	"github.com/loom/engine/ipc"
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
	mu      sync.Mutex
	status  Status
	emitter *ipc.Emitter
	cmd     *exec.Cmd
	killed  bool
}

func NewManager(emitter *ipc.Emitter) *Manager {
	return &Manager{status: StatusIdle, emitter: emitter}
}

func (m *Manager) Status() Status {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.status
}

func (m *Manager) Start(taskPrompt, projectPath string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.status == StatusRunning || m.status == StatusPaused || m.status == StatusAwaitingApproval {
		return fmt.Errorf("process already running")
	}

	cmd := exec.Command("claude", "--dangerously-skip-permissions", "--print", taskPrompt)
	cmd.Dir = projectPath

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
	m.status = StatusRunning
	m.killed = false

	streamer := NewStreamer(stdout, stderr)
	go func() {
		stderrTail := streamer.Stream(m.emitter)
		waitErr := cmd.Wait()

		m.mu.Lock()
		defer m.mu.Unlock()

		m.cmd = nil

		if m.killed {
			m.killed = false
			return
		}

		if waitErr == nil {
			m.status = StatusCompleted
			m.emitter.EmitTaskComplete("", "")
		} else {
			m.status = StatusIdle
			tail := stderrTail
			if tail == "" {
				tail = waitErr.Error()
			}
			m.emitter.EmitEngineError(tail)
		}
	}()

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

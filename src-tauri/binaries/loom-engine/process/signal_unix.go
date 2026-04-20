//go:build !windows

package process

import (
	"fmt"
	"os/exec"
	"syscall"
)

func suspendProcess(cmd *exec.Cmd) error {
	if cmd.Process == nil {
		return fmt.Errorf("no process")
	}
	return cmd.Process.Signal(syscall.SIGSTOP)
}

func resumeProcess(cmd *exec.Cmd) error {
	if cmd.Process == nil {
		return fmt.Errorf("no process")
	}
	return cmd.Process.Signal(syscall.SIGCONT)
}

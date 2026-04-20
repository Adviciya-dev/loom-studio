//go:build windows

package process

import (
	"fmt"
	"os/exec"
)

func suspendProcess(cmd *exec.Cmd) error {
	return fmt.Errorf("process suspend not supported on Windows in this build")
}

func resumeProcess(cmd *exec.Cmd) error {
	return fmt.Errorf("process resume not supported on Windows in this build")
}

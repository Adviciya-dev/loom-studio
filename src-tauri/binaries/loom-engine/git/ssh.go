package git

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

var defaultKeyPaths = []string{
	"id_ed25519",
	"id_rsa",
	"id_ecdsa",
	"id_dsa",
}

// AddSSHKey unlocks the user's default SSH key by adding it to the SSH agent.
// On Windows, the Windows SSH agent should be used instead — this function is unsupported.
// using the provided passphrase. It tries common key locations under ~/.ssh/.
func AddSSHKey(passphrase string) error {
	if runtime.GOOS == "windows" {
		return fmt.Errorf("SSH key passphrase unlock is not supported on Windows. Add your key to the Windows SSH Agent via: ssh-add ~/.ssh/id_ed25519")
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("cannot determine home directory: %w", err)
	}

	// Write a temporary askpass script that echoes the passphrase.
	tmp, err := os.CreateTemp("", "loom-askpass-*.sh")
	if err != nil {
		return fmt.Errorf("cannot create askpass helper: %w", err)
	}
	defer os.Remove(tmp.Name())

	// Escape single quotes in the passphrase for safe shell embedding.
	safe := strings.ReplaceAll(passphrase, "'", `'\''`)
	if _, err := fmt.Fprintf(tmp, "#!/bin/sh\nprintf '%%s' '%s'\n", safe); err != nil {
		return err
	}
	tmp.Close()
	if err := os.Chmod(tmp.Name(), 0700); err != nil {
		return err
	}

	var lastErr error
	for _, name := range defaultKeyPaths {
		keyPath := filepath.Join(home, ".ssh", name)
		if _, err := os.Stat(keyPath); err != nil {
			continue
		}
		cmd := exec.Command("ssh-add", keyPath)
		cmd.Env = append(os.Environ(),
			"SSH_ASKPASS="+tmp.Name(),
			"SSH_ASKPASS_REQUIRE=force",
			"DISPLAY=:0",
		)
		cmd.Stdin = nil
		if out, err := cmd.CombinedOutput(); err != nil {
			lastErr = fmt.Errorf("%s: %s", name, strings.TrimSpace(string(out)))
			continue
		}
		return nil
	}

	if lastErr != nil {
		return lastErr
	}
	return fmt.Errorf("no SSH keys found in ~/.ssh/")
}

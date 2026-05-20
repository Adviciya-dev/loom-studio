package cqc

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

func cqcDir(projectPath string) string {
	return filepath.Join(projectPath, "harness", "cqc")
}

func clientsFile(projectPath string) string {
	return filepath.Join(cqcDir(projectPath), "clients.json")
}

func logFile(projectPath string) string {
	return filepath.Join(cqcDir(projectPath), "log.json")
}

func ensureDir(projectPath string) error {
	return os.MkdirAll(cqcDir(projectPath), 0o755)
}

func uuidv4() string {
	b := make([]byte, 16)
	rand.Read(b) //nolint:errcheck
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}

func nowISO() string {
	return time.Now().Format("2006-01-02T15:04:05Z")
}

func readClients(projectPath string) ([]Client, error) {
	data, err := os.ReadFile(clientsFile(projectPath))
	if os.IsNotExist(err) {
		return []Client{}, nil
	}
	if err != nil {
		return nil, err
	}
	var clients []Client
	if err := json.Unmarshal(data, &clients); err != nil {
		return []Client{}, nil
	}
	return clients, nil
}

func writeClients(projectPath string, clients []Client) error {
	if err := ensureDir(projectPath); err != nil {
		return err
	}
	data, err := json.MarshalIndent(clients, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(clientsFile(projectPath), data, 0o644)
}

func readLog(projectPath string) ([]LogEntry, error) {
	data, err := os.ReadFile(logFile(projectPath))
	if os.IsNotExist(err) {
		return []LogEntry{}, nil
	}
	if err != nil {
		return nil, err
	}
	var entries []LogEntry
	if err := json.Unmarshal(data, &entries); err != nil {
		return []LogEntry{}, nil
	}
	return entries, nil
}

func writeLog(projectPath string, entries []LogEntry) error {
	if err := ensureDir(projectPath); err != nil {
		return err
	}
	data, err := json.MarshalIndent(entries, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(logFile(projectPath), data, 0o644)
}

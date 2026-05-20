package audit

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// sessionDir returns {projectPath}/audits/{sessionID}/
func sessionDir(projectPath, sessionID string) string {
	return filepath.Join(projectPath, "audits", sessionID)
}

// SessionPath returns the path to intake.json for a session.
func SessionPath(projectPath, sessionID string) string {
	return filepath.Join(sessionDir(projectPath, sessionID), "intake.json")
}

// RawDir returns the path to the raw/ subdirectory for a session.
func RawDir(projectPath, sessionID string) string {
	return filepath.Join(sessionDir(projectPath, sessionID), "raw")
}

// ReportPath returns the path to report.md for a session.
func ReportPath(projectPath, sessionID string) string {
	return filepath.Join(sessionDir(projectPath, sessionID), "report.md")
}

// GoalPlanPath returns the path to goal_plan.json for a session.
func GoalPlanPath(projectPath, sessionID string) string {
	return filepath.Join(sessionDir(projectPath, sessionID), "goal_plan.json")
}

// LoadSession reads intake.json and returns a SessionFile.
func LoadSession(projectPath, sessionID string) (*SessionFile, error) {
	data, err := os.ReadFile(SessionPath(projectPath, sessionID))
	if err != nil {
		return nil, fmt.Errorf("read intake.json: %w", err)
	}
	var s SessionFile
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, fmt.Errorf("parse intake.json: %w", err)
	}
	return &s, nil
}

// SaveSessionPhase updates only the phase and updatedAt fields in intake.json.
func SaveSessionPhase(projectPath, sessionID string, phase AuditPhase) error {
	s, err := LoadSession(projectPath, sessionID)
	if err != nil {
		return err
	}
	s.Phase = phase
	s.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	return writeSessionFile(projectPath, sessionID, s)
}

// IncrementTaskCount adds n to the session's TaskCount and sets UpdatedAt.
func IncrementTaskCount(projectPath, sessionID string, n int) error {
	s, err := LoadSession(projectPath, sessionID)
	if err != nil {
		return err
	}
	s.TaskCount += n
	s.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	return writeSessionFile(projectPath, sessionID, s)
}

// writeSessionFile atomically writes s to intake.json.
func writeSessionFile(projectPath, sessionID string, s *SessionFile) error {
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal session: %w", err)
	}
	dir := sessionDir(projectPath, sessionID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("mkdir session dir: %w", err)
	}
	tmp := SessionPath(projectPath, sessionID) + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return fmt.Errorf("write tmp: %w", err)
	}
	return os.Rename(tmp, SessionPath(projectPath, sessionID))
}

// EnsureRawDir creates {session}/raw/ if it does not exist.
func EnsureRawDir(projectPath, sessionID string) error {
	return os.MkdirAll(RawDir(projectPath, sessionID), 0o755)
}

// DeleteRawDir removes the entire raw/ directory for a session (used by re-run).
func DeleteRawDir(projectPath, sessionID string) error {
	return os.RemoveAll(RawDir(projectPath, sessionID))
}

// teamPath returns {projectPath}/team.json
func teamPath(projectPath string) string {
	return filepath.Join(projectPath, "team.json")
}

// LoadTeam reads team.json. Returns an empty TeamFile when the file does not exist.
func LoadTeam(projectPath string) (*TeamFile, error) {
	data, err := os.ReadFile(teamPath(projectPath))
	if os.IsNotExist(err) {
		return &TeamFile{Version: 1, Members: []TeamMember{}}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read team.json: %w", err)
	}
	var t TeamFile
	if err := json.Unmarshal(data, &t); err != nil {
		return nil, fmt.Errorf("parse team.json: %w", err)
	}
	return &t, nil
}

// SaveTeam writes team.json atomically.
func SaveTeam(projectPath string, t *TeamFile) error {
	data, err := json.MarshalIndent(t, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal team.json: %w", err)
	}
	tmp := teamPath(projectPath) + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return fmt.Errorf("write team tmp: %w", err)
	}
	return os.Rename(tmp, teamPath(projectPath))
}

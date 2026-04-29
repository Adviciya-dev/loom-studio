package store

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

const stateFile = "state.json"
const tmpFile = "state.tmp"

type Store struct {
	dir      string
	state    State
	WasReset bool
}

// New resolves the OS-appropriate config directory, creates it if needed,
// then loads existing state or initialises from defaults.
func New() (*Store, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return nil, fmt.Errorf("store: cannot resolve config dir: %w", err)
	}
	dir := filepath.Join(configDir, "loom")
	s := &Store{dir: dir}
	if err := s.Load(); err != nil {
		return nil, err
	}
	return s, nil
}

// Load reads state.json. If missing it writes defaults. If malformed it resets.
func (s *Store) Load() error {
	if err := os.MkdirAll(s.dir, 0o755); err != nil {
		return fmt.Errorf("store: cannot create config dir: %w", err)
	}
	path := filepath.Join(s.dir, stateFile)
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			s.state = defaultState()
			return s.Save()
		}
		return fmt.Errorf("store: read error: %w", err)
	}
	var st State
	if err := json.Unmarshal(data, &st); err != nil {
		fmt.Fprintf(os.Stderr, "store: warning: malformed state.json — resetting to defaults\n")
		s.state = defaultState()
		s.WasReset = true
		return s.Save()
	}
	s.state = st
	return nil
}

// Save writes state atomically: marshals to a .tmp file then renames to state.json.
func (s *Store) Save() error {
	data, err := json.MarshalIndent(s.state, "", "  ")
	if err != nil {
		return fmt.Errorf("store: marshal error: %w", err)
	}
	tmp := filepath.Join(s.dir, tmpFile)
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return fmt.Errorf("store: write tmp error: %w", err)
	}
	dest := filepath.Join(s.dir, stateFile)
	if err := os.Rename(tmp, dest); err != nil {
		return fmt.Errorf("store: rename error: %w", err)
	}
	return nil
}

// Reset overwrites state with defaults and persists.
func (s *Store) Reset() error {
	fmt.Fprintf(os.Stderr, "store: warning: resetting state to defaults\n")
	s.state = defaultState()
	return s.Save()
}

func (s *Store) State() State { return s.state }

// Projects returns the current project list.
func (s *Store) Projects() []Project { return s.state.Projects }

// SaveProject upserts a project by ID. If no project with that ID exists it is appended.
func (s *Store) SaveProject(p Project) error {
	for i, existing := range s.state.Projects {
		if existing.ID == p.ID {
			s.state.Projects[i] = p
			return s.Save()
		}
	}
	s.state.Projects = append(s.state.Projects, p)
	return s.Save()
}

// RemoveProject deletes a project by ID and persists.
func (s *Store) RemoveProject(id string) error {
	next := make([]Project, 0, len(s.state.Projects))
	for _, p := range s.state.Projects {
		if p.ID != id {
			next = append(next, p)
		}
	}
	s.state.Projects = next
	if s.state.ActiveProjectID == id {
		s.state.ActiveProjectID = ""
	}
	return s.Save()
}

// SetActiveProject updates the active project ID and persists.
func (s *Store) SetActiveProject(id string) error {
	s.state.ActiveProjectID = id
	return s.Save()
}

// Preferences returns the current preferences.
func (s *Store) Preferences() Preferences { return s.state.Preferences }

// SavePreferences replaces preferences and persists.
func (s *Store) SavePreferences(prefs Preferences) error {
	s.state.Preferences = prefs
	return s.Save()
}

// AddTaskHistory appends a task history entry and persists.
func (s *Store) AddTaskHistory(th TaskHistory) error {
	s.state.TaskHistory = append(s.state.TaskHistory, th)
	return s.Save()
}

// Templates returns the current custom harness templates.
func (s *Store) Templates() []HarnessTemplate {
	if s.state.Templates == nil {
		return []HarnessTemplate{}
	}
	return s.state.Templates
}

// SaveTemplate upserts a template by ID. If no template with that ID exists it is appended.
func (s *Store) SaveTemplate(t HarnessTemplate) error {
	for i, existing := range s.state.Templates {
		if existing.ID == t.ID {
			s.state.Templates[i] = t
			return s.Save()
		}
	}
	s.state.Templates = append(s.state.Templates, t)
	return s.Save()
}

// DeleteTemplate removes a template by ID and persists.
func (s *Store) DeleteTemplate(id string) error {
	next := make([]HarnessTemplate, 0, len(s.state.Templates))
	for _, t := range s.state.Templates {
		if t.ID != id {
			next = append(next, t)
		}
	}
	s.state.Templates = next
	return s.Save()
}

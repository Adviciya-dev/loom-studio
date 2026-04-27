package store

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func newTestStore(t *testing.T) *Store {
	t.Helper()
	dir := t.TempDir()
	s := &Store{dir: dir}
	if err := s.Load(); err != nil {
		t.Fatalf("Load() error: %v", err)
	}
	return s
}

func TestLoadMissingFile_CreatesDefaults(t *testing.T) {
	s := newTestStore(t)
	if s.state.Version != 1 {
		t.Errorf("expected version 1, got %d", s.state.Version)
	}
	if s.state.Preferences.Theme != "dark" {
		t.Errorf("expected theme dark, got %s", s.state.Preferences.Theme)
	}
	if len(s.state.Projects) != 0 {
		t.Errorf("expected empty projects, got %d", len(s.state.Projects))
	}
	// state.json must have been written to disk
	path := filepath.Join(s.dir, stateFile)
	if _, err := os.Stat(path); err != nil {
		t.Errorf("state.json not written after Load on missing file: %v", err)
	}
}

func TestLoadValidFile_ReturnsCorrectState(t *testing.T) {
	dir := t.TempDir()
	want := State{
		Version:         1,
		ActiveProjectID: "proj_abc",
		Projects:        []Project{{ID: "proj_abc", Name: "Alpha", Path: "/tmp/alpha", Color: "#fff", AddedAt: "2026-04-20"}},
		TaskHistory:     []TaskHistory{},
		Preferences:     Preferences{Theme: "dark", LogAutoscroll: true, DefaultDiffView: "split"},
	}
	data, _ := json.Marshal(want)
	_ = os.WriteFile(filepath.Join(dir, stateFile), data, 0o644)

	s := &Store{dir: dir}
	if err := s.Load(); err != nil {
		t.Fatalf("Load() error: %v", err)
	}
	if s.state.ActiveProjectID != "proj_abc" {
		t.Errorf("expected active project proj_abc, got %s", s.state.ActiveProjectID)
	}
	if len(s.state.Projects) != 1 || s.state.Projects[0].Name != "Alpha" {
		t.Errorf("projects not loaded correctly: %+v", s.state.Projects)
	}
}

func TestSave_Atomic(t *testing.T) {
	s := newTestStore(t)
	s.state.ActiveProjectID = "proj_xyz"
	if err := s.Save(); err != nil {
		t.Fatalf("Save() error: %v", err)
	}
	// tmp file must be gone after rename
	if _, err := os.Stat(filepath.Join(s.dir, tmpFile)); !os.IsNotExist(err) {
		t.Error("tmp file should not exist after Save()")
	}
	// reload and verify
	s2 := &Store{dir: s.dir}
	if err := s2.Load(); err != nil {
		t.Fatalf("Load() after Save() error: %v", err)
	}
	if s2.state.ActiveProjectID != "proj_xyz" {
		t.Errorf("expected proj_xyz after reload, got %s", s2.state.ActiveProjectID)
	}
}

func TestLoadMalformedJSON_ResetsToDefaults(t *testing.T) {
	dir := t.TempDir()
	_ = os.WriteFile(filepath.Join(dir, stateFile), []byte("{not valid json}"), 0o644)

	s := &Store{dir: dir}
	if err := s.Load(); err != nil {
		t.Fatalf("Load() with malformed JSON should not return error, got: %v", err)
	}
	if s.state.Version != 1 {
		t.Errorf("expected default version 1 after malformed JSON, got %d", s.state.Version)
	}
}

func TestReset_OverwritesWithDefaults(t *testing.T) {
	s := newTestStore(t)
	s.state.ActiveProjectID = "some_project"
	_ = s.Save()

	if err := s.Reset(); err != nil {
		t.Fatalf("Reset() error: %v", err)
	}
	if s.state.ActiveProjectID != "" {
		t.Errorf("expected empty active project after reset, got %s", s.state.ActiveProjectID)
	}
}

func TestSaveProject_AppendsNew(t *testing.T) {
	s := newTestStore(t)
	p := Project{ID: "p1", Name: "MyApp", Path: "/src/myapp", Color: "#acc", AddedAt: "2026-04-20"}
	if err := s.SaveProject(p); err != nil {
		t.Fatalf("SaveProject() error: %v", err)
	}
	if len(s.Projects()) != 1 {
		t.Errorf("expected 1 project, got %d", len(s.Projects()))
	}
}

func TestSaveProject_UpdatesExisting(t *testing.T) {
	s := newTestStore(t)
	p := Project{ID: "p1", Name: "MyApp", Path: "/src/myapp", Color: "#acc", AddedAt: "2026-04-20"}
	_ = s.SaveProject(p)

	p.Name = "MyApp Renamed"
	if err := s.SaveProject(p); err != nil {
		t.Fatalf("SaveProject() update error: %v", err)
	}
	if len(s.Projects()) != 1 {
		t.Errorf("expected 1 project after update, got %d", len(s.Projects()))
	}
	if s.Projects()[0].Name != "MyApp Renamed" {
		t.Errorf("expected updated name, got %s", s.Projects()[0].Name)
	}
}

func TestSavePreferences_Persists(t *testing.T) {
	s := newTestStore(t)
	prefs := Preferences{Theme: "light", LogAutoscroll: false, DefaultDiffView: "unified"}
	if err := s.SavePreferences(prefs); err != nil {
		t.Fatalf("SavePreferences() error: %v", err)
	}
	s2 := &Store{dir: s.dir}
	_ = s2.Load()
	if s2.Preferences().Theme != "light" {
		t.Errorf("expected theme light after reload, got %s", s2.Preferences().Theme)
	}
}

package store

type Preferences struct {
	Theme           string `json:"theme"`
	LogAutoscroll   bool   `json:"log_autoscroll"`
	DefaultDiffView string `json:"default_diff_view"`
}

type Project struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Path    string `json:"path"`
	Color   string `json:"color"`
	AddedAt string `json:"added_at"`
}

type TaskHistory struct {
	TaskID      string `json:"task_id"`
	ProjectID   string `json:"project_id"`
	Status      string `json:"status"`
	CompletedAt string `json:"completed_at"`
}

type HarnessTemplate struct {
	ID     string `json:"id"`
	Label  string `json:"label"`
	Prompt string `json:"prompt"`
}

type State struct {
	Version         int               `json:"version"`
	Projects        []Project         `json:"projects"`
	ActiveProjectID string            `json:"active_project_id"`
	TaskHistory     []TaskHistory     `json:"task_history"`
	Preferences     Preferences       `json:"preferences"`
	Templates       []HarnessTemplate `json:"templates"`
}

func defaultState() State {
	return State{
		Version:     1,
		Projects:    []Project{},
		TaskHistory: []TaskHistory{},
		Preferences: Preferences{
			Theme:           "dark",
			LogAutoscroll:   true,
			DefaultDiffView: "split",
		},
		Templates: []HarnessTemplate{},
	}
}

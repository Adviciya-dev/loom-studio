package task

type Status string
type TaskType string

const (
	StatusPending    Status = "pending"
	StatusInProgress Status = "in-progress"
	StatusCompleted  Status = "completed"

	TypeFeature  TaskType = "feature"
	TypePerf     TaskType = "perf"
	TypeSecurity TaskType = "security"
	TypeTest     TaskType = "test"
	TypeDesign   TaskType = "design"
)

type Step struct {
	Text string `json:"text"`
	Done bool   `json:"done"`
}

type Task struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Type        TaskType `json:"type"`
	Status      Status   `json:"status"`
	Due         string   `json:"due"`
	Description string   `json:"description"`
	Steps       []Step   `json:"steps"`
	Prompt      string   `json:"prompt"`
	Filename    string   `json:"filename"`
	FilePath    string   `json:"file_path"`
}

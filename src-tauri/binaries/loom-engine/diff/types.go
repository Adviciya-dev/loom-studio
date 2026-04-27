package diff

type LineType = string

const (
	LineAdd     LineType = "add"
	LineRemove  LineType = "rem"
	LineNeutral LineType = "neutral"
)

type DiffLine struct {
	LineNumber int      `json:"line_number"`
	Type       LineType `json:"type"`
	Content    string   `json:"content"`
}

type DiffFile struct {
	Name    string     `json:"name"`
	Added   int        `json:"added"`
	Removed int        `json:"removed"`
	Lines   []DiffLine `json:"lines"`
}

type DiffPayload struct {
	SessionID string     `json:"session_id"`
	Files     []DiffFile `json:"files"`
}

package ipc

import "strings"

const (
	LevelInfo    = "INFO"
	LevelSuccess = "SUCCESS"
	LevelWarn    = "WARN"
	LevelError   = "ERROR"
	LevelPass    = "PASS"
)

// Event is the envelope written to stdout for every engine event.
type Event struct {
	Event   string      `json:"event"`
	Payload interface{} `json:"payload,omitempty"`
}

// LogLine is the payload for a log_line event.
type LogLine struct {
	Timestamp string `json:"timestamp"`
	Level     string `json:"level"`
	Content   string `json:"content"`
}

// DetectLevel infers a log level from the line content.
func DetectLevel(content string) string {
	lower := strings.ToLower(content)
	switch {
	case strings.HasPrefix(content, "✓") || strings.HasPrefix(lower, "success"):
		return LevelSuccess
	case strings.Contains(lower, "error"):
		return LevelError
	case strings.Contains(lower, "warn"):
		return LevelWarn
	case strings.HasPrefix(lower, "pass") || strings.Contains(lower, " pass "):
		return LevelPass
	default:
		return LevelInfo
	}
}

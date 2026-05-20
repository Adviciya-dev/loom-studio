package cqc

type Client struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Tone         string `json:"tone"`
	Audience     string `json:"audience"`
	Restrictions string `json:"restrictions"`
	Keywords     string `json:"keywords"`
	CreatedAt    string `json:"created_at"`
}

type Issue struct {
	Type          string `json:"type"`
	Severity      string `json:"severity"`
	Snippet       string `json:"snippet"`
	Explanation   string `json:"explanation"`
	SuggestedFix  string `json:"suggested_fix,omitempty"`
}

type CheckResult struct {
	Approved      bool    `json:"approved"`
	Summary       string  `json:"summary"`
	Issues        []Issue `json:"issues"`
	ExtractedText string  `json:"extracted_text"`
}

type LogEntry struct {
	ID             string `json:"id"`
	ClientID       string `json:"client_id"`
	User           string `json:"user"`
	ContentPreview string `json:"content_preview"`
	IssueCount     int    `json:"issue_count"`
	Approved       bool   `json:"approved"`
	Summary        string `json:"summary"`
	IssuesJSON     string `json:"issues_json"`
	CreatedAt      string `json:"created_at"`
}

type ProgressStep string

const (
	StepBuildingPrompt ProgressStep = "building_prompt"
	StepRunningClaude  ProgressStep = "running_claude"
	StepParsingResult  ProgressStep = "parsing_result"
	StepSavingLog      ProgressStep = "saving_log"
)

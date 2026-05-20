package audit

// AuditPhase matches the TypeScript AuditPhase union.
type AuditPhase string

const (
	PhaseIntake    AuditPhase = "intake"
	PhaseRunning   AuditPhase = "running"
	PhaseReport    AuditPhase = "report"
	PhaseGoals     AuditPhase = "goals"
	PhaseCancelled AuditPhase = "cancelled"
	PhaseComplete  AuditPhase = "complete"
)

// AuditIntake mirrors the TypeScript AuditIntake interface.
type AuditIntake struct {
	SiteURL        string   `json:"siteUrl"`
	SiteName       string   `json:"siteName"`
	CMS            string   `json:"cms"`
	CMSOther       string   `json:"cmsOther"`
	Industry       string   `json:"industry"`
	NicheKeywords  string   `json:"nicheKeywords"`
	TargetMarket   string   `json:"targetMarket"`
	Competitors    []string `json:"competitors"`
	LocalRepoPath  *string  `json:"localRepoPath"`
	BusinessGoal   string   `json:"businessGoal"`
	BudgetTimeline string   `json:"budgetTimeline"`
}

// SessionFile is the schema of intake.json on disk (envelope + intake fields).
type SessionFile struct {
	SessionID  string     `json:"sessionId"`
	Version    int        `json:"version"`
	ProjectID  string     `json:"projectId"`
	SiteName   string     `json:"siteName"`
	SiteURL    string     `json:"siteUrl"`
	Phase      AuditPhase `json:"phase"`
	CreatedAt  string     `json:"createdAt"`
	UpdatedAt  string     `json:"updatedAt"`
	ReportPath *string    `json:"reportPath"`
	TaskCount  int        `json:"taskCount"`
	Intake     AuditIntake `json:"intake"`
}

// TeamMember is one entry in team.json.
type TeamMember struct {
	Name string `json:"name"`
	Role string `json:"role"`
}

// TeamFile is the schema of team.json.
type TeamFile struct {
	Version int          `json:"version"`
	Members []TeamMember `json:"members"`
}

// GoalTask mirrors the TypeScript GoalTask interface.
type GoalTask struct {
	ID                  string  `json:"id"`
	Title               string  `json:"title"`
	Bucket              string  `json:"bucket"`
	Dimension           string  `json:"dimension"`
	Effort              string  `json:"effort"`
	Owner               *string `json:"owner"`
	Notes               string  `json:"notes"`
	LinkedReportSection string  `json:"linkedReportSection"`
}

// GoalPlanFile is the schema of goal_plan.json.
type GoalPlanFile struct {
	Version     int        `json:"version"`
	SessionID   string     `json:"sessionId"`
	GeneratedAt string     `json:"generatedAt"`
	SavedAt     *string    `json:"savedAt"`
	Tasks       []GoalTask `json:"tasks"`
}

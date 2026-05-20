package cqc

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/loom/engine/ipc"
)

func claudeBin() string {
	if runtime.GOOS == "windows" {
		return "claude.cmd"
	}
	return "claude"
}

func buildTextPrompt(client Client, text string) string {
	var sb strings.Builder
	sb.WriteString("You are a professional content quality checker for a marketing agency. ")
	sb.WriteString("Check the following content against the client's brand guidelines and return a JSON result.\n\n")

	sb.WriteString("## Client Profile\n")
	sb.WriteString("Name: " + client.Name + "\n")
	if client.Tone != "" {
		sb.WriteString("Tone of voice: " + client.Tone + "\n")
	}
	if client.Audience != "" {
		sb.WriteString("Target audience: " + client.Audience + "\n")
	}
	if client.Restrictions != "" {
		sb.WriteString("Restrictions / banned words: " + client.Restrictions + "\n")
	}
	if client.Keywords != "" {
		sb.WriteString("Required keywords / hashtags: " + client.Keywords + "\n")
	}

	sb.WriteString("\n## Content to Check\n")
	sb.WriteString(text)

	sb.WriteString("\n\n## Instructions\n")
	sb.WriteString("Check for: spelling mistakes, grammar errors, brand-rule violations (wrong brand spelling,\n")
	sb.WriteString("missing required hashtags, banned words, tone mismatch), and factual contradictions\n")
	sb.WriteString("with the client profile above.\n\n")
	sb.WriteString("Return ONLY valid JSON in this exact shape — no markdown fences, no extra text:\n")
	sb.WriteString(`{
  "extracted_text": "<the content you checked, verbatim>",
  "issues": [
    {
      "type": "spelling | grammar | brand | fact",
      "severity": "high | medium | low",
      "snippet": "<exact problem text from the content>",
      "explanation": "<what is wrong and why>",
      "suggested_fix": "<replacement text when you can confidently provide one>"
    }
  ],
  "summary": "<one-sentence overall assessment>",
  "approved": true
}`)
	sb.WriteString("\n\nIf there are no issues, return an empty issues array and set approved to true.\n")
	sb.WriteString("Set approved to false if any high or medium severity issues exist.")

	return sb.String()
}

func stripFences(s string) string {
	s = strings.TrimSpace(s)
	for _, prefix := range []string{"```json", "```"} {
		if strings.HasPrefix(s, prefix) {
			s = strings.TrimPrefix(s, prefix)
			break
		}
	}
	s = strings.TrimSuffix(s, "```")
	return strings.TrimSpace(s)
}

func nowHMS() string {
	return time.Now().Format("15:04:05")
}

func emitLog(emitter *ipc.Emitter, level, content string) {
	if emitter == nil {
		return
	}
	emitter.Emit("log_line", map[string]interface{}{
		"timestamp": nowHMS(),
		"level":     level,
		"content":   content,
	})
}

func RunTextCheck(emitter *ipc.Emitter, projectPath string, client Client, text, user string) (CheckResult, error) {
	emitProgress := func(step ProgressStep) {
		if emitter != nil {
			emitter.Emit("cqc:progress", map[string]interface{}{"step": string(step)})
		}
	}

	// ── Phase A: build prompt ─────────────────────────────────────────────────
	emitProgress(StepBuildingPrompt)
	emitLog(emitter, "INFO", "CQC: Building quality check prompt for "+client.Name+"…")
	prompt := buildTextPrompt(client, text)

	// ── Phase B: run Claude (streamed) ────────────────────────────────────────
	emitProgress(StepRunningClaude)
	emitLog(emitter, "INFO", "CQC: Invoking Claude for content analysis…")

	// Use --output-format text so stdout streams line by line.
	cmd := exec.Command(claudeBin(), "--dangerously-skip-permissions", "--print", "--output-format", "text", prompt)
	cmd.Dir = projectPath

	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		return CheckResult{}, fmt.Errorf("pipe stdout: %w", err)
	}
	var stderrBuf bytes.Buffer
	cmd.Stderr = &stderrBuf

	if err := cmd.Start(); err != nil {
		return CheckResult{}, fmt.Errorf("start claude: %w", err)
	}

	var outBuf strings.Builder
	scanner := bufio.NewScanner(stdoutPipe)
	for scanner.Scan() {
		line := scanner.Text()
		outBuf.WriteString(line + "\n")
		if trimmed := strings.TrimSpace(line); trimmed != "" {
			emitLog(emitter, "CLAUDE", trimmed)
		}
	}

	if err := cmd.Wait(); err != nil {
		msg := strings.TrimSpace(stderrBuf.String())
		if msg == "" {
			msg = err.Error()
		}
		return CheckResult{}, fmt.Errorf("claude: %s", msg)
	}

	// ── Phase C: parse ────────────────────────────────────────────────────────
	emitProgress(StepParsingResult)
	emitLog(emitter, "INFO", "CQC: Parsing Claude response…")

	raw := stripFences(outBuf.String())

	var result CheckResult
	if err := json.Unmarshal([]byte(raw), &result); err != nil {
		// Fallback: maybe Claude still used the JSON wrapper format.
		var wrapper struct {
			Result string `json:"result"`
		}
		if err2 := json.Unmarshal([]byte(raw), &wrapper); err2 == nil && wrapper.Result != "" {
			if err3 := json.Unmarshal([]byte(wrapper.Result), &result); err3 != nil {
				return CheckResult{}, fmt.Errorf("parse wrapped result: %w", err3)
			}
		} else {
			return CheckResult{}, errors.New("could not parse Claude response as JSON — check output panel for raw Claude response")
		}
	}

	if result.ExtractedText == "" {
		result.ExtractedText = text
	}

	// ── Phase D: save ─────────────────────────────────────────────────────────
	emitProgress(StepSavingLog)
	emitLog(emitter, "INFO", "CQC: Saving to audit log…")

	issuesJSON, _ := json.Marshal(result.Issues)
	preview := text
	if len(preview) > 120 {
		preview = preview[:120] + "…"
	}
	entry := LogEntry{
		ID:             uuidv4(),
		ClientID:       client.ID,
		User:           user,
		ContentPreview: preview,
		IssueCount:     len(result.Issues),
		Approved:       result.Approved,
		Summary:        result.Summary,
		IssuesJSON:     string(issuesJSON),
		CreatedAt:      nowISO(),
	}
	_ = AppendLog(projectPath, entry)

	// Summary line in output panel.
	status := "APPROVED"
	if !result.Approved {
		status = "NEEDS REVIEW"
	}
	level := "SUCCESS"
	if !result.Approved {
		level = "WARN"
	}
	emitLog(emitter, level, fmt.Sprintf("CQC [%s] %d issue(s) — %s", status, len(result.Issues), result.Summary))

	return result, nil
}

func RunImageCheck(_ *ipc.Emitter, _ string, _ Client, _ string) (CheckResult, error) {
	return CheckResult{}, errors.New("image check is not yet implemented (Phase 2)")
}

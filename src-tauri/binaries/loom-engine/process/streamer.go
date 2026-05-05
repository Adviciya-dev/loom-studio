package process

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"sync"

	"github.com/loom/engine/ipc"
)

const stderrTailLines = 10

// PendingOp holds a write/edit tool_use awaiting post-write approval.
type PendingOp struct {
	ToolUseID string
	ToolName  string
	Path      string // file path (relative or absolute)
}

type Streamer struct {
	stdout io.Reader
	stderr io.Reader

	// Per-write approval wiring (optional).
	confirmCh chan<- PendingOp // signals manager after a write tool_result arrives
	resumeCh  <-chan struct{}  // manager unblocks streamer after approve/reject

	mu         sync.Mutex
	pendingOps map[string]PendingOp // tool_use_id → PendingOp (write tools only)
}

func NewStreamer(stdout, stderr io.Reader) *Streamer {
	return &Streamer{
		stdout:     stdout,
		stderr:     stderr,
		pendingOps: make(map[string]PendingOp),
	}
}

func (s *Streamer) WithApproval(confirmCh chan<- PendingOp, resumeCh <-chan struct{}) *Streamer {
	s.confirmCh = confirmCh
	s.resumeCh = resumeCh
	return s
}

// writeToolNames are tools that modify files and need per-write approval.
var writeToolNames = map[string]bool{
	"write_file":              true,
	"write":                   true,
	"edit":                    true,
	"multiedit":               true,
	"str_replace_editor":      true,
	"str_replace_based_edit":  true,
}

// contentText extracts a plain string from a tool result content field,
// which can be a string, an array of {type,text} blocks, or something else.
func contentText(raw json.RawMessage) string {
	var s string
	if json.Unmarshal(raw, &s) == nil {
		return s
	}
	var blocks []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}
	if json.Unmarshal(raw, &blocks) == nil {
		var parts []string
		for _, b := range blocks {
			if b.Type == "text" && strings.TrimSpace(b.Text) != "" {
				parts = append(parts, strings.TrimSpace(b.Text))
			}
		}
		return strings.Join(parts, "\n")
	}
	return ""
}

func truncate(s string, maxLines int) string {
	lines := strings.Split(s, "\n")
	if len(lines) <= maxLines {
		return s
	}
	return strings.Join(lines[:maxLines], "\n") +
		fmt.Sprintf("\n… (%d more lines)", len(lines)-maxLines)
}

// outputItem is a single piece of display text with a flag indicating whether
// it originated from Claude's own prose (vs. tool labels or tool results).
type outputItem struct {
	text     string
	isClaude bool // true → render as chat bubble in the UI
}

// parseStreamLine parses one stream-json NDJSON line.
// Returns:
//   - items:       ordered display items, each typed as prose or system text
//   - pendingOp:   populated when a write tool_use block is seen
//   - completedID: tool_use_id when any tool_result is seen (empty otherwise)
func parseStreamLine(line string) (items []outputItem, pendingOp *PendingOp, completedID string) {
	var obj map[string]json.RawMessage
	if err := json.Unmarshal([]byte(line), &obj); err != nil {
		return []outputItem{{text: line}}, nil, "" // plain text fallback
	}

	var msgType string
	if raw, ok := obj["type"]; ok {
		json.Unmarshal(raw, &msgType) //nolint:errcheck
	}

	switch msgType {
	// ── assistant: Claude's prose + tool_use announcements ───────────────
	case "assistant":
		var envelope struct {
			Message struct {
				Content []struct {
					Type  string          `json:"type"`
					ID    string          `json:"id"`
					Text  string          `json:"text"`
					Name  string          `json:"name"`
					Input json.RawMessage `json:"input"`
				} `json:"content"`
			} `json:"message"`
		}
		if err := json.Unmarshal([]byte(line), &envelope); err != nil {
			return nil, nil, ""
		}
		for _, block := range envelope.Message.Content {
			switch block.Type {
			case "text":
				if t := strings.TrimSpace(block.Text); t != "" {
					// Claude's own words — mark as prose for bubble rendering.
					items = append(items, outputItem{text: t, isClaude: true})
				}
			case "tool_use":
				label := fmt.Sprintf("[tool: %s]", block.Name)
				var input map[string]json.RawMessage
				if json.Unmarshal(block.Input, &input) == nil {
					for _, key := range []string{"path", "file_path", "command"} {
						if raw, ok := input[key]; ok {
							var val string
							if json.Unmarshal(raw, &val) == nil && val != "" {
								label += " " + val
								break
							}
						}
					}
				}
				items = append(items, outputItem{text: label})

				if writeToolNames[strings.ToLower(block.Name)] {
					op := PendingOp{ToolUseID: block.ID, ToolName: block.Name}
					if json.Unmarshal(block.Input, &input) == nil {
						for _, key := range []string{"path", "file_path"} {
							if raw, ok := input[key]; ok {
								json.Unmarshal(raw, &op.Path) //nolint:errcheck
								break
							}
						}
					}
					pendingOp = &op
				}
			}
		}
		return items, pendingOp, ""

	// ── user: wraps tool_results ──────────────────────────────────────────
	case "user":
		var envelope struct {
			Message struct {
				Content []struct {
					Type      string          `json:"type"`
					ToolUseID string          `json:"tool_use_id"`
					IsError   bool            `json:"is_error"`
					Content   json.RawMessage `json:"content"`
				} `json:"content"`
			} `json:"message"`
		}
		if err := json.Unmarshal([]byte(line), &envelope); err != nil {
			return nil, nil, ""
		}
		var lastToolUseID string
		for _, block := range envelope.Message.Content {
			if block.Type != "tool_result" {
				continue
			}
			lastToolUseID = block.ToolUseID
			text := contentText(block.Content)
			if block.IsError {
				items = append(items, outputItem{text: "✗ " + text})
			} else if text != "" {
				items = append(items, outputItem{text: truncate(text, 12)})
			}
		}
		return items, nil, lastToolUseID

	// ── tool_result: top-level variant (older Claude Code builds) ─────────
	case "tool_result":
		var res struct {
			ToolUseID string          `json:"tool_use_id"`
			IsError   bool            `json:"is_error"`
			Content   json.RawMessage `json:"content"`
		}
		if err := json.Unmarshal([]byte(line), &res); err != nil {
			return nil, nil, ""
		}
		text := contentText(res.Content)
		if res.IsError {
			return []outputItem{{text: "✗ " + text}}, nil, res.ToolUseID
		}
		if text != "" {
			return []outputItem{{text: truncate(text, 12)}}, nil, res.ToolUseID
		}
		return nil, nil, res.ToolUseID

	// ── result: final summary / error ─────────────────────────────────────
	case "result":
		var res struct {
			Subtype string `json:"subtype"`
			Result  string `json:"result"`
		}
		if err := json.Unmarshal([]byte(line), &res); err != nil {
			return nil, nil, ""
		}
		// Only surface error results — success text was already streamed via
		// assistant events; emitting it again causes duplicate log lines.
		if res.Subtype == "error" || res.Subtype == "error_during_execution" {
			if res.Result != "" {
				return []outputItem{{text: "Error: " + res.Result}}, nil, ""
			}
		}
		return nil, nil, ""

	// ── system: init info ─────────────────────────────────────────────────
	case "system":
		var sys struct {
			Subtype string `json:"subtype"`
			CWD     string `json:"cwd"`
			Model   string `json:"model"`
		}
		if err := json.Unmarshal([]byte(line), &sys); err != nil {
			return nil, nil, ""
		}
		if sys.Subtype == "init" && (sys.Model != "" || sys.CWD != "") {
			return []outputItem{{text: fmt.Sprintf("model: %s  cwd: %s", sys.Model, sys.CWD)}}, nil, ""
		}
		return nil, nil, ""

	default:
		return nil, nil, ""
	}
}

// StreamHarness reads stdout/stderr and emits harness_log_line events for Claude
// prose — used by the Harness Manager chat panel (same infrastructure as Stream).
func (s *Streamer) StreamHarness(emitter *ipc.Emitter) {
	const maxScanToken = 1024 * 1024

	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		scanner := bufio.NewScanner(s.stdout)
		scanner.Buffer(make([]byte, maxScanToken), maxScanToken)
		for scanner.Scan() {
			line := scanner.Text()
			if line == "" {
				continue
			}
			items, _, _ := parseStreamLine(line)
			for _, item := range items {
				if !item.isClaude {
					continue // skip tool labels and tool results
				}
				for _, part := range strings.Split(item.text, "\n") {
					if p := strings.TrimSpace(part); p != "" {
						emitter.EmitHarnessLogLine(p)
					}
				}
			}
		}
	}()

	go func() {
		defer wg.Done()
		scanner := bufio.NewScanner(s.stderr)
		scanner.Buffer(make([]byte, maxScanToken), maxScanToken)
		for scanner.Scan() {
			// discard stderr for harness mode
		}
	}()

	wg.Wait()
}

// Stream reads stdout and stderr concurrently, emitting log_line events.
// After each write tool_result, if approval is wired, it signals the manager
// (which SIGSTOPs Claude) and blocks until resumeCh fires.
func (s *Streamer) Stream(emitter *ipc.Emitter) string {
	var mu sync.Mutex
	var stderrBuf []string

	const maxScanToken = 1024 * 1024

	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		scanner := bufio.NewScanner(s.stdout)
		scanner.Buffer(make([]byte, maxScanToken), maxScanToken)

		for scanner.Scan() {
			line := scanner.Text()
			if line == "" {
				continue
			}

			items, pendingOp, completedID := parseStreamLine(line)

			// Register pending write ops by ID and also as "last write seen".
			if pendingOp != nil {
				s.mu.Lock()
				if pendingOp.ToolUseID != "" {
					s.pendingOps[pendingOp.ToolUseID] = *pendingOp
				}
				s.pendingOps["__last__"] = *pendingOp
				s.mu.Unlock()
			}

			// Emit each typed item. Claude prose → CLAUDE level (bubble UI);
			// everything else → normal log line.
			for _, item := range items {
				for _, part := range strings.Split(item.text, "\n") {
					if p := strings.TrimSpace(part); p != "" {
						if item.isClaude {
							emitter.EmitClaudeMessage(p)
						} else {
							emitter.EmitLogLine(p)
						}
					}
				}
			}

			// A tool_result arrived — check if it matches a pending write op.
			if completedID != "" && s.confirmCh != nil {
				s.mu.Lock()
				// Try exact ID match first, then fall back to __last__.
				op, isWrite := s.pendingOps[completedID]
				if !isWrite {
					op, isWrite = s.pendingOps["__last__"]
				}
				if isWrite {
					delete(s.pendingOps, completedID)
					delete(s.pendingOps, "__last__")
				}
				s.mu.Unlock()

				if isWrite {
					s.confirmCh <- op
					<-s.resumeCh
				}
			}
		}
	}()

	go func() {
		defer wg.Done()
		scanner := bufio.NewScanner(s.stderr)
		scanner.Buffer(make([]byte, maxScanToken), maxScanToken)
		for scanner.Scan() {
			line := scanner.Text()
			if line == "" {
				continue
			}
			emitter.EmitLogLine(line)
			mu.Lock()
			stderrBuf = append(stderrBuf, line)
			if len(stderrBuf) > stderrTailLines {
				stderrBuf = stderrBuf[len(stderrBuf)-stderrTailLines:]
			}
			mu.Unlock()
		}
	}()

	wg.Wait()

	mu.Lock()
	defer mu.Unlock()
	return strings.Join(stderrBuf, "\n")
}

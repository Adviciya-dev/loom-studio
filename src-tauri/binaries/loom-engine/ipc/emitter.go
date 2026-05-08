package ipc

import (
	"encoding/json"
	"fmt"
	"io"
	"time"
)

// Emitter serializes structured events as JSON and writes them to stdout.
type Emitter struct {
	out io.Writer
}

func NewEmitter(out io.Writer) *Emitter {
	return &Emitter{out: out}
}

func (e *Emitter) Emit(eventType string, payload interface{}) {
	ev := Event{Event: eventType, Payload: payload}
	b, err := json.Marshal(ev)
	if err != nil {
		fmt.Fprintf(e.out, `{"event":"engine_error","payload":{"message":"failed to marshal event"}}`)
		fmt.Fprintln(e.out)
		return
	}
	fmt.Fprintln(e.out, string(b))
}

func (e *Emitter) EmitReady() {
	e.Emit("ready", nil)
}

// EmitLogLine detects the log level from content and emits a log_line event.
func (e *Emitter) EmitLogLine(content string) {
	e.Emit("log_line", LogLine{
		Timestamp: time.Now().Format("15:04:05"),
		Level:     DetectLevel(content),
		Content:   content,
	})
}

// EmitHarnessLogLine emits a Claude prose line for the Harness chat panel.
func (e *Emitter) EmitHarnessLogLine(content string) {
	e.Emit("harness_log_line", LogLine{
		Timestamp: time.Now().Format("15:04:05"),
		Level:     "CLAUDE",
		Content:   content,
		Kind:      "prose",
	})
}

// EmitHarnessLine emits a typed harness line: "prose", "tool", or "result".
func (e *Emitter) EmitHarnessLine(kind, content string) {
	e.Emit("harness_log_line", LogLine{
		Timestamp: time.Now().Format("15:04:05"),
		Level:     "CLAUDE",
		Content:   content,
		Kind:      kind,
	})
}

func (e *Emitter) EmitClaudeMessage(content string) {
	e.Emit("log_line", LogLine{
		Timestamp: time.Now().Format("15:04:05"),
		Level:     "CLAUDE",
		Content:   content,
	})
}

func (e *Emitter) EmitEngineError(message string) {
	e.Emit("engine_error", map[string]string{"message": message})
}

func (e *Emitter) EmitTaskComplete(taskID, commitHash string) {
	e.Emit("task_complete", map[string]string{"task_id": taskID, "commit_hash": commitHash})
}

func (e *Emitter) EmitDiffReady(payload interface{}) {
	e.Emit("diff_ready", payload)
}

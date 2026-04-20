package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"

	"github.com/loom/engine/ipc"
	"github.com/loom/engine/process"
	"github.com/loom/engine/store"
	"github.com/loom/engine/task"
)

func main() {
	emitter := ipc.NewEmitter(os.Stdout)
	manager := process.NewManager(emitter)

	st, err := store.New()
	if err != nil {
		fmt.Fprintf(os.Stderr, "engine: store init error: %v\n", err)
		os.Exit(1)
	}

	emitter.EmitReady()

	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}

		var cmd map[string]json.RawMessage
		if err := json.Unmarshal([]byte(line), &cmd); err != nil {
			fmt.Fprintf(os.Stderr, "engine: invalid command: %v\n", err)
			continue
		}

		var action string
		if err := json.Unmarshal(cmd["action"], &action); err != nil {
			fmt.Fprintf(os.Stderr, "engine: missing action field\n")
			continue
		}

		switch action {
		case "get_projects":
			emitter.Emit("projects", st.Projects())

		case "save_project":
			var p store.Project
			if err := json.Unmarshal(cmd["project"], &p); err != nil {
				emitter.EmitEngineError("save_project: invalid project payload")
				continue
			}
			if err := st.SaveProject(p); err != nil {
				emitter.EmitEngineError(fmt.Sprintf("save_project: %v", err))
				continue
			}
			emitter.Emit("projects", st.Projects())

		case "set_active_project":
			var id string
			if err := json.Unmarshal(cmd["id"], &id); err != nil {
				emitter.EmitEngineError("set_active_project: invalid id")
				continue
			}
			if err := st.SetActiveProject(id); err != nil {
				emitter.EmitEngineError(fmt.Sprintf("set_active_project: %v", err))
				continue
			}
			emitter.Emit("active_project_changed", id)

		case "get_preferences":
			emitter.Emit("preferences", st.Preferences())

		case "save_preferences":
			var prefs store.Preferences
			if err := json.Unmarshal(cmd["preferences"], &prefs); err != nil {
				emitter.EmitEngineError("save_preferences: invalid payload")
				continue
			}
			if err := st.SavePreferences(prefs); err != nil {
				emitter.EmitEngineError(fmt.Sprintf("save_preferences: %v", err))
				continue
			}
			emitter.Emit("preferences", st.Preferences())

		case "get_tasks":
			var harnessPath string
			if err := json.Unmarshal(cmd["path"], &harnessPath); err != nil {
				emitter.EmitEngineError("get_tasks: invalid path")
				continue
			}
			tasks, err := task.ReadAll(harnessPath)
			if err != nil {
				emitter.EmitEngineError(fmt.Sprintf("get_tasks: %v", err))
				continue
			}
			emitter.Emit("tasks", tasks)

		case "start":
			var prompt, projectPath string
			if err := json.Unmarshal(cmd["prompt"], &prompt); err != nil {
				emitter.EmitEngineError("start: missing prompt")
				continue
			}
			if err := json.Unmarshal(cmd["project_path"], &projectPath); err != nil {
				emitter.EmitEngineError("start: missing project_path")
				continue
			}
			if err := manager.Start(prompt, projectPath); err != nil {
				emitter.EmitEngineError(fmt.Sprintf("start: %v", err))
			}

		case "pause":
			if err := manager.Pause(); err != nil {
				emitter.EmitEngineError(fmt.Sprintf("pause: %v", err))
			}

		case "resume":
			if err := manager.Resume(); err != nil {
				emitter.EmitEngineError(fmt.Sprintf("resume: %v", err))
			}

		case "kill":
			if err := manager.Kill(); err != nil {
				emitter.EmitEngineError(fmt.Sprintf("kill: %v", err))
			}

		case "ping":
			emitter.Emit("pong", nil)

		default:
			fmt.Fprintf(os.Stderr, "engine: unknown action: %s\n", action)
		}
	}
}

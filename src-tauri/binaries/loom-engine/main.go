package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/loom/engine/audit"
	"github.com/loom/engine/cqc"
	"github.com/loom/engine/diff"
	git "github.com/loom/engine/git"
	"github.com/loom/engine/ipc"
	"github.com/loom/engine/process"
	"github.com/loom/engine/store"
	"github.com/loom/engine/task"
)

// expandPath prepends common binary locations that GUI apps miss on macOS/Linux.
// claude is typically installed via npm/brew into dirs not in the GUI $PATH.
func expandPath() {
	home, _ := os.UserHomeDir()
	extra := []string{
		"/opt/homebrew/bin",
		"/opt/homebrew/sbin",
		"/usr/local/bin",
		"/usr/local/sbin",
		filepath.Join(home, ".npm-packages", "bin"),
		filepath.Join(home, ".local", "bin"),
		filepath.Join(home, "npm", "bin"),
		filepath.Join(home, ".yarn", "bin"),
		"/usr/bin",
		"/bin",
	}
	cur := os.Getenv("PATH")
	parts := strings.Split(cur, string(os.PathListSeparator))
	seen := make(map[string]bool, len(parts))
	for _, p := range parts {
		seen[p] = true
	}
	var add []string
	for _, p := range extra {
		if !seen[p] {
			add = append(add, p)
		}
	}
	if len(add) > 0 {
		os.Setenv("PATH", strings.Join(add, string(os.PathListSeparator))+string(os.PathListSeparator)+cur)
	}
}

// checkDep returns an error message if the named binary is not on PATH.
func checkDep(name string) string {
	lookCmd := "which"
	if runtime.GOOS == "windows" {
		lookCmd = "where"
	}
	if err := exec.Command(lookCmd, name).Run(); err != nil {
		return fmt.Sprintf(
			"%s not found. Please install it and restart Loom. See: https://docs.anthropic.com/claude-code",
			name,
		)
	}
	return ""
}

func main() {
	expandPath()
	emitter := ipc.NewEmitter(os.Stdout)
	manager := process.NewManager(emitter)

	st, err := store.New()
	if err != nil {
		fmt.Fprintf(os.Stderr, "engine: store init error: %v\n", err)
		os.Exit(1)
	}

	emitter.EmitReady()

	// Emit store-reset warning before processing any commands.
	if st.WasReset {
		emitter.Emit("store_reset", nil)
	}

	// Startup dependency checks — emit errors but keep running.
	if msg := checkDep("git"); msg != "" {
		emitter.EmitEngineError("missing_dep:git:" + msg)
	}
	if msg := checkDep("claude"); msg != "" {
		emitter.EmitEngineError("missing_dep:claude:" + msg)
	}

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

		case "remove_project":
			var id string
			if err := json.Unmarshal(cmd["id"], &id); err != nil {
				emitter.EmitEngineError("remove_project: invalid id")
				continue
			}
			if err := st.RemoveProject(id); err != nil {
				emitter.EmitEngineError(fmt.Sprintf("remove_project: %v", err))
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
			var prompt, projectPath, taskID, taskTitle string
			if err := json.Unmarshal(cmd["prompt"], &prompt); err != nil || prompt == "" {
				emitter.EmitEngineError("start: prompt is empty — add a '## Claude Code Context' section or ensure the task file has content")
				continue
			}
			if err := json.Unmarshal(cmd["project_path"], &projectPath); err != nil {
				emitter.EmitEngineError("start: missing project_path")
				continue
			}
			// task_id and task_title are optional — commit message degrades gracefully.
			if raw, ok := cmd["task_id"]; ok {
				json.Unmarshal(raw, &taskID) //nolint:errcheck
			}
			if raw, ok := cmd["task_title"]; ok {
				json.Unmarshal(raw, &taskTitle) //nolint:errcheck
			}

			// Create and checkout a task branch before starting Claude.
			if taskID != "" {
				branchName := git.TaskBranchName(taskID)
				emitter.EmitLogLine("Setting up branch '" + branchName + "'…")
				if err := git.CreateBranch(projectPath, branchName); err != nil {
					// Branch already exists — resume it.
					if err2 := git.CheckoutBranch(projectPath, branchName); err2 != nil {
						emitter.EmitLogLine("warn: could not switch to task branch, continuing on current branch")
					} else {
						emitter.EmitLogLine("✓ Resumed branch '" + branchName + "'")
					}
				} else {
					emitter.EmitLogLine("✓ Created branch '" + branchName + "'")
				}
				branch, _ := git.GetCurrentBranch(projectPath)
				branches, _ := git.ListBranches(projectPath)
				emitter.Emit("git_info", map[string]interface{}{"branch": branch, "branches": branches})

				// Mark the task as in-progress in the file and commit that marker
				// BEFORE Claude runs so it never shows in the diff overlay.
				if relPath, err := task.MarkTaskStarted(projectPath, taskID); err == nil {
					if stageErr := git.StageFile(projectPath, relPath); stageErr == nil {
						if commitErr := git.Commit(projectPath, "chore(loom): start "+taskID); commitErr != nil {
							emitter.EmitLogLine("warn: could not commit task marker: " + commitErr.Error())
						}
					} else {
						emitter.EmitLogLine("warn: could not stage task marker: " + stageErr.Error())
					}
					prompt += "\n\n---\n" +
						"When you have finished implementing everything above, update the task file at `" + relPath + "`:\n" +
						"- Set the **Status** field to `✅ Completed`\n" +
						"- Set the **Completed** date field to today's date (YYYY-MM-DD format)\n" +
						"Make this the very last thing you do."
				} else {
					emitter.EmitLogLine("warn: could not mark task started: " + err.Error())
				}
			}

			if err := manager.Start(prompt, projectPath, taskID, taskTitle); err != nil {
				emitter.EmitEngineError(fmt.Sprintf("start: %v", err))
			}

		case "approve":
			var feedback string
			if raw, ok := cmd["feedback"]; ok {
				json.Unmarshal(raw, &feedback) //nolint:errcheck
			}
			if feedback != "" {
				emitter.EmitLogLine("Note: " + feedback)
			}
			if err := manager.Approve(); err != nil {
				emitter.EmitEngineError(fmt.Sprintf("approve: %v", err))
			}

		case "reject":
			var feedback string
			if raw, ok := cmd["feedback"]; ok {
				json.Unmarshal(raw, &feedback) //nolint:errcheck
			}
			if err := manager.Reject(); err != nil {
				emitter.EmitEngineError(fmt.Sprintf("reject: %v", err))
			}
			if feedback != "" {
				emitter.EmitLogLine("Rejected with note: " + feedback)
				emitter.EmitLogLine("Tip: start a new task with this feedback as context.")
			}

		case "diff_retry":
			path := manager.ProjectPath()
			if path == "" {
				emitter.EmitEngineError("diff_retry: no active project path")
				continue
			}
			sessionID := fmt.Sprintf("retry-%d", len(path))
			raw, err := diff.Extract(path)
			if err == diff.ErrNoDiff {
				emitter.EmitLogLine("warn: no changes detected on retry")
				emitter.EmitDiffReady(diff.DiffPayload{SessionID: sessionID, Files: []diff.DiffFile{}})
			} else if err != nil {
				emitter.EmitEngineError(fmt.Sprintf("diff_retry: %v", err))
			} else {
				payload, parseErr := diff.Parse(raw, sessionID)
				if parseErr != nil {
					emitter.EmitEngineError(fmt.Sprintf("diff_retry parse: %v", parseErr))
				} else {
					emitter.EmitDiffReady(payload)
				}
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
			cancelRunningTest()
			if err := manager.Kill(); err != nil {
				emitter.EmitEngineError(fmt.Sprintf("kill: %v", err))
			}

		case "stop_test":
			cancelRunningTest()
			emitter.Emit("engine_status", "idle")

		case "save_task_history":
			var taskID, projectID, completedAt string
			if err := json.Unmarshal(cmd["task_id"], &taskID); err != nil {
				emitter.EmitEngineError("save_task_history: missing task_id")
				continue
			}
			if raw, ok := cmd["project_id"]; ok {
				json.Unmarshal(raw, &projectID) //nolint:errcheck
			}
			if raw, ok := cmd["completed_at"]; ok {
				json.Unmarshal(raw, &completedAt) //nolint:errcheck
			}
			if err := st.AddTaskHistory(store.TaskHistory{
				TaskID:      taskID,
				ProjectID:   projectID,
				Status:      "completed",
				CompletedAt: completedAt,
			}); err != nil {
				emitter.EmitEngineError(fmt.Sprintf("save_task_history: %v", err))
			}

		case "git_status":
			var projectPath string
			if err := json.Unmarshal(cmd["project_path"], &projectPath); err != nil || projectPath == "" {
				emitter.EmitEngineError("git_status: missing project_path")
				continue
			}
			branch, err := git.GetCurrentBranch(projectPath)
			if err != nil {
				emitter.EmitEngineError(fmt.Sprintf("git_status: %v", err))
				continue
			}
			branches, err := git.ListBranches(projectPath)
			if err != nil {
				emitter.EmitEngineError(fmt.Sprintf("git_status: %v", err))
				continue
			}
			emitter.Emit("git_info", map[string]interface{}{"branch": branch, "branches": branches})

		case "git_checkout":
			var projectPath, branch string
			if err := json.Unmarshal(cmd["project_path"], &projectPath); err != nil || projectPath == "" {
				emitter.EmitEngineError("git_checkout: missing project_path")
				continue
			}
			if err := json.Unmarshal(cmd["branch"], &branch); err != nil || branch == "" {
				emitter.EmitEngineError("git_checkout: missing branch")
				continue
			}
			emitter.EmitLogLine("Switching to branch '" + branch + "'…")
			if err := git.CheckoutBranch(projectPath, branch); err != nil {
				emitter.EmitEngineError(fmt.Sprintf("git_checkout: %v", err))
				continue
			}
			emitter.EmitLogLine("✓ Switched to branch '" + branch + "'")
			branches, err := git.ListBranches(projectPath)
			if err != nil {
				branches = []string{branch}
			}
			emitter.Emit("git_info", map[string]interface{}{"branch": branch, "branches": branches})

		case "git_commit":
			var projectPath, message string
			if err := json.Unmarshal(cmd["project_path"], &projectPath); err != nil || projectPath == "" {
				emitter.EmitEngineError("git_commit: missing project_path")
				continue
			}
			if err := json.Unmarshal(cmd["message"], &message); err != nil || message == "" {
				emitter.EmitEngineError("git_commit: missing message")
				continue
			}
			emitter.EmitLogLine("Committing: " + message)
			hash, err := git.CommitWithMessage(projectPath, message)
			if err != nil {
				emitter.EmitEngineError(fmt.Sprintf("git_commit: %v", err))
				continue
			}
			emitter.EmitLogLine("✓ Committed " + hash[:7])
			emitter.Emit("git_committed", map[string]string{"hash": hash})

		case "git_ssh_unlock":
			var passphrase string
			if raw, ok := cmd["passphrase"]; ok {
				json.Unmarshal(raw, &passphrase) //nolint:errcheck
			}
			if err := git.AddSSHKey(passphrase); err != nil {
				emitter.EmitEngineError(fmt.Sprintf("SSH unlock failed: %v", err))
				continue
			}
			emitter.EmitLogLine("✓ SSH key added to agent")
			emitter.Emit("ssh_unlocked", nil)

		case "git_remote_info":
			var projectPath, branch string
			if err := json.Unmarshal(cmd["project_path"], &projectPath); err != nil || projectPath == "" {
				emitter.EmitEngineError("git_remote_info: missing project_path")
				continue
			}
			if raw, ok := cmd["branch"]; ok {
				json.Unmarshal(raw, &branch) //nolint:errcheck
			}
			url, err := git.GetRemoteURL(projectPath)
			if err != nil {
				emitter.Emit("git_remote_info", map[string]interface{}{"url": "", "ahead": 0, "behind": 0})
				continue
			}
			ahead, behind := git.GetAheadBehind(projectPath, branch)
			emitter.Emit("git_remote_info", map[string]interface{}{
				"url": url, "ahead": ahead, "behind": behind,
			})

		case "git_fetch":
			var projectPath, branch string
			if err := json.Unmarshal(cmd["project_path"], &projectPath); err != nil || projectPath == "" {
				emitter.EmitEngineError("git_fetch: missing project_path")
				continue
			}
			if raw, ok := cmd["branch"]; ok {
				json.Unmarshal(raw, &branch) //nolint:errcheck
			}
			emitter.EmitLogLine("Fetching from origin…")
			if err := git.Fetch(projectPath); err != nil {
				emitter.EmitEngineError(fmt.Sprintf("Fetch failed: %v", err))
				continue
			}
			emitter.EmitLogLine("✓ Fetched from origin")
			url, _ := git.GetRemoteURL(projectPath)
			ahead, behind := git.GetAheadBehind(projectPath, branch)
			emitter.Emit("git_remote_info", map[string]interface{}{
				"url": url, "ahead": ahead, "behind": behind,
			})

		case "git_pull":
			var projectPath, branch, strategy string
			if err := json.Unmarshal(cmd["project_path"], &projectPath); err != nil || projectPath == "" {
				emitter.EmitEngineError("git_pull: missing project_path")
				continue
			}
			if err := json.Unmarshal(cmd["branch"], &branch); err != nil || branch == "" {
				emitter.EmitEngineError("git_pull: missing branch")
				continue
			}
			if raw, ok := cmd["strategy"]; ok {
				json.Unmarshal(raw, &strategy) //nolint:errcheck
			}
			emitter.EmitLogLine("Pulling from origin/" + branch + "…")
			if err := git.Pull(projectPath, branch, strategy); err != nil {
				if err == git.ErrDivergentBranches {
					emitter.Emit("git_pull_diverged", map[string]string{"branch": branch, "project_path": projectPath})
				} else {
					emitter.EmitEngineError(fmt.Sprintf("Pull failed: %v", err))
				}
				continue
			}
			emitter.EmitLogLine("✓ Pulled from origin/" + branch)
			currentBranch, _ := git.GetCurrentBranch(projectPath)
			branches, _ := git.ListBranches(projectPath)
			emitter.Emit("git_info", map[string]interface{}{"branch": currentBranch, "branches": branches})
			url, _ := git.GetRemoteURL(projectPath)
			ahead, behind := git.GetAheadBehind(projectPath, branch)
			emitter.Emit("git_remote_info", map[string]interface{}{
				"url": url, "ahead": ahead, "behind": behind,
			})

		case "git_push":
			var projectPath, branch string
			if err := json.Unmarshal(cmd["project_path"], &projectPath); err != nil || projectPath == "" {
				emitter.EmitEngineError("git_push: missing project_path")
				continue
			}
			if err := json.Unmarshal(cmd["branch"], &branch); err != nil || branch == "" {
				emitter.EmitEngineError("git_push: missing branch")
				continue
			}
			emitter.EmitLogLine("Pushing to origin/" + branch + "…")
			if err := git.Push(projectPath, branch); err != nil {
				emitter.EmitEngineError(fmt.Sprintf("Push failed: %v", err))
				continue
			}
			emitter.EmitLogLine("✓ Pushed to origin/" + branch)
			url, _ := git.GetRemoteURL(projectPath)
			ahead, behind := git.GetAheadBehind(projectPath, branch)
			emitter.Emit("git_remote_info", map[string]interface{}{
				"url": url, "ahead": ahead, "behind": behind,
			})

		case "git_create_branch":
			var projectPath, branch string
			if err := json.Unmarshal(cmd["project_path"], &projectPath); err != nil || projectPath == "" {
				emitter.EmitEngineError("git_create_branch: missing project_path")
				continue
			}
			if err := json.Unmarshal(cmd["branch"], &branch); err != nil || branch == "" {
				emitter.EmitEngineError("git_create_branch: missing branch name")
				continue
			}
			emitter.EmitLogLine("Creating branch '" + branch + "'…")
			if err := git.CreateBranch(projectPath, branch); err != nil {
				emitter.EmitEngineError(fmt.Sprintf("git_create_branch: %v", err))
				continue
			}
			emitter.EmitLogLine("✓ Created and switched to '" + branch + "'")
			branches, err := git.ListBranches(projectPath)
			if err != nil {
				branches = []string{branch}
			}
			emitter.Emit("git_info", map[string]interface{}{"branch": branch, "branches": branches})

		case "harness_chat":
			emitter.EmitHarnessLogLine("⚙ Starting chat…")
			var message, projectPath string
			if err := json.Unmarshal(cmd["message"], &message); err != nil || message == "" {
				emitter.EmitHarnessLogLine("Error: missing message field")
				emitter.Emit("harness_done", nil)
				continue
			}
			if err := json.Unmarshal(cmd["project_path"], &projectPath); err != nil || projectPath == "" {
				emitter.EmitHarnessLogLine("Error: missing project_path")
				emitter.Emit("harness_done", nil)
				continue
			}
			var history []histMsg
			if raw, ok := cmd["history"]; ok {
				json.Unmarshal(raw, &history) //nolint:errcheck
			}
			go runHarnessChat(emitter, message, projectPath, history)

		case "gh_check":
			cmd := exec.Command("which", "gh")
			emitter.Emit("gh_available", map[string]bool{"available": cmd.Run() == nil})

		case "gh_default_branch":
			var projectPath string
			if err := json.Unmarshal(cmd["project_path"], &projectPath); err != nil || projectPath == "" {
				emitter.Emit("gh_default_branch", map[string]string{"branch": "main"})
				continue
			}
			out, err := exec.Command("gh", "repo", "view", "--json", "defaultBranchRef", "--jq", ".defaultBranchRef.name").CombinedOutput()
			branch := strings.TrimSpace(string(out))
			if err != nil || branch == "" {
				branch = "main"
			}
			emitter.Emit("gh_default_branch", map[string]string{"branch": branch})

		case "git_log_branch":
			var projectPath, base string
			if err := json.Unmarshal(cmd["project_path"], &projectPath); err != nil || projectPath == "" {
				emitter.EmitEngineError("git_log_branch: missing project_path")
				continue
			}
			if raw, ok := cmd["base"]; ok {
				json.Unmarshal(raw, &base) //nolint:errcheck
			}
			if base == "" {
				base = "main"
			}
			// Try origin/<base> first; fall back to local <base> if the remote ref doesn't exist.
			var commits []string
			for _, ref := range []string{"origin/" + base, base} {
				gitCmd := exec.Command("git", "log", ref+"..HEAD", "--oneline", "--no-decorate")
				gitCmd.Dir = projectPath
				out, err := gitCmd.Output()
				if err != nil {
					continue
				}
				for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
					if line = strings.TrimSpace(line); line != "" {
						commits = append(commits, line)
					}
				}
				break
			}
			if commits == nil {
				commits = []string{}
			}
			emitter.Emit("git_log_branch_result", map[string]interface{}{"commits": commits})

		case "git_branch_pushed":
			var projectPath, branch string
			if err := json.Unmarshal(cmd["project_path"], &projectPath); err != nil || projectPath == "" {
				emitter.EmitEngineError("git_branch_pushed: missing project_path")
				continue
			}
			if raw, ok := cmd["branch"]; ok {
				json.Unmarshal(raw, &branch) //nolint:errcheck
			}
			// Check both ls-remote (needs network) and local remote-tracking ref (fast, offline).
			localRef := exec.Command("git", "rev-parse", "--verify", "refs/remotes/origin/"+branch)
			localRef.Dir = projectPath
			pushed := localRef.Run() == nil
			if !pushed {
				// Fallback: ls-remote for authoritative check
				lsCmd := exec.Command("git", "ls-remote", "--heads", "origin", branch)
				lsCmd.Dir = projectPath
				out, _ := lsCmd.Output()
				pushed = strings.TrimSpace(string(out)) != ""
			}
			emitter.Emit("git_branch_pushed_result", map[string]bool{"pushed": pushed})

		case "gh_pr_create":
			var projectPath, title, body, base string
			var draft bool
			if err := json.Unmarshal(cmd["project_path"], &projectPath); err != nil || projectPath == "" {
				emitter.EmitEngineError("gh_pr_create: missing project_path")
				continue
			}
			if err := json.Unmarshal(cmd["title"], &title); err != nil || title == "" {
				emitter.EmitEngineError("gh_pr_create: missing title")
				continue
			}
			if raw, ok := cmd["body"]; ok { json.Unmarshal(raw, &body) }         //nolint:errcheck
			if raw, ok := cmd["base"]; ok { json.Unmarshal(raw, &base) }         //nolint:errcheck
			if raw, ok := cmd["draft"]; ok { json.Unmarshal(raw, &draft) }       //nolint:errcheck
			if base == "" { base = "main" }
			args := []string{"pr", "create", "--title", title, "--body", body, "--base", base}
			if draft { args = append(args, "--draft") }
			ghCmd := exec.Command("gh", args...)
			ghCmd.Dir = projectPath
			out, err := ghCmd.CombinedOutput()
			result := strings.TrimSpace(string(out))
			if err != nil {
				emitter.EmitEngineError("PR creation failed: " + result)
				continue
			}
			// Extract URL from output (gh prints the PR URL as the last line)
			lines := strings.Split(result, "\n")
			url := strings.TrimSpace(lines[len(lines)-1])
			emitter.Emit("gh_pr_created", map[string]string{"url": url})

		case "gh_pr_list":
			var projectPath string
			if err := json.Unmarshal(cmd["project_path"], &projectPath); err != nil || projectPath == "" {
				emitter.EmitEngineError("gh_pr_list: missing project_path")
				continue
			}
			ghCmd := exec.Command("gh", "pr", "list", "--json", "number,title,headRefName,state,url")
			ghCmd.Dir = projectPath
			out, err := ghCmd.Output()
			if err != nil {
				emitter.Emit("gh_pr_list_result", map[string]interface{}{"prs": []interface{}{}})
				continue
			}
			var prs []json.RawMessage
			if json.Unmarshal(out, &prs) != nil {
				prs = []json.RawMessage{}
			}
			emitter.Emit("gh_pr_list_result", map[string]interface{}{"prs": prs})

		case "get_templates":
			emitter.Emit("templates", st.Templates())

		case "save_template":
			var t store.HarnessTemplate
			if err := json.Unmarshal(cmd["template"], &t); err != nil {
				emitter.EmitEngineError("save_template: invalid payload")
				continue
			}
			if err := st.SaveTemplate(t); err != nil {
				emitter.EmitEngineError(fmt.Sprintf("save_template: %v", err))
				continue
			}
			emitter.Emit("templates", st.Templates())

		case "delete_template":
			var id string
			if err := json.Unmarshal(cmd["id"], &id); err != nil {
				emitter.EmitEngineError("delete_template: invalid id")
				continue
			}
			if err := st.DeleteTemplate(id); err != nil {
				emitter.EmitEngineError(fmt.Sprintf("delete_template: %v", err))
				continue
			}
			emitter.Emit("templates", st.Templates())

		case "run_test_case":
			var projectPath, testID string
			if err := json.Unmarshal(cmd["project_path"], &projectPath); err != nil || projectPath == "" {
				emitter.EmitEngineError("run_test_case: missing project_path")
				continue
			}
			if err := json.Unmarshal(cmd["test_id"], &testID); err != nil || testID == "" {
				emitter.EmitEngineError("run_test_case: missing test_id")
				continue
			}
			go runTestCase(emitter, projectPath, testID)

		case "run_all_test_cases":
			var projectPath string
			var testIDs []string
			if err := json.Unmarshal(cmd["project_path"], &projectPath); err != nil || projectPath == "" {
				emitter.EmitEngineError("run_all_test_cases: missing project_path")
				continue
			}
			if raw, ok := cmd["test_ids"]; ok {
				json.Unmarshal(raw, &testIDs) //nolint:errcheck
			}
			go runAllTestCases(emitter, projectPath, testIDs)

		case "generate_and_run_test":
			var projectPath, testID, filePath string
			if err := json.Unmarshal(cmd["project_path"], &projectPath); err != nil || projectPath == "" {
				emitter.EmitEngineError("generate_and_run_test: missing project_path")
				continue
			}
			if err := json.Unmarshal(cmd["test_id"], &testID); err != nil || testID == "" {
				emitter.EmitEngineError("generate_and_run_test: missing test_id")
				continue
			}
			if err := json.Unmarshal(cmd["file_path"], &filePath); err != nil || filePath == "" {
				emitter.EmitEngineError("generate_and_run_test: missing file_path")
				continue
			}
			var headed bool
			if raw, ok := cmd["headed"]; ok {
				json.Unmarshal(raw, &headed) //nolint:errcheck
			}
			var linkedTaskID string
			if raw, ok := cmd["linked_task"]; ok {
				json.Unmarshal(raw, &linkedTaskID) //nolint:errcheck
			}
			go generateAndRunTest(emitter, projectPath, testID, filePath, linkedTaskID, headed)

		case "generate_test":
			var projectPath, testID, filePath string
			if err := json.Unmarshal(cmd["project_path"], &projectPath); err != nil || projectPath == "" {
				emitter.EmitEngineError("generate_test: missing project_path")
				continue
			}
			if err := json.Unmarshal(cmd["test_id"], &testID); err != nil || testID == "" {
				emitter.EmitEngineError("generate_test: missing test_id")
				continue
			}
			if err := json.Unmarshal(cmd["file_path"], &filePath); err != nil || filePath == "" {
				emitter.EmitEngineError("generate_test: missing file_path")
				continue
			}
			var headed bool
			if raw, ok := cmd["headed"]; ok {
				json.Unmarshal(raw, &headed) //nolint:errcheck
			}
			var linkedTaskID string
			if raw, ok := cmd["linked_task"]; ok {
				json.Unmarshal(raw, &linkedTaskID) //nolint:errcheck
			}
			go generateTestOnly(emitter, projectPath, testID, filePath, linkedTaskID, headed)

		case "rerun_test":
			var projectPath, testID, filePath string
			if err := json.Unmarshal(cmd["project_path"], &projectPath); err != nil || projectPath == "" {
				emitter.EmitEngineError("rerun_test: missing project_path")
				continue
			}
			if err := json.Unmarshal(cmd["test_id"], &testID); err != nil || testID == "" {
				emitter.EmitEngineError("rerun_test: missing test_id")
				continue
			}
			if err := json.Unmarshal(cmd["file_path"], &filePath); err != nil || filePath == "" {
				emitter.EmitEngineError("rerun_test: missing file_path")
				continue
			}
			var headed bool
			if raw, ok := cmd["headed"]; ok {
				json.Unmarshal(raw, &headed) //nolint:errcheck
			}
			go rerunTest(emitter, projectPath, testID, filePath, headed)

		// ── CQC actions ──────────────────────────────────────────────────────
		case "cqc_list_clients":
			var projectPath string
			if err := json.Unmarshal(cmd["project_path"], &projectPath); err != nil || projectPath == "" {
				emitter.EmitEngineError("cqc_list_clients: missing project_path")
				continue
			}
			clients, err := cqc.ListClients(projectPath)
			if err != nil {
				emitter.EmitEngineError("cqc_list_clients: " + err.Error())
				continue
			}
			emitter.Emit("cqc_clients", clients)

		case "cqc_save_client":
			var projectPath string
			if err := json.Unmarshal(cmd["project_path"], &projectPath); err != nil || projectPath == "" {
				emitter.EmitEngineError("cqc_save_client: missing project_path")
				continue
			}
			var client cqc.Client
			if err := json.Unmarshal(cmd["client"], &client); err != nil {
				emitter.EmitEngineError("cqc_save_client: invalid client payload")
				continue
			}
			saved, err := cqc.SaveClient(projectPath, client)
			if err != nil {
				emitter.EmitEngineError("cqc_save_client: " + err.Error())
				continue
			}
			clients, _ := cqc.ListClients(projectPath)
			emitter.Emit("cqc_clients", clients)
			emitter.Emit("cqc_client_saved", saved)

		case "cqc_delete_client":
			var projectPath, id string
			if err := json.Unmarshal(cmd["project_path"], &projectPath); err != nil || projectPath == "" {
				emitter.EmitEngineError("cqc_delete_client: missing project_path")
				continue
			}
			if err := json.Unmarshal(cmd["id"], &id); err != nil || id == "" {
				emitter.EmitEngineError("cqc_delete_client: missing id")
				continue
			}
			if err := cqc.DeleteClient(projectPath, id); err != nil {
				emitter.EmitEngineError("cqc_delete_client: " + err.Error())
				continue
			}
			clients, _ := cqc.ListClients(projectPath)
			emitter.Emit("cqc_clients", clients)

		case "cqc_run_text_check":
			var projectPath, user, text string
			if err := json.Unmarshal(cmd["project_path"], &projectPath); err != nil || projectPath == "" {
				emitter.EmitEngineError("cqc_run_text_check: missing project_path")
				continue
			}
			json.Unmarshal(cmd["user"], &user)   //nolint:errcheck
			json.Unmarshal(cmd["text"], &text)   //nolint:errcheck
			var client cqc.Client
			if err := json.Unmarshal(cmd["client"], &client); err != nil {
				emitter.EmitEngineError("cqc_run_text_check: invalid client payload")
				continue
			}
			go func() {
				result, err := cqc.RunTextCheck(emitter, projectPath, client, text, user)
				if err != nil {
					emitter.EmitEngineError("cqc_check_failed: " + err.Error())
					emitter.Emit("cqc_check_error", map[string]interface{}{"error": err.Error()})
					return
				}
				emitter.Emit("cqc_check_result", result)
				// Refresh the log list so the Log tab shows the new entry immediately.
				if entries, err2 := cqc.ListLog(projectPath, 100); err2 == nil {
					emitter.Emit("cqc_log", entries)
				}
			}()

		case "cqc_run_image_check":
			emitter.EmitEngineError("cqc_check_failed: image check is not yet implemented (Phase 2)")

		case "cqc_list_log":
			var projectPath string
			if err := json.Unmarshal(cmd["project_path"], &projectPath); err != nil || projectPath == "" {
				emitter.EmitEngineError("cqc_list_log: missing project_path")
				continue
			}
			limit := 100
			if raw, ok := cmd["limit"]; ok {
				var l int
				if json.Unmarshal(raw, &l) == nil && l > 0 {
					limit = l
				}
			}
			entries, err := cqc.ListLog(projectPath, limit)
			if err != nil {
				emitter.EmitEngineError("cqc_list_log: " + err.Error())
				continue
			}
			emitter.Emit("cqc_log", entries)

		case "ping":
			emitter.Emit("pong", nil)

		default:
			if strings.HasPrefix(action, "audit_") {
				handleAuditAction(action, cmd, emitter)
			} else {
				fmt.Fprintf(os.Stderr, "engine: unknown action: %s\n", action)
			}
		}
	}
}

func npxBin() string {
	if runtime.GOOS == "windows" {
		return "npx.cmd"
	}
	return "npx"
}

func runTestCase(emitter *ipc.Emitter, projectPath, testID string) {
	emitter.Emit("test_status", map[string]interface{}{"test_id": testID, "status": "running"})
	emitter.EmitLogLine(fmt.Sprintf("[%s] Running Playwright…", testID))

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	npx := npxBin()
	c := exec.CommandContext(ctx, npx, "playwright", "test", "--grep", testID, "--reporter=line")
	c.Dir = projectPath
	c.Env = append(os.Environ(), "CI=true")

	start := time.Now()
	passed, output := streamCmd(ctx, emitter, c)
	duration := fmt.Sprintf("%.1fs", time.Since(start).Seconds())

	if ctx.Err() != nil {
		emitter.EmitLogLine(fmt.Sprintf("✗ %s timed out after 30s", testID))
		emitter.Emit("test_status", map[string]interface{}{"test_id": testID, "status": "failed", "duration": duration, "error": "Timed out after 30s"})
		return
	}

	if !passed {
		if strings.Contains(output, "not found") || strings.Contains(output, "No such file") {
			emitter.EmitEngineError("missing_dep:playwright:Playwright not found. Run: npx playwright install")
		}
		emitter.EmitLogLine(fmt.Sprintf("✗ %s failed (%s)", testID, duration))
		emitter.Emit("test_status", map[string]interface{}{"test_id": testID, "status": "failed", "duration": duration, "error": output})
		return
	}
	emitter.EmitLogLine(fmt.Sprintf("✓ %s passed (%s)", testID, duration))
	emitter.Emit("test_status", map[string]interface{}{"test_id": testID, "status": "passed", "duration": duration})
}

func runAllTestCases(emitter *ipc.Emitter, projectPath string, testIDs []string) {
	total := len(testIDs)
	emitter.Emit("test_run_started", map[string]interface{}{"total": total})
	start := time.Now()

	passed := 0
	failed := 0
	var failedTests []map[string]string

	for _, id := range testIDs {
		emitter.Emit("test_status", map[string]interface{}{"test_id": id, "status": "running"})
		emitter.EmitLogLine(fmt.Sprintf("[%d/%d] %s — running…", passed+failed+1, total, id))
		tStart := time.Now()

		tCtx, tCancel := context.WithTimeout(context.Background(), 30*time.Second)
		npx := npxBin()
		c := exec.CommandContext(tCtx, npx, "playwright", "test", "--grep", id, "--reporter=line")
		c.Dir = projectPath
		c.Env = append(os.Environ(), "CI=true")

		ok, output := streamCmd(tCtx, emitter, c)
		dur := fmt.Sprintf("%.1fs", time.Since(tStart).Seconds())
		timedOut := tCtx.Err() != nil
		tCancel()

		if timedOut {
			failed++
			emitter.EmitLogLine(fmt.Sprintf("✗ %s timed out", id))
			emitter.Emit("test_status", map[string]interface{}{"test_id": id, "status": "failed", "duration": dur, "error": "Timed out after 30s"})
			failedTests = append(failedTests, map[string]string{"id": id, "error": "Timed out after 30s"})
			continue
		}

		if !ok {
			failed++
			if strings.Contains(output, "not found") || strings.Contains(output, "No such file") {
				emitter.EmitEngineError("missing_dep:playwright:Playwright not found. Run: npx playwright install")
				emitter.Emit("test_status", map[string]interface{}{"test_id": id, "status": "failed", "duration": dur, "error": output})
				failedTests = append(failedTests, map[string]string{"id": id, "error": output})
				break
			}
			emitter.EmitLogLine(fmt.Sprintf("✗ %s failed (%s)", id, dur))
			emitter.Emit("test_status", map[string]interface{}{"test_id": id, "status": "failed", "duration": dur, "error": output})
			failedTests = append(failedTests, map[string]string{"id": id, "error": output})
		} else {
			passed++
			emitter.EmitLogLine(fmt.Sprintf("✓ %s passed (%s)", id, dur))
			emitter.Emit("test_status", map[string]interface{}{"test_id": id, "status": "passed", "duration": dur})
		}
	}

	if failedTests == nil {
		failedTests = []map[string]string{}
	}
	passRate := 0
	if total > 0 {
		passRate = (passed * 100) / total
	}
	emitter.Emit("test_run_complete", map[string]interface{}{
		"total":        total,
		"passed":       passed,
		"failed":       failed,
		"duration":     fmt.Sprintf("%.1fs", time.Since(start).Seconds()),
		"pass_rate":    passRate,
		"failed_tests": failedTests,
	})
}

// streamCmd runs cmd and emits each stdout/stderr line as a log_line event.
// Returns (passed, lastOutput) where lastOutput holds the tail for error reporting.
func streamCmd(ctx context.Context, emitter *ipc.Emitter, c *exec.Cmd) (bool, string) {
	stdout, err := c.StdoutPipe()
	if err != nil {
		return false, err.Error()
	}
	stderr, err := c.StderrPipe()
	if err != nil {
		return false, err.Error()
	}
	if err := c.Start(); err != nil {
		return false, err.Error()
	}

	var mu sync.Mutex
	// tail: last 300 lines (covers large Playwright runs with retries)
	// keyLines: lines matching error patterns, kept regardless of position
	var tail []string
	var keyLines []string
	var wg sync.WaitGroup

	scan := func(r interface{ Read([]byte) (int, error) }) {
		defer wg.Done()
		sc := bufio.NewScanner(r)
		for sc.Scan() {
			line := sc.Text()
			if line == "" {
				continue
			}
			emitter.EmitLogLine(line)
			clean := ansiRE.ReplaceAllString(line, "")
			mu.Lock()
			tail = append(tail, clean)
			if len(tail) > 300 {
				tail = tail[len(tail)-300:]
			}
			// Keep important diagnostic lines regardless of buffer position.
			for _, pat := range []string{
				"ERR_CONNECTION_REFUSED", "ECONNREFUSED", "net::",
				"SyntaxError", "Cannot find module", "ERR_MODULE_NOT_FOUND",
				"Error:", "error:", "FAILED", "✗",
			} {
				if strings.Contains(clean, pat) {
					keyLines = append(keyLines, clean)
					break
				}
			}
			mu.Unlock()
		}
	}

	wg.Add(2)
	go scan(stdout)
	go scan(stderr)
	wg.Wait()

	runErr := c.Wait()
	if ctx.Err() != nil {
		return false, "Timed out"
	}
	mu.Lock()
	combined := strings.Join(keyLines, "\n") + "\n" + strings.Join(tail, "\n")
	mu.Unlock()
	return runErr == nil, combined
}


// buildGenerationPrompt constructs the focused prompt for Claude call #1.
// Claude's only job: write the .spec.ts and playwright.config.ts files.
func buildGenerationPrompt(testID, testCaseContent, taskContent string, headed bool) string {
	featureSection := "No linked task provided."
	if taskContent != "" {
		featureSection = taskContent
	}
	headedConfig := ""
	if headed {
		headedConfig = "\n   - Set: use: { headless: false, launchOptions: { slowMo: 600 } }"
	}
	return "You are a QA engineer. Write two files IMMEDIATELY. Do NOT read any source files.\n" +
		"Do NOT explore the codebase. Do NOT run any commands. Just write the files now.\n\n" +

		"## Everything you need is below — do not look for more information\n\n" +

		"### Feature Under Test\n\n" +
		featureSection + "\n\n" +

		"### Test Case Specification\n\n" +
		testCaseContent + "\n\n" +

		"## Step 1 — Write .loom-generated/" + testID + ".spec.ts\n\n" +
		"Rules:\n" +
		"- import { test, expect } from '@playwright/test';\n" +
		"- Wrap ALL steps in: test.describe.serial('" + testID + "', () => { ... })\n" +
		"- Every test() name MUST contain \"" + testID + "\"\n" +
		"- One test() block per numbered step in the test case\n" +
		"- FRONTEND/UI: use page.goto(), page.click(), page.fill(), expect(locator).toBeVisible()\n" +
		"- BACKEND/API: use the `request` fixture — NOT curl inside test bodies\n" +
		"- Declare shared variables (tokens, IDs) with `let` at describe scope\n" +
		"- Locator priority: 1) getByRole  2) getByText/getByLabel  3) data-testid (only if\n" +
		"  confirmed present in the component source)  — NEVER invent data-testid values\n" +
		"- For UI steps that require SMS/OTP: intercept the API with page.route() and return\n" +
		"  a mock response { data: { message: 'OTP sent' } } so no real SMS is needed.\n" +
		"  For OTP verify steps: similarly mock POST /auth/otp/verify to return tokens.\n\n" +

		"## Step 2 — Write .loom-generated/playwright.config.ts\n\n" +
		"- baseURL: http://localhost:3000 (or the port from the test case preconditions)\n" +
		"- Find the dev server start command from the preconditions section of the test case\n" +
		"- Add webServer block — ALWAYS include `reuseExistingServer: true` so Playwright\n" +
		"  reuses a server that is already running instead of failing with EADDRINUSE\n" +
		"- retries: 0  (serial tests must not retry — a retry reruns all steps from the start)\n" +
		"- workers: 1" + headedConfig + "\n\n" +

		"## Step 3 — Output the marker\n\n" +
		"After writing both files, output EXACTLY this on its own line and nothing else:\n" +
		"LOOM:GENERATED\n"
}

// buildDiagnosisPrompt constructs the focused prompt for Claude call #2.
// Claude's only job: classify the failure and output a structured block.
func buildDiagnosisPrompt(testID, testOutput string) string {
	return "Playwright test \"" + testID + "\" failed. Classify this failure as exactly one of:\n\n" +
		"  [ENV]  — infrastructure issue (server down, connection refused, missing env var)\n" +
		"  [TEST] — test script bug (wrong selector, bad assertion, wrong URL in the spec)\n" +
		"  [BUG]  — real application bug (server returned wrong status code or response body)\n\n" +
		"Output this exact block (no other text):\n" +
		"LOOM:FAILURE_DETAILS_START\n" +
		"Category: [ENV|TEST|BUG]\n" +
		"Root cause: <one clear sentence>\n" +
		"Expected: <what should have happened>\n" +
		"Actual: <what actually happened>\n" +
		"LOOM:FAILURE_DETAILS_END\n" +
		"LOOM:FAILED\n\n" +
		"Test output:\n" + testOutput
}

// classifyFailure does cheap string-match pre-classification before invoking Claude.
func classifyFailure(output string) string {
	// ENV: server not reachable or port conflict
	envPatterns := []string{
		"ECONNREFUSED", "ERR_CONNECTION_REFUSED",
		"net::ERR_CONNECTION_REFUSED", // Playwright Chromium format
		"connect ECONNREFUSED",
		"ETIMEDOUT", "ENOTFOUND", "ERR_NETWORK_CHANGED",
		"EADDRINUSE", "address already in use", // port conflict
		"is already in use",
	}
	for _, p := range envPatterns {
		if strings.Contains(output, p) {
			return "ENV"
		}
	}
	// TEST: spec file is broken (not an app bug)
	testPatterns := []string{
		"Cannot find module", "ERR_MODULE_NOT_FOUND",
		"SyntaxError", "ReferenceError: ",
		"is not a function", "is not defined",
	}
	for _, p := range testPatterns {
		if strings.Contains(output, p) {
			return "TEST"
		}
	}
	return "BUG"
}

// diagnosisCategory parses the "Category: [ENV|TEST|BUG]" line from a
// LOOM:FAILURE_DETAILS block, so Claude's diagnosis can override a BUG
// classification and avoid creating false-positive bug reports.
func diagnosisCategory(failureDetails string) string {
	for _, line := range strings.Split(failureDetails, "\n") {
		t := strings.TrimSpace(line)
		if strings.HasPrefix(t, "Category:") {
			cat := strings.TrimSpace(strings.TrimPrefix(t, "Category:"))
			cat = strings.Trim(cat, "[]")
			return strings.ToUpper(cat)
		}
	}
	return "BUG"
}

// last100Lines returns the last 100 lines of s (or all of s if shorter).
func last100Lines(s string) string {
	lines := strings.Split(s, "\n")
	if len(lines) <= 100 {
		return s
	}
	return strings.Join(lines[len(lines)-100:], "\n")
}

var ansiRE = regexp.MustCompile(`\x1b\[[0-9;]*[A-Za-z]`)

// stripANSI removes ANSI terminal escape codes from s.
func stripANSI(s string) string {
	return ansiRE.ReplaceAllString(s, "")
}

// runGeneration executes Phase A (pre-checks) and Phase B (Claude spec generation).
// Returns true if the spec was generated successfully (LOOM:GENERATED found).
func runGeneration(ctx context.Context, emitter *ipc.Emitter, projectPath, testID, filePath, linkedTaskID string, headed bool) bool {
	// Phase A: pre-checks
	if _, err := exec.LookPath(npxBin()); err != nil {
		emitter.EmitEngineError("missing_dep:npx:npx not found — install Node.js and ensure it is on PATH")
		return false
	}
	if out, err := exec.Command(npxBin(), "playwright", "--version").Output(); err != nil {
		emitter.EmitLogLine("⚠ Playwright not installed — Claude will install it during generation")
	} else {
		emitter.EmitLogLine("Playwright " + strings.TrimSpace(string(out)))
	}

	// Read files
	testCaseBytes, err := os.ReadFile(filePath)
	if err != nil {
		emitter.EmitLogLine("✗ Cannot read test case: " + err.Error())
		return false
	}
	taskContent := task.GetLinkedTaskContent(projectPath, linkedTaskID)
	if taskContent != "" {
		emitter.EmitLogLine(fmt.Sprintf("📋 Loaded linked task: %s", linkedTaskID))
	}

	// Phase B: Claude generation (streamed, 5 min)
	emitter.EmitLogLine("⟳ Generating Playwright test…")
	genCtx, genCancel := context.WithTimeout(ctx, 5*time.Minute)
	defer genCancel()

	genCmd := exec.CommandContext(genCtx,
		"claude",
		"--dangerously-skip-permissions",
		"--print",
		"--verbose",
		"--output-format", "stream-json",
		buildGenerationPrompt(testID, string(testCaseBytes), taskContent, headed),
	)
	genCmd.Dir = projectPath
	genCmd.Env = append(os.Environ(), "PATH="+os.Getenv("PATH"))

	genStdout, err := genCmd.StdoutPipe()
	if err != nil {
		emitter.EmitLogLine("✗ " + err.Error())
		return false
	}
	genStderr, err := genCmd.StderrPipe()
	if err != nil {
		emitter.EmitLogLine("✗ " + err.Error())
		return false
	}
	if err := genCmd.Start(); err != nil {
		emitter.EmitLogLine("✗ Cannot start Claude: " + err.Error())
		return false
	}

	var genRaw bytes.Buffer
	process.NewStreamer(io.TeeReader(genStdout, &genRaw), genStderr).Stream(emitter)
	genCmd.Wait() //nolint:errcheck

	if !strings.Contains(genRaw.String(), "LOOM:GENERATED") {
		emitter.EmitLogLine("✗ Generation failed — LOOM:GENERATED marker not found")
		return false
	}
	emitter.EmitLogLine("✓ Test spec generated")
	return true
}

// runPlaywright executes npx playwright test for testID and returns (passed, cleanOutput).
func runPlaywright(ctx context.Context, emitter *ipc.Emitter, projectPath, testID string, headed bool) (bool, string) {
	args := []string{
		"playwright", "test",
		".loom-generated/" + testID + ".spec.ts",
		"--config", ".loom-generated/playwright.config.ts",
		"--reporter=line",
	}
	if headed {
		args = append(args, "--headed")
	}
	c := exec.CommandContext(ctx, npxBin(), args...)
	c.Dir = projectPath
	c.Env = append(os.Environ(), "CI=true")
	passed, out := streamCmd(ctx, emitter, c)
	return passed, stripANSI(out)
}

// fixEnvWithClaude asks Claude to start the required server when an ENV failure is
// detected. Returns true if Claude outputs LOOM:SERVER_READY within 3 minutes.
func fixEnvWithClaude(ctx context.Context, emitter *ipc.Emitter, projectPath, failureOutput string) bool {
	emitter.EmitLogLine("⟳ Asking Claude to start the required server…")

	prompt := "You are a dev-environment engineer. A Playwright test failed due to an environment issue.\n\n" +
		"Issue details:\n" + last100Lines(failureOutput) + "\n\n" +
		"Fix the issue by doing exactly ONE of these:\n\n" +
		"A. WRONG PORT / WRONG CONFIG — if the playwright config points to the wrong port or URL:\n" +
		"   - Read .loom-generated/playwright.config.ts and identify the wrong baseURL\n" +
		"   - Read package.json / .env to find the correct frontend dev server port\n" +
		"   - Update .loom-generated/playwright.config.ts with the correct baseURL\n\n" +
		"B. SERVER NOT RUNNING — if the correct server is simply not started:\n" +
		"   - Read package.json (and any workspace config) for the start command\n" +
		"   - Start it in the background: <start-command> &\n" +
		"   - Wait for it: for i in $(seq 1 30); do curl -s http://localhost:<PORT> > /dev/null && break; sleep 1; done\n\n" +
		"After fixing, verify the correct server is responding, then output exactly: LOOM:SERVER_READY\n" +
		"If you cannot fix it, output exactly: LOOM:SERVER_FAILED and explain why.\n\n" +
		"Do NOT install dependencies. Do NOT run Playwright yourself. Fix the environment only.\n"

	fixCtx, fixCancel := context.WithTimeout(ctx, 3*time.Minute)
	defer fixCancel()

	fixCmd := exec.CommandContext(fixCtx,
		"claude", "--dangerously-skip-permissions", "--print", "--verbose",
		"--output-format", "stream-json", prompt)
	fixCmd.Dir = projectPath

	var fixRaw bytes.Buffer
	fixStdout, err := fixCmd.StdoutPipe()
	if err != nil {
		emitter.EmitLogLine("⚠ Cannot start Claude for env fix: " + err.Error())
		return false
	}
	fixStderr, _ := fixCmd.StderrPipe()
	if err := fixCmd.Start(); err != nil {
		emitter.EmitLogLine("⚠ Cannot start Claude for env fix: " + err.Error())
		return false
	}
	process.NewStreamer(io.TeeReader(fixStdout, &fixRaw), fixStderr).Stream(emitter)
	fixCmd.Wait() //nolint:errcheck

	return strings.Contains(fixRaw.String(), "LOOM:SERVER_READY")
}

// runDiagnose runs the test, attempts ENV auto-fix + retry on first failure,
// then diagnoses and reports any remaining failure.
// Used by both generateAndRunTest and rerunTest.
func runDiagnose(ctx context.Context, emitter *ipc.Emitter, projectPath, testID, filePath string, headed bool) {
	emitter.EmitLogLine("⟳ Running Playwright tests…")
	passed, cleanOutput := runPlaywright(ctx, emitter, projectPath, testID, headed)

	if passed {
		emitter.EmitLogLine(fmt.Sprintf("✓ %s passed", testID))
		updateTestCaseResult(filePath, "passed")
		emitter.Emit("test_status", map[string]interface{}{"test_id": testID, "status": "passed"})
		return
	}

	emitter.EmitLogLine(fmt.Sprintf("✗ %s failed", testID))
	category := classifyFailure(cleanOutput)

	// ENV: try to auto-fix (start the server) then retry once.
	if category == "ENV" {
		if fixEnvWithClaude(ctx, emitter, projectPath, cleanOutput) {
			emitter.EmitLogLine("✓ Server started — retrying test…")
			passed, cleanOutput = runPlaywright(ctx, emitter, projectPath, testID, headed)
			if passed {
				emitter.EmitLogLine(fmt.Sprintf("✓ %s passed", testID))
				updateTestCaseResult(filePath, "passed")
				emitter.Emit("test_status", map[string]interface{}{"test_id": testID, "status": "passed"})
				return
			}
			emitter.EmitLogLine(fmt.Sprintf("✗ %s still failing after server fix", testID))
			category = classifyFailure(cleanOutput)
		} else {
			emitter.EmitLogLine("✗ Could not start server — check the project's dev server command")
			updateTestCaseResult(filePath, "failed")
			emitter.Emit("test_status", map[string]interface{}{"test_id": testID, "status": "failed"})
			return
		}
	}

	switch category {
	case "ENV":
		emitter.EmitLogLine("⚠ Environment failure persists after fix attempt — check server manually")
		updateTestCaseResult(filePath, "failed")
		emitter.Emit("test_status", map[string]interface{}{"test_id": testID, "status": "failed"})
		return
	case "TEST":
		emitter.EmitLogLine("⚠ Test script error (bad selector/assertion/module) — use Generate to regenerate the spec")
		updateTestCaseResult(filePath, "failed")
		emitter.Emit("test_status", map[string]interface{}{"test_id": testID, "status": "failed"})
		return
	}

	// BUG — ask Claude for structured diagnosis
	emitter.EmitLogLine("⟳ Analysing failure…")
	diagCtx, diagCancel := context.WithTimeout(ctx, 90*time.Second)
	defer diagCancel()

	diagCmd := exec.CommandContext(diagCtx,
		"claude", "--dangerously-skip-permissions", "--print", "--verbose",
		"--output-format", "stream-json",
		buildDiagnosisPrompt(testID, last100Lines(cleanOutput)),
	)
	diagCmd.Dir = projectPath
	var diagRaw bytes.Buffer
	if diagStdout, err := diagCmd.StdoutPipe(); err == nil {
		diagStderr, _ := diagCmd.StderrPipe()
		if diagCmd.Start() == nil {
			process.NewStreamer(io.TeeReader(diagStdout, &diagRaw), diagStderr).Stream(emitter)
			diagCmd.Wait() //nolint:errcheck
		}
	}
	diagRawStr := diagRaw.String()
	failureDetails := extractFailureDetails(diagRawStr)
	claudeSummary := extractClaudeProse(diagRawStr)

	if failureDetails != "" {
		emitter.EmitLogLine("── Failure details ──")
		for _, line := range strings.Split(failureDetails, "\n") {
			if l := strings.TrimSpace(line); l != "" {
				emitter.EmitLogLine("  " + l)
			}
		}
		emitter.EmitLogLine("─────────────────────")
	}

	diagCat := diagnosisCategory(failureDetails)
	switch diagCat {
	case "ENV":
		// Claude identified an ENV issue — attempt to auto-fix using the structured
		// diagnosis, then retry once. If it still fails, create a bug report.
		emitter.EmitLogLine("⚠ Environment issue identified — attempting auto-fix…")
		fixInput := failureDetails
		if fixInput == "" {
			fixInput = cleanOutput
		}
		if fixEnvWithClaude(ctx, emitter, projectPath, fixInput) {
			emitter.EmitLogLine("✓ Environment fixed — retrying test…")
			passed, retryOutput := runPlaywright(ctx, emitter, projectPath, testID, headed)
			if passed {
				emitter.EmitLogLine(fmt.Sprintf("✓ %s passed", testID))
				updateTestCaseResult(filePath, "passed")
				emitter.Emit("test_status", map[string]interface{}{"test_id": testID, "status": "passed"})
				return
			}
			emitter.EmitLogLine(fmt.Sprintf("✗ %s still failing after env fix", testID))
			// Re-classify the new output — if it's a real bug now, create a report.
			if classifyFailure(retryOutput) == "BUG" {
				if bugID := createBugReport(projectPath, testID, filePath, failureDetails, claudeSummary); bugID != "" {
					emitter.EmitLogLine(fmt.Sprintf("🐛 Bug report created: harness/bugs/%s.md", bugID))
				}
			}
		} else {
			emitter.EmitLogLine("✗ Could not auto-fix environment — check server config manually")
		}
	case "TEST":
		emitter.EmitLogLine("⚠ Test script issue confirmed — use Generate to regenerate the spec")
	default:
		if bugID := createBugReport(projectPath, testID, filePath, failureDetails, claudeSummary); bugID != "" {
			emitter.EmitLogLine(fmt.Sprintf("🐛 Bug report created: harness/bugs/%s.md", bugID))
		}
	}
	updateTestCaseResult(filePath, "failed")
	emitter.Emit("test_status", map[string]interface{}{"test_id": testID, "status": "failed"})
}

// generateTestOnly generates the spec only — no test execution.
func generateTestOnly(emitter *ipc.Emitter, projectPath, testID, filePath, linkedTaskID string, headed bool) {
	ctx, cancel := context.WithTimeout(context.Background(), 6*time.Minute)
	testCancelMu.Lock()
	testCancelFn = cancel
	testCancelMu.Unlock()
	defer func() {
		cancel()
		testCancelMu.Lock()
		testCancelFn = nil
		testCancelMu.Unlock()
		emitter.Emit("engine_status", "idle")
	}()
	emitter.Emit("engine_status", "running")

	if runGeneration(ctx, emitter, projectPath, testID, filePath, linkedTaskID, headed) {
		emitter.Emit("spec_generated", map[string]interface{}{"test_id": testID})
	}
}

func generateAndRunTest(emitter *ipc.Emitter, projectPath, testID, filePath, linkedTaskID string, headed bool) {
	ctx, cancel := context.WithTimeout(context.Background(), 13*time.Minute)
	testCancelMu.Lock()
	testCancelFn = cancel
	testCancelMu.Unlock()
	defer func() {
		cancel()
		testCancelMu.Lock()
		testCancelFn = nil
		testCancelMu.Unlock()
		emitter.Emit("engine_status", "idle")
	}()
	emitter.Emit("engine_status", "running")
	emitter.Emit("test_status", map[string]interface{}{"test_id": testID, "status": "running"})

	if !runGeneration(ctx, emitter, projectPath, testID, filePath, linkedTaskID, headed) {
		updateTestCaseResult(filePath, "failed")
		emitter.Emit("test_status", map[string]interface{}{"test_id": testID, "status": "failed"})
		return
	}

	runDiagnose(ctx, emitter, projectPath, testID, filePath, headed)
}

// rerunTest skips generation and runs the existing .spec.ts directly.
// If no spec exists yet it falls back to full generation automatically.
func rerunTest(emitter *ipc.Emitter, projectPath, testID, filePath string, headed bool) {
	specPath := filepath.Join(projectPath, ".loom-generated", testID+".spec.ts")
	if _, err := os.Stat(specPath); err != nil {
		emitter.EmitLogLine("⟳ No spec found for " + testID + " — generating now…")
		generateTestOnly(emitter, projectPath, testID, filePath, "", headed)
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	testCancelMu.Lock()
	testCancelFn = cancel
	testCancelMu.Unlock()
	defer func() {
		cancel()
		testCancelMu.Lock()
		testCancelFn = nil
		testCancelMu.Unlock()
		emitter.Emit("engine_status", "idle")
	}()
	emitter.Emit("engine_status", "running")
	emitter.Emit("test_status", map[string]interface{}{"test_id": testID, "status": "running"})
	emitter.EmitLogLine("⟳ Running existing spec…")
	runDiagnose(ctx, emitter, projectPath, testID, filePath, headed)
}

var (
	reTestLastRun = regexp.MustCompile(`(?i)^\|\s*\*\*Last\s+Run\*\*\s*\|`)
	reTestStatus  = regexp.MustCompile(`(?i)^\|\s*\*\*Status\*\*\s*\|`)
	reH2Section   = regexp.MustCompile(`^##\s`)
)

// updateTestCaseResult writes the test outcome back into the test case markdown:
//   - Patches/adds "Last Run" and "Status" rows in the ## Meta table.
//   - Prepends a new row to a ## Test Run History table at the bottom (newest first).
func updateTestCaseResult(filePath, status string) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return
	}

	now := time.Now()
	dateTime := fmt.Sprintf("%d-%02d-%02d %02d:%02d",
		now.Year(), int(now.Month()), now.Day(), now.Hour(), now.Minute())
	statusLabel := "✅ Passed"
	if status != "passed" {
		statusLabel = "❌ Failed"
	}

	lines := strings.Split(string(data), "\n")

	// ── 1. Patch ## Meta table ────────────────────────────────────────────
	inMeta, metaEnd := false, -1
	lastRunLine, statusLine := -1, -1

	for i, l := range lines {
		if strings.TrimSpace(l) == "## Meta" {
			inMeta = true
			continue
		}
		if inMeta {
			if reH2Section.MatchString(l) {
				metaEnd = i
				break
			}
			if reTestLastRun.MatchString(l) {
				lastRunLine = i
			}
			if reTestStatus.MatchString(l) {
				statusLine = i
			}
		}
	}

	patchLine := func(idx int, value string) {
		parts := strings.Split(lines[idx], "|")
		if len(parts) >= 3 {
			parts[2] = " " + value + " "
			lines[idx] = strings.Join(parts, "|")
		}
	}
	insertBefore := func(idx int, row string) {
		lines = append(lines[:idx], append([]string{row}, lines[idx:]...)...)
		// keep subsequent indices consistent
		if lastRunLine >= idx { lastRunLine++ }
		if statusLine >= idx { statusLine++ }
		if metaEnd >= idx { metaEnd++ }
	}

	if lastRunLine >= 0 {
		patchLine(lastRunLine, dateTime)
	} else if metaEnd > 0 {
		insertBefore(metaEnd, fmt.Sprintf("| **Last Run** | %s |", dateTime))
	}
	if statusLine >= 0 {
		patchLine(statusLine, statusLabel)
	} else if metaEnd > 0 {
		insertBefore(metaEnd, fmt.Sprintf("| **Status** | %s |", statusLabel))
	}

	content := strings.Join(lines, "\n")

	// ── 2. ## Test Run History section (newest first) ─────────────────────
	const histSep = "|-------------|--------|-------|"
	newRow := fmt.Sprintf("| %s | %s | — |", dateTime, statusLabel)

	if idx := strings.Index(content, "## Test Run History"); idx >= 0 {
		if sepIdx := strings.Index(content[idx:], histSep); sepIdx >= 0 {
			at := idx + sepIdx + len(histSep)
			content = content[:at] + "\n" + newRow + content[at:]
		}
	} else {
		const histHeader = "\n\n## Test Run History\n\n| Date & Time | Result | Notes |\n|-------------|--------|-------|"
		content = strings.TrimRight(content, "\n") + histHeader + "\n" + newRow + "\n"
	}

	_ = os.WriteFile(filePath, []byte(content), 0o644)
}

// extractClaudeProse extracts all prose text that Claude wrote by scanning
// only "assistant"-type NDJSON lines and pulling every "text":"..." value.
// This handles any JSON key ordering and gives the full investigation log.
func extractClaudeProse(rawStream string) string {
	reText := regexp.MustCompile(`"text"\s*:\s*"((?:[^"\\]|\\.)*)"`)
	var parts []string
	for _, line := range strings.Split(rawStream, "\n") {
		if !strings.Contains(line, `"type":"assistant"`) &&
			!strings.Contains(line, `"role":"assistant"`) {
			continue
		}
		for _, m := range reText.FindAllStringSubmatch(line, -1) {
			decoded := strings.ReplaceAll(m[1], `\n`, "\n")
			decoded = strings.ReplaceAll(decoded, `\"`, `"`)
			decoded = strings.ReplaceAll(decoded, `\\`, `\`)
			decoded = strings.TrimSpace(decoded)
			if len(decoded) > 15 { // skip tool names / short strings
				parts = append(parts, decoded)
			}
		}
	}
	return strings.Join(parts, "\n\n")
}

// extractFailureDetails pulls the text between LOOM:FAILURE_DETAILS_START and
// LOOM:FAILURE_DETAILS_END from the raw Claude stream JSON. Falls back to
// scanning for Playwright failure markers (×, Error:, Expected, Received)
// if the delimiters are absent.
func extractFailureDetails(rawStream string) string {
	// Primary: delimited block written by Claude per the prompt instructions.
	const start = "LOOM:FAILURE_DETAILS_START"
	const end = "LOOM:FAILURE_DETAILS_END"
	if s := strings.Index(rawStream, start); s >= 0 {
		s += len(start)
		e := strings.Index(rawStream[s:], end)
		if e >= 0 {
			block := strings.TrimSpace(rawStream[s : s+e])
			// Strip JSON escape sequences that leaked through.
			block = strings.ReplaceAll(block, `\n`, "\n")
			block = strings.ReplaceAll(block, `\"`, `"`)
			block = strings.ReplaceAll(block, `\\`, `\`)
			return block
		}
	}

	// Fallback: scan assistant-type NDJSON lines for Playwright/API failure patterns.
	reTextVal := regexp.MustCompile(`"text"\s*:\s*"((?:[^"\\]|\\.)*)"`)
	seen := make(map[string]bool)
	var lines []string
	for _, streamLine := range strings.Split(rawStream, "\n") {
		if !strings.Contains(streamLine, `"type":"assistant"`) &&
			!strings.Contains(streamLine, `"role":"assistant"`) {
			continue
		}
		for _, m := range reTextVal.FindAllStringSubmatch(streamLine, -1) {
			decoded := strings.ReplaceAll(m[1], `\n`, "\n")
			decoded = strings.ReplaceAll(decoded, `\"`, `"`)
			for _, line := range strings.Split(decoded, "\n") {
				t := strings.TrimSpace(line)
				if t == "" || seen[t] {
					continue
				}
				if strings.Contains(t, "×") ||
					strings.HasPrefix(t, "Error:") ||
					strings.Contains(t, "Expected ") ||
					strings.Contains(t, "Received ") ||
					strings.Contains(t, "● ") ||
					strings.Contains(t, "[BUG]") ||
					strings.Contains(t, "[ENV]") ||
					strings.Contains(t, "[TEST]") ||
					strings.Contains(t, "got 4") || // 401, 403, 404, 429, 400 etc.
					strings.Contains(t, "got 5") || // 500, 503 etc.
					strings.Contains(t, "status ") {
					seen[t] = true
					lines = append(lines, t)
				}
			}
		}
	}
	return strings.Join(lines, "\n")
}

var reBugFile = regexp.MustCompile(`^BUG-(\d+)\.md$`)

// nextBugNumber scans bugsDir for BUG-NNN.md files and returns the next number.
func nextBugNumber(bugsDir string) int {
	entries, err := os.ReadDir(bugsDir)
	if err != nil {
		return 1
	}
	max := 0
	for _, e := range entries {
		m := reBugFile.FindStringSubmatch(e.Name())
		if m == nil {
			continue
		}
		n, _ := strconv.Atoi(m[1])
		if n > max {
			max = n
		}
	}
	return max + 1
}

// createBugReport creates a bug markdown file under harness/bugs/ for a failed test.
// failureDetails = structured LOOM marker block; claudeSummary = Claude's full investigation prose.
// Returns the bug ID (e.g. "BUG-003") or "" on error.
func createBugReport(projectPath, testID, testFilePath, failureDetails, claudeSummary string) string {
	bugsDir := filepath.Join(projectPath, "harness", "bugs")
	if err := os.MkdirAll(bugsDir, 0o755); err != nil {
		return ""
	}

	num := nextBugNumber(bugsDir)
	bugID := fmt.Sprintf("BUG-%03d", num)

	// Extract test case title from the first # heading.
	tcTitle := testID
	if data, err := os.ReadFile(testFilePath); err == nil {
		for _, line := range strings.SplitN(string(data), "\n", 30) {
			if strings.HasPrefix(strings.TrimSpace(line), "# ") {
				heading := strings.TrimPrefix(strings.TrimSpace(line), "# ")
				if idx := strings.Index(heading, ": "); idx >= 0 {
					tcTitle = strings.TrimSpace(heading[idx+2:])
				} else {
					tcTitle = heading
				}
				break
			}
		}
	}

	// Relative path from project root for the test case link.
	tcRel, relErr := filepath.Rel(projectPath, testFilePath)
	if relErr != nil {
		tcRel = testFilePath
	}
	tcRel = filepath.ToSlash(tcRel)

	now := time.Now()
	today := fmt.Sprintf("%d-%02d-%02d", now.Year(), int(now.Month()), now.Day())
	dateTime := fmt.Sprintf("%d-%02d-%02d %02d:%02d",
		now.Year(), int(now.Month()), now.Day(), now.Hour(), now.Minute())

	// Build "Actual Result" section from structured details.
	actualResult := "Test failed. See investigation notes below."
	if failureDetails != "" {
		actualResult = "Test failed with the following errors:\n\n```\n" + failureDetails + "\n```"
	}

	// Build "Investigation" section from Claude's prose output.
	// Use the LAST portion — that's the failure analysis/conclusion, not the setup planning.
	investigationSection := ""
	if claudeSummary != "" {
		summary := claudeSummary
		const maxLen = 3000
		prefix := ""
		if len(summary) > maxLen {
			summary = summary[len(summary)-maxLen:]
			// Trim to the first newline so we don't start mid-sentence.
			if nl := strings.Index(summary, "\n"); nl > 0 {
				summary = summary[nl+1:]
			}
			prefix = "*(initial setup omitted — see Output panel for full log)*\n\n"
		}
		investigationSection = "## Investigation Notes\n\n" + prefix + summary + "\n\n"
	}

	content := "# " + bugID + ": " + tcTitle + " — test failure\n\n" +
		"## Meta\n\n" +
		"| Field | Value |\n" +
		"|-------|-------|\n" +
		"| **Test Case** | [" + testID + "](" + tcRel + ") |\n" +
		"| **Status** | 🐛 Open |\n" +
		"| **Severity** | Medium |\n" +
		"| **Found Date** | " + today + " |\n" +
		"| **Found By** | Loom QA Automation |\n" +
		"| **Reproduced** | — |\n" +
		"| **Fixed Date** | — |\n\n" +
		"## Description\n\n" +
		"Automated test **" + testID + "** failed during QA run at " + dateTime + ".\n\n" +
		"## Steps to Reproduce\n\n" +
		"1. Open project in Loom Studio\n" +
		"2. Navigate to QA Test Suite\n" +
		"3. Select **" + testID + "** and click **Generate & Run**\n\n" +
		"## Expected Result\n\n" +
		"All steps in [" + testID + "](" + tcRel + ") pass.\n\n" +
		"## Actual Result\n\n" +
		actualResult + "\n\n" +
		investigationSection +
		"## Fix Notes\n\n" +
		"—\n\n" +
		"## Progress Log\n\n" +
		"| Date | Update |\n" +
		"|------|--------|\n" +
		"| " + today + " | Bug auto-created by Loom QA on test failure |\n"

	bugPath := filepath.Join(bugsDir, bugID+".md")
	if err := os.WriteFile(bugPath, []byte(content), 0o644); err != nil {
		return ""
	}
	return bugID
}

// handleAuditAction dispatches all "audit_*" engine actions to the audit package.
func handleAuditAction(action string, cmd map[string]json.RawMessage, emitter *ipc.Emitter) {
	var projectPath string
	for _, key := range []string{"projectPath", "project_path"} {
		if raw, ok := cmd[key]; ok {
			json.Unmarshal(raw, &projectPath) //nolint:errcheck
			break
		}
	}

	switch action {
	case "audit_read_team":
		team, err := audit.LoadTeam(projectPath)
		if err != nil {
			emitter.EmitEngineError(err.Error())
			return
		}
		emitter.Emit("audit_team_ready", team)

	case "audit_save_team":
		var team audit.TeamFile
		if raw, ok := cmd["team"]; !ok || json.Unmarshal(raw, &team) != nil {
			emitter.EmitEngineError("audit_save_team: invalid team JSON")
			return
		}
		if err := audit.SaveTeam(projectPath, &team); err != nil {
			emitter.EmitEngineError(err.Error())
			return
		}
		emitter.Emit("audit_team_saved", map[string]bool{"ok": true})

	case "audit_start":
		var sessionID string
		if raw, ok := cmd["sessionId"]; ok {
			json.Unmarshal(raw, &sessionID) //nolint:errcheck
		}
		if projectPath == "" || sessionID == "" {
			emitter.EmitEngineError("audit_start: missing projectPath or sessionId")
			return
		}
		go audit.RunAudit(context.Background(), projectPath, sessionID, emitter)

	case "audit_cancel":
		var sessionID string
		if raw, ok := cmd["sessionId"]; ok {
			json.Unmarshal(raw, &sessionID) //nolint:errcheck
		}
		if sessionID != "" {
			audit.CancelAudit(sessionID)
		}

	case "audit_generate_report":
		var sessionID string
		if raw, ok := cmd["sessionId"]; ok {
			json.Unmarshal(raw, &sessionID) //nolint:errcheck
		}
		if projectPath == "" || sessionID == "" {
			emitter.EmitEngineError("audit_generate_report: missing projectPath or sessionId")
			return
		}
		go audit.BuildReport(context.Background(), projectPath, sessionID, emitter)

	default:
		emitter.EmitEngineError("unknown audit action: " + action)
	}
}

// chatMu ensures only one harness chat runs at a time.
var chatMu sync.Mutex

// testCancelMu guards the cancel function for the currently running QA test.
var testCancelMu sync.Mutex
var testCancelFn context.CancelFunc

func cancelRunningTest() {
	testCancelMu.Lock()
	defer testCancelMu.Unlock()
	if testCancelFn != nil {
		testCancelFn()
		testCancelFn = nil
	}
}

type histMsg struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

func runHarnessChat(emitter *ipc.Emitter, message, projectPath string, history []histMsg) {
	chatMu.Lock()
	defer chatMu.Unlock()
	defer emitter.Emit("harness_done", nil)

	var prompt string
	if len(history) == 0 {
		prompt = message
	} else {
		var sb strings.Builder
		sb.WriteString("Conversation history:\n\n")
		for _, m := range history {
			if m.Role == "user" {
				sb.WriteString("User: ")
			} else {
				sb.WriteString("Assistant: ")
			}
			sb.WriteString(m.Content)
			sb.WriteString("\n\n")
		}
		sb.WriteString("User's latest message: ")
		sb.WriteString(message)
		prompt = sb.String()
	}

	cmd := exec.Command(
		"claude",
		"--dangerously-skip-permissions",
		"--print",
		"--verbose",
		"--output-format", "stream-json",
		prompt,
	)
	cmd.Dir = projectPath
	cmd.Stdin = nil

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		emitter.EmitHarnessLogLine("Error: " + err.Error())
		return
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		emitter.EmitHarnessLogLine("Error: " + err.Error())
		return
	}

	if err := cmd.Start(); err != nil {
		emitter.EmitHarnessLogLine("Error starting Claude: " + err.Error())
		return
	}

	// Use the same proven Streamer as the task engine.
	streamer := process.NewStreamer(stdout, stderr)
	streamer.StreamHarness(emitter)

	cmd.Wait() //nolint:errcheck
}

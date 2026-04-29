package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"sync"

	"github.com/loom/engine/diff"
	git "github.com/loom/engine/git"
	"github.com/loom/engine/ipc"
	"github.com/loom/engine/process"
	"github.com/loom/engine/store"
	"github.com/loom/engine/task"
)

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

				// Mark the task as in-progress in the file and append a completion
				// instruction to the prompt so Claude updates it when done.
				if relPath, err := task.MarkTaskStarted(projectPath, taskID); err == nil {
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
			if err := manager.Kill(); err != nil {
				emitter.EmitEngineError(fmt.Sprintf("kill: %v", err))
			}

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

			// Check for conflict files — first via unmerged index, then by
			// scanning for leftover conflict markers in modified files.
			conflictFiles := git.UnmergedFiles(projectPath)
			if len(conflictFiles) == 0 {
				conflictFiles = git.ConflictMarkerFiles(projectPath)
			}
			if len(conflictFiles) > 0 {
				emitter.Emit("git_pull_conflicts", map[string]interface{}{"files": conflictFiles, "branch": branch})
			} else {
				emitter.Emit("git_merge_aborted", nil) // clear stale conflict state
			}

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
				} else if ce, ok := err.(*git.MergeConflictError); ok {
					emitter.EmitLogLine(fmt.Sprintf("⚠ Merge conflicts in %d file(s). Resolve them then commit, or abort the merge.", len(ce.Files)))
					emitter.Emit("git_pull_conflicts", map[string]interface{}{"files": ce.Files, "branch": branch})
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

		case "git_merge_abort":
			var projectPath string
			if err := json.Unmarshal(cmd["project_path"], &projectPath); err != nil || projectPath == "" {
				emitter.EmitEngineError("git_merge_abort: missing project_path")
				continue
			}
			emitter.EmitLogLine("Aborting merge…")
			if err := git.MergeAbort(projectPath); err != nil {
				emitter.EmitEngineError(fmt.Sprintf("Merge abort failed: %v", err))
				continue
			}
			emitter.EmitLogLine("✓ Merge aborted. Working tree restored.")
			emitter.Emit("git_merge_aborted", nil)
			branch, _ := git.GetCurrentBranch(projectPath)
			branches, _ := git.ListBranches(projectPath)
			emitter.Emit("git_info", map[string]interface{}{"branch": branch, "branches": branches})

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

		case "ping":
			emitter.Emit("pong", nil)

		default:
			fmt.Fprintf(os.Stderr, "engine: unknown action: %s\n", action)
		}
	}
}

// chatMu ensures only one harness chat runs at a time.
var chatMu sync.Mutex

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

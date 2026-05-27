use std::collections::HashMap;
use std::fs;
use std::path::Path;

use crate::{EngineState, HarnessChatState};

/// Returns PATH expanded with common binary locations that GUI apps miss.
/// claude is typically installed via npm/brew into dirs not in the GUI $PATH.
fn expanded_path() -> String {
    let cur = std::env::var("PATH").unwrap_or_default();
    let home = std::env::var(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .unwrap_or_default();
    let sep = if cfg!(windows) { ";" } else { ":" };

    #[cfg(windows)]
    let extra = {
        // On Windows, npm globals land in %APPDATA%\npm (e.g. C:\Users\name\AppData\Roaming\npm).
        let appdata = std::env::var("APPDATA").unwrap_or_default();
        vec![
            format!("{}\\npm", appdata),
            format!("{}\\AppData\\Roaming\\npm", home),
            format!("{}\\AppData\\Local\\Microsoft\\WindowsApps", home),
            format!("{}\\scoop\\shims", home),
        ]
    };

    #[cfg(not(windows))]
    let extra = vec![
        "/opt/homebrew/bin".to_string(),
        "/opt/homebrew/sbin".to_string(),
        "/usr/local/bin".to_string(),
        "/usr/local/sbin".to_string(),
        format!("{}/.npm-packages/bin", home),
        format!("{}/.local/bin", home),
        format!("{}/npm/bin", home),
        "/usr/bin".to_string(),
        "/bin".to_string(),
    ];

    let existing: std::collections::HashSet<&str> = cur.split(sep).collect();
    let mut prepend: Vec<String> = extra
        .into_iter()
        .filter(|p| !existing.contains(p.as_str()))
        .collect();

    if prepend.is_empty() {
        cur
    } else {
        prepend.push(cur);
        prepend.join(sep)
    }
}

#[tauri::command]
pub fn get_platform() -> &'static str {
    #[cfg(target_os = "macos")]    { "macos" }
    #[cfg(target_os = "windows")]  { "windows" }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))] { "linux" }
}

#[tauri::command]
pub async fn stop_harness_chat(
    state: tauri::State<'_, HarnessChatState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    use tauri::Emitter;
    let pid = state.pid.lock().map_err(|e| e.to_string())?.take();
    if let Some(pid) = pid {
        #[cfg(windows)]
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/F"])
            .output();
        #[cfg(not(windows))]
        let _ = std::process::Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .output();
    }
    // Signal the frontend immediately so the UI stops loading.
    let _ = app.emit("harness_done", serde_json::Value::Null);
    Ok(())
}

#[tauri::command]
pub async fn invoke_claude(
    state: tauri::State<'_, HarnessChatState>,
    app: tauri::AppHandle,
    message: String,
    history: Vec<serde_json::Value>,
    project_path: String,
    model: Option<String>,
) -> Result<(), String> {
    use tauri::Emitter;
    use tokio::io::{AsyncBufReadExt, BufReader};
    use tokio::process::Command;

    let prompt = if history.is_empty() {
        message.clone()
    } else {
        let mut p = String::from("Conversation history:\n\n");
        for msg in &history {
            let role = msg.get("role").and_then(|r| r.as_str()).unwrap_or("user");
            let content = msg.get("content").and_then(|c| c.as_str()).unwrap_or("");
            p.push_str(if role == "user" { "User: " } else { "Assistant: " });
            p.push_str(content);
            p.push_str("\n\n");
        }
        p.push_str("User's latest message: ");
        p.push_str(&message);
        p
    };

    let model_str = model.unwrap_or_default();
    let mut args = vec![
        "--dangerously-skip-permissions",
        "--print",
        "--verbose",
        "--output-format",
        "stream-json",
    ];
    if !model_str.is_empty() {
        args.extend(["--model", &model_str]);
    }
    args.push(&prompt);

    // On Windows, npm-installed CLIs are .cmd shims; they must be launched via cmd.exe.
    // On Unix, spawning "claude" directly works fine.
    #[cfg(windows)]
    let mut child = {
        let mut cmd_args = vec!["/C".to_string(), "claude".to_string()];
        cmd_args.extend(args.iter().map(|s| s.to_string()));
        Command::new("cmd")
            .args(&cmd_args)
            .current_dir(&project_path)
            .env("PATH", expanded_path())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|_| {
                "Claude CLI not found. Install it with: npm install -g @anthropic-ai/claude-code".to_string()
            })?
    };

    #[cfg(not(windows))]
    let mut child = Command::new("claude")
        .args(&args)
        .current_dir(&project_path)
        .env("PATH", expanded_path())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|_| {
            "Claude CLI not found. Install it with: npm install -g @anthropic-ai/claude-code".to_string()
        })?;

    // Store PID so stop_harness_chat can kill it.
    if let Some(pid) = child.id() {
        if let Ok(mut guard) = state.pid.lock() {
            *guard = Some(pid);
        }
    }

    let stdout = child.stdout.take().ok_or("no stdout")?;
    let mut lines = BufReader::new(stdout).lines();
    let mut got_response = false;

    while let Ok(Some(line)) = lines.next_line().await {
        if line.is_empty() {
            continue;
        }
        let Ok(val) = serde_json::from_str::<serde_json::Value>(&line) else {
            continue;
        };
        let msg_type = val.get("type").and_then(|t| t.as_str()).unwrap_or("");

        match msg_type {
            "assistant" => {
                if let Some(blocks) = val
                    .get("message")
                    .and_then(|m| m.get("content"))
                    .and_then(|c| c.as_array())
                {
                    for block in blocks {
                        if block.get("type").and_then(|t| t.as_str()) == Some("text") {
                            if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                                let text = text.trim();
                                if !text.is_empty() {
                                    let _ = app.emit(
                                        "harness_log_line",
                                        serde_json::json!({
                                            "timestamp": "now",
                                            "level": "CLAUDE",
                                            "content": text
                                        }),
                                    );
                                    got_response = true;
                                }
                            }
                        }
                    }
                }
            }
            "result" if !got_response => {
                if let Some(result) = val.get("result").and_then(|r| r.as_str()) {
                    let result = result.trim();
                    if !result.is_empty() {
                        let _ = app.emit(
                            "harness_log_line",
                            serde_json::json!({
                                "timestamp": "now",
                                "level": "CLAUDE",
                                "content": result
                            }),
                        );
                        got_response = true;
                    }
                }
            }
            _ => {}
        }
    }

    // Clear stored PID — process is done.
    if let Ok(mut guard) = state.pid.lock() {
        *guard = None;
    }

    let status = child.wait().await.map_err(|e| e.to_string())?;
    if !got_response && !status.success() {
        let _ = app.emit(
            "harness_log_line",
            serde_json::json!({
                "timestamp": "now",
                "level": "CLAUDE",
                "content": "Error: Claude exited without a response. Check CLI is installed and authenticated."
            }),
        );
    }

    let _ = app.emit("harness_done", serde_json::Value::Null);
    Ok(())
}

#[tauri::command]
pub async fn open_folder_picker(app: tauri::AppHandle) -> Option<String> {
    use tauri_plugin_dialog::{DialogExt, FilePath};
    let (tx, rx) = tokio::sync::oneshot::channel::<Option<FilePath>>();
    app.dialog().file().pick_folder(move |result| {
        let _ = tx.send(result);
    });
    rx.await
        .ok()
        .flatten()
        .map(|fp| match fp {
            FilePath::Path(p) => p.to_string_lossy().to_string(),
            FilePath::Url(u) => u.path().to_string(),
        })
}

#[tauri::command]
pub async fn open_file_picker(app: tauri::AppHandle) -> Option<String> {
    use tauri_plugin_dialog::{DialogExt, FilePath};
    let (tx, rx) = tokio::sync::oneshot::channel::<Option<FilePath>>();
    app.dialog().file().pick_file(move |result| {
        let _ = tx.send(result);
    });
    rx.await
        .ok()
        .flatten()
        .map(|fp| match fp {
            FilePath::Path(p) => p.to_string_lossy().to_string(),
            FilePath::Url(u) => u.path().to_string(),
        })
}

/// Reads all .md test case files from `{path}/harness/test_cases/` and parses their metadata.
/// Returns an empty array if the directory does not exist or is empty.
#[tauri::command]
pub fn read_test_cases(path: String) -> Vec<HashMap<String, String>> {
    let harness = Path::new(&path).join("harness");
    // Accept both naming conventions: test_cases and test-cases
    let dir = {
        let a = harness.join("test_cases");
        let b = harness.join("test-cases");
        if a.is_dir() { a } else { b }
    };
    if !dir.is_dir() {
        return vec![];
    }
    let mut entries: Vec<_> = fs::read_dir(&dir)
        .ok()
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| {
            let p = e.path();
            p.extension().map_or(false, |ext| ext == "md")
                && p.file_name().map_or(false, |n| n != "overview.md")
        })
        .collect();
    entries.sort_by_key(|e| e.file_name());
    entries
        .into_iter()
        .filter_map(|entry| {
            let p = entry.path();
            let file_path = p.to_string_lossy().to_string();
            let stem = p.file_stem()?.to_string_lossy().to_string();
            let content = fs::read_to_string(&p).ok()?;
            Some(parse_test_case_md(&content, &file_path, &stem))
        })
        .collect()
}

fn parse_test_case_md(content: &str, file_path: &str, stem: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    map.insert("file_path".to_string(), file_path.to_string());

    let mut id = stem.to_string();
    let mut title = String::new();
    let mut tc_type = String::new();
    let mut priority = String::new();
    let mut automated = String::new();
    let mut linked_task = String::new();

    for line in content.lines() {
        let trimmed = line.trim();
        if title.is_empty() && trimmed.starts_with("# ") {
            let heading = trimmed[2..].trim();
            if let Some(pos) = heading.find(": ") {
                id = heading[..pos].trim().to_string();
                title = heading[pos + 2..].trim().to_string();
            } else {
                title = heading.to_string();
            }
        }
        if trimmed.starts_with('|') && !trimmed.starts_with("|---") && !trimmed.starts_with("| Field") {
            let cols: Vec<&str> = trimmed.split('|').collect();
            if cols.len() >= 3 {
                let key = cols[1].trim().replace("**", "").to_lowercase();
                let val = cols[2].trim().to_string();
                match key.as_str() {
                    "type" => tc_type = val,
                    "priority" => priority = val,
                    "automated" => automated = val,
                    "linked task" => linked_task = val,
                    _ => {}
                }
            }
        }
    }

    map.insert("id".to_string(), id);
    map.insert("title".to_string(), title);
    map.insert("type".to_string(), tc_type);
    map.insert("priority".to_string(), priority);
    map.insert("automated".to_string(), automated);
    map.insert("linked_task".to_string(), linked_task);
    map
}

/// Reads all .md files from `{path}/harness/` and returns their filename + raw content.
/// Returns an empty array (not an error) if the harness folder does not exist.
#[tauri::command]
pub fn read_harness_tasks(path: String) -> Vec<HashMap<String, String>> {
    let harness = Path::new(&path).join("harness");
    if !harness.is_dir() {
        return vec![];
    }
    let mut files = vec![];
    if let Ok(entries) = fs::read_dir(&harness) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.extension().map_or(false, |e| e == "md") {
                if let (Ok(content), Some(name)) = (
                    fs::read_to_string(&p),
                    p.file_name().map(|n| n.to_string_lossy().to_string()),
                ) {
                    let mut map = HashMap::new();
                    map.insert("filename".to_string(), name);
                    map.insert("content".to_string(), content);
                    files.push(map);
                }
            }
        }
    }
    files
}

/// Sends a JSON command to the Go engine via stdin.
#[tauri::command]
pub fn engine_command(
    state: tauri::State<'_, EngineState>,
    payload: serde_json::Value,
) -> Result<(), String> {
    let mut line = serde_json::to_string(&payload).map_err(|e| e.to_string())?;
    line.push('\n');
    let mut guard = state.stdin.lock().map_err(|e| e.to_string())?;
    if let Some(child) = guard.as_mut() {
        child.write(line.as_bytes()).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(serde::Serialize, Clone)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub extension: Option<String>,
    pub children: Option<Vec<FileNode>>,
}

const SKIP_DIRS: &[&str] = &[
    "node_modules", ".git", "target", ".next", "dist",
    ".turbo", "build", "__pycache__", ".cache", ".nuxt",
    "vendor", ".venv", "venv", ".yarn", "coverage",
];

fn build_tree(path: &Path, depth: u32) -> Option<FileNode> {
    if depth > 6 {
        return None;
    }
    let name = path.file_name()?.to_string_lossy().to_string();
    let path_str = path.to_string_lossy().to_string();

    if path.is_dir() {
        if SKIP_DIRS.contains(&name.as_str()) {
            return None;
        }
        let mut children: Vec<FileNode> = fs::read_dir(path)
            .ok()?
            .flatten()
            .filter_map(|e| build_tree(&e.path(), depth + 1))
            .collect();

        children.sort_by(|a, b| match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        });

        Some(FileNode {
            name,
            path: path_str,
            is_dir: true,
            extension: None,
            children: Some(children),
        })
    } else {
        let extension = path.extension().map(|e| e.to_string_lossy().to_string());
        Some(FileNode {
            name,
            path: path_str,
            is_dir: false,
            extension,
            children: None,
        })
    }
}

/// Returns a recursive FileNode tree for the given project path.
#[tauri::command]
pub fn read_directory(path: String) -> Result<FileNode, String> {
    build_tree(Path::new(&path), 0).ok_or_else(|| "Failed to read directory".to_string())
}

/// Returns commits on current branch not in base. Tries origin/<base> then <base>.
#[tauri::command]
pub fn git_log_branch(project_path: String, base: String) -> Vec<String> {
    for ref_name in [format!("origin/{}", base), base.clone()] {
        if let Ok(out) = std::process::Command::new("git")
            .args(["log", &format!("{}..HEAD", ref_name), "--oneline", "--no-decorate"])
            .current_dir(&project_path)
            .output()
        {
            if out.status.success() {
                return String::from_utf8_lossy(&out.stdout)
                    .lines()
                    .map(|l| l.trim().to_string())
                    .filter(|l| !l.is_empty())
                    .collect()
            }
        }
    }
    vec![]
}

/// Returns true if the branch exists on origin.
#[tauri::command]
pub fn git_branch_pushed(project_path: String, branch: String) -> bool {
    std::process::Command::new("git")
        .args(["rev-parse", "--verify", &format!("refs/remotes/origin/{}", branch)])
        .current_dir(&project_path)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Returns true if gh CLI is installed.
#[tauri::command]
pub async fn gh_check() -> bool {
    tokio::process::Command::new("which")
        .arg("gh")
        .output()
        .await
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Returns the default branch name from gh CLI, falling back to "main".
#[tauri::command]
pub async fn gh_default_branch(project_path: String) -> String {
    let result = tokio::process::Command::new("gh")
        .args(["repo", "view", "--json", "defaultBranchRef", "--jq", ".defaultBranchRef.name"])
        .current_dir(&project_path)
        .output()
        .await;
    match result {
        Ok(o) if o.status.success() => {
            let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if s.is_empty() { "main".to_string() } else { s }
        }
        _ => "main".to_string(),
    }
}

/// Lists open PRs as JSON array.
#[tauri::command]
pub async fn gh_pr_list(project_path: String) -> Vec<serde_json::Value> {
    let out = tokio::process::Command::new("gh")
        .args(["pr", "list", "--json", "number,title,headRefName,state,url"])
        .current_dir(&project_path)
        .output()
        .await;
    match out {
        Ok(o) if o.status.success() => {
            serde_json::from_slice(&o.stdout).unwrap_or_default()
        }
        _ => vec![],
    }
}

/// Writes UTF-8 content to a file, overwriting existing content.
#[tauri::command]
pub fn write_file_content(path: String, content: String) -> Result<(), String> {
    fs::write(Path::new(&path), content).map_err(|e| e.to_string())
}

/// Opens a native Save dialog and writes binary data (e.g. PDF) to the chosen path.
/// Returns the saved path or Err("cancelled") if the user dismisses the dialog.
#[tauri::command]
pub async fn save_binary_file(
    app: tauri::AppHandle,
    default_name: String,
    data: Vec<u8>,
) -> Result<String, String> {
    use tauri_plugin_dialog::{DialogExt, FilePath};
    let (tx, rx) = tokio::sync::oneshot::channel::<Option<FilePath>>();
    app.dialog()
        .file()
        .set_title("Save PDF")
        .set_file_name(&default_name)
        .save_file(move |result| { let _ = tx.send(result); });
    let dest = match rx.await.ok().flatten() {
        None => return Err("cancelled".to_string()),
        Some(FilePath::Path(p)) => p.to_string_lossy().to_string(),
        Some(FilePath::Url(u)) => u.path().to_string(),
    };
    std::fs::write(&dest, &data).map_err(|e| format!("Write failed: {e}"))?;
    Ok(dest)
}

/// Returns the UTF-8 content of a file. Errors on binary files or files > 500 KB.
#[tauri::command]
pub fn read_file_content(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("File not found".to_string());
    }
    let meta = fs::metadata(p).map_err(|e| e.to_string())?;
    if meta.len() > 500 * 1024 {
        return Err("File too large to display (> 500 KB)".to_string());
    }
    fs::read_to_string(p).map_err(|_| "Cannot display binary file".to_string())
}

/// Opens a path in VS Code if available, otherwise falls back to the OS default.
/// On macOS: `open -a "Visual Studio Code" <path>` → `open <path>`
/// On Windows: `code <path>` → `explorer <path>`
/// On Linux: `code <path>` → `xdg-open <path>`
#[tauri::command]
pub fn open_in_editor(path: String) -> Result<(), String> {
    // Try VS Code first (works on all platforms when `code` is on PATH).
    let vscode = std::process::Command::new("code")
        .arg(&path)
        .spawn();

    if vscode.is_ok() {
        return Ok(());
    }

    // Platform-specific fallback.
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Reads all BUG-*.md files from `{path}/harness/bugs/` and returns their metadata.
#[tauri::command]
pub fn read_bugs(path: String) -> Vec<HashMap<String, String>> {
    let bugs_dir = Path::new(&path).join("harness").join("bugs");
    if !bugs_dir.is_dir() {
        return vec![];
    }
    let mut entries: Vec<_> = fs::read_dir(&bugs_dir)
        .ok()
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| {
            let p = e.path();
            p.extension().map_or(false, |ext| ext == "md")
                && p.file_name()
                    .and_then(|n| n.to_str())
                    .map_or(false, |n| n.starts_with("BUG-"))
        })
        .collect();
    entries.sort_by(|a, b| b.file_name().cmp(&a.file_name())); // newest first
    entries
        .into_iter()
        .filter_map(|entry| {
            let p = entry.path();
            let file_path = p.to_string_lossy().to_string();
            let content = fs::read_to_string(&p).ok()?;
            let mut map = HashMap::new();
            map.insert("file_path".to_string(), file_path);
            let mut id = String::new();
            let mut title = String::new();
            let mut status = String::new();
            let mut severity = String::new();
            let mut test_case = String::new();
            let mut found_date = String::new();
            for line in content.lines() {
                let t = line.trim();
                if title.is_empty() && t.starts_with("# ") {
                    let heading = t[2..].trim();
                    if let Some(pos) = heading.find(": ") {
                        id = heading[..pos].trim().to_string();
                        title = heading[pos + 2..].trim().to_string();
                    }
                }
                if t.starts_with('|') && !t.starts_with("|---") {
                    let cols: Vec<&str> = t.split('|').collect();
                    if cols.len() >= 3 {
                        let key = cols[1].trim().replace("**", "").to_lowercase();
                        let val = cols[2].trim().to_string();
                        match key.as_str() {
                            "status" => status = val,
                            "severity" => severity = val,
                            "test case" => {
                                // Extract TC-NNN from markdown link [TC-NNN](path)
                                let v = val.trim_start_matches('[');
                                test_case = v.split(']').next().unwrap_or(&val).to_string();
                            }
                            "found date" => found_date = val,
                            _ => {}
                        }
                    }
                }
            }
            map.insert("id".to_string(), id);
            map.insert("title".to_string(), title);
            map.insert("status".to_string(), status);
            map.insert("severity".to_string(), severity);
            map.insert("test_case".to_string(), test_case);
            map.insert("found_date".to_string(), found_date);
            Some(map)
        })
        .collect()
}

/// Lists all *.spec.ts files under `{path}/.loom-generated/`.
#[tauri::command]
pub fn list_scripts(path: String) -> Vec<HashMap<String, String>> {
    let dir = Path::new(&path).join(".loom-generated");
    if !dir.is_dir() {
        return vec![];
    }
    let mut entries: Vec<_> = fs::read_dir(&dir)
        .ok()
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| {
            let p = e.path();
            p.extension().map_or(false, |ext| ext == "ts")
                && p.file_name()
                    .and_then(|n| n.to_str())
                    .map_or(false, |n| n.ends_with(".spec.ts"))
        })
        .collect();
    entries.sort_by(|a, b| b.file_name().cmp(&a.file_name())); // newest first
    entries
        .into_iter()
        .map(|entry| {
            let p = entry.path();
            let file_path = p.to_string_lossy().to_string();
            let name = p.file_name().unwrap_or_default().to_string_lossy().to_string();
            let test_id = name.replace(".spec.ts", "");
            let mut map = HashMap::new();
            map.insert("file_path".to_string(), file_path);
            map.insert("name".to_string(), name);
            map.insert("test_id".to_string(), test_id);
            map
        })
        .collect()
}

// ── CQC thin-wrapper commands ─────────────────────────────────────────────────
// These forward to the Go engine via engineCommand and relay events back.
// All heavy logic lives in the Go cqc package.

fn engine_send(state: &tauri::State<'_, crate::EngineState>, payload: serde_json::Value) -> Result<(), String> {
    let mut line = serde_json::to_string(&payload).map_err(|e| e.to_string())?;
    line.push('\n');
    let mut guard = state.stdin.lock().map_err(|e| e.to_string())?;
    if let Some(child) = guard.as_mut() {
        use std::io::Write;
        child.write(line.as_bytes()).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ── Site Audit IPC commands ───────────────────────────────────────────────────

fn iso_now() -> String {
    chrono::Utc::now().to_rfc3339()
}

/// Write intake JSON to {project_path}/audits/{session_id}/intake.json.
/// Creates the directory if needed, writes atomically via .tmp → rename,
/// and removes intake.draft.json on success.
#[tauri::command]
pub async fn audit_save_intake(
    project_path: String,
    session_id: String,
    intake: serde_json::Value,
) -> Result<(), String> {
    use std::fs;
    let dir = std::path::Path::new(&project_path)
        .join("audits")
        .join(&session_id);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let intake_path = dir.join("intake.json");
    let tmp_path = dir.join("intake.json.tmp");
    let draft_path = dir.join("intake.draft.json");

    // Preserve createdAt if this is a re-save.
    let created_at = if intake_path.exists() {
        fs::read_to_string(&intake_path)
            .ok()
            .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
            .and_then(|v| v["createdAt"].as_str().map(|s| s.to_string()))
            .unwrap_or_else(iso_now)
    } else {
        iso_now()
    };

    let site_name = intake["siteName"].clone();
    let site_url = intake["siteUrl"].clone();

    let envelope = serde_json::json!({
        "sessionId": session_id,
        "version": 1,
        "projectId": "",
        "siteName": site_name,
        "siteUrl": site_url,
        "phase": "intake",
        "createdAt": created_at,
        "updatedAt": iso_now(),
        "reportPath": null,
        "taskCount": 0,
        "intake": intake,
    });

    let data = serde_json::to_string_pretty(&envelope).map_err(|e| e.to_string())?;
    fs::write(&tmp_path, data).map_err(|e| e.to_string())?;
    fs::rename(&tmp_path, &intake_path).map_err(|e| e.to_string())?;

    let _ = fs::remove_file(&draft_path); // ignore error if not present
    Ok(())
}

/// List all audit sessions under {project_path}/audits/, sorted newest-first.
/// Returns an empty array (not an error) if the audits/ directory does not exist.
#[tauri::command]
pub async fn audit_list_sessions(
    project_path: String,
) -> Result<Vec<serde_json::Value>, String> {
    let audits_dir = std::path::Path::new(&project_path).join("audits");
    if !audits_dir.is_dir() {
        return Ok(vec![]);
    }
    let entries = std::fs::read_dir(&audits_dir).map_err(|e| e.to_string())?;
    let mut sessions: Vec<serde_json::Value> = entries
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_dir())
        .filter_map(|e| {
            let intake_path = e.path().join("intake.json");
            let content = std::fs::read_to_string(intake_path).ok()?;
            let mut v = serde_json::from_str::<serde_json::Value>(&content).ok()?;
            normalise_session_id(&mut v);
            Some(v)
        })
        .collect();
    sessions.sort_by(|a, b| {
        let ta = a["createdAt"].as_str().unwrap_or("");
        let tb = b["createdAt"].as_str().unwrap_or("");
        tb.cmp(ta)
    });
    Ok(sessions)
}

/// Load a single audit session by ID.
#[tauri::command]
pub async fn audit_load_session(
    project_path: String,
    session_id: String,
) -> Result<serde_json::Value, String> {
    let intake_path = std::path::Path::new(&project_path)
        .join("audits")
        .join(&session_id)
        .join("intake.json");
    let content = std::fs::read_to_string(&intake_path).map_err(|e| e.to_string())?;
    let mut v = serde_json::from_str::<serde_json::Value>(&content).map_err(|e| e.to_string())?;
    normalise_session_id(&mut v);
    Ok(v)
}

/// Map the on-disk "sessionId" key → "id" so the TypeScript AuditSession type
/// (which uses `id`) works correctly for disk-loaded sessions.
fn normalise_session_id(v: &mut serde_json::Value) {
    if let Some(obj) = v.as_object_mut() {
        if let Some(sid) = obj.remove("sessionId") {
            obj.insert("id".to_string(), sid);
        }
    }
}

/// Open OS native folder picker. Returns Ok(None) on cancel,
/// Err("INVALID_REPO_PATH") if the selected directory is empty or unreadable.
#[tauri::command]
pub async fn audit_open_folder(
    app: tauri::AppHandle,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::{DialogExt, FilePath};
    let (tx, rx) = tokio::sync::oneshot::channel::<Option<FilePath>>();
    app.dialog().file().pick_folder(move |result| {
        let _ = tx.send(result);
    });
    let path_str = match rx.await.ok().flatten() {
        None => return Ok(None),
        Some(FilePath::Path(p)) => p.to_string_lossy().to_string(),
        Some(FilePath::Url(u)) => u.path().to_string(),
    };
    let entries: Vec<_> = std::fs::read_dir(&path_str)
        .map_err(|_| "INVALID_REPO_PATH".to_string())?
        .collect();
    if entries.is_empty() {
        return Err("INVALID_REPO_PATH".to_string());
    }
    Ok(Some(path_str))
}

/// Write draft JSON to {project_path}/audits/{session_id}/intake.draft.json.
#[tauri::command]
pub async fn audit_save_draft(
    project_path: String,
    session_id: String,
    draft: serde_json::Value,
) -> Result<(), String> {
    let dir = std::path::Path::new(&project_path)
        .join("audits")
        .join(&session_id);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let data = serde_json::to_string_pretty(&draft).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("intake.draft.json"), data).map_err(|e| e.to_string())
}

/// Read intake.draft.json for a session. Returns None if the file does not exist.
#[tauri::command]
pub async fn audit_load_draft(
    project_path: String,
    session_id: String,
) -> Result<Option<serde_json::Value>, String> {
    let path = std::path::Path::new(&project_path)
        .join("audits")
        .join(&session_id)
        .join("intake.draft.json");
    if !path.exists() {
        return Ok(None);
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let val = serde_json::from_str::<serde_json::Value>(&content).map_err(|e| e.to_string())?;
    Ok(Some(val))
}

// ── Phase 2 audit execution commands ─────────────────────────────────────────

/// Send audit_start to the Go engine, which launches RunAudit in a goroutine.
#[tauri::command]
pub async fn audit_start(
    state: tauri::State<'_, crate::EngineState>,
    project_path: String,
    session_id: String,
) -> Result<(), String> {
    engine_send(&state, serde_json::json!({
        "action": "audit_start",
        "projectPath": project_path,
        "sessionId": session_id
    }))
}

/// Send audit_cancel to the Go engine, which calls CancelAudit(sessionId).
#[tauri::command]
pub async fn audit_cancel(
    state: tauri::State<'_, crate::EngineState>,
    session_id: String,
) -> Result<(), String> {
    engine_send(&state, serde_json::json!({
        "action": "audit_cancel",
        "sessionId": session_id
    }))
}

// ── Phase 3 report commands ───────────────────────────────────────────────────

/// Send audit_generate_report to the Go engine, which calls BuildReport in a goroutine.
#[tauri::command]
pub async fn audit_generate_report(
    state: tauri::State<'_, crate::EngineState>,
    project_path: String,
    session_id: String,
) -> Result<(), String> {
    engine_send(&state, serde_json::json!({
        "action": "audit_generate_report",
        "projectPath": project_path,
        "sessionId": session_id
    }))
}

/// Read report.md from disk and return its contents as a string.
#[tauri::command]
pub async fn audit_read_report(
    project_path: String,
    session_id: String,
) -> Result<String, String> {
    let path = std::path::PathBuf::from(&project_path)
        .join("audits")
        .join(&session_id)
        .join("report.md");
    std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read report.md: {e}"))
}

/// Open a native Save dialog and copy report.md to the chosen destination.
/// Returns the destination path, or Err("cancelled") if the user dismisses the dialog.
#[tauri::command]
pub async fn audit_export_report(
    app: tauri::AppHandle,
    project_path: String,
    session_id: String,
    site_name: String,
) -> Result<String, String> {
    use tauri_plugin_dialog::{DialogExt, FilePath};

    let default_name = format!("{}-audit-report.md",
        site_name.to_lowercase().replace(' ', "-"));

    let (tx, rx) = tokio::sync::oneshot::channel::<Option<FilePath>>();
    app.dialog()
        .file()
        .set_title("Export Audit Report")
        .set_file_name(&default_name)
        .save_file(move |result| { let _ = tx.send(result); });

    let dest_path = match rx.await.ok().flatten() {
        None => return Err("cancelled".to_string()),
        Some(FilePath::Path(p)) => p.to_string_lossy().to_string(),
        Some(FilePath::Url(u)) => u.path().to_string(),
    };

    let src = std::path::PathBuf::from(&project_path)
        .join("audits")
        .join(&session_id)
        .join("report.md");

    std::fs::copy(&src, &dest_path)
        .map_err(|e| format!("Export failed: {e}"))?;

    Ok(dest_path)
}

#[tauri::command]
pub fn get_global_cqc_path() -> String {
    let home = std::env::var(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .unwrap_or_else(|_| ".".to_string());
    format!("{}/.loom-studio", home)
}

#[tauri::command]
pub fn cqc_list_clients(
    state: tauri::State<'_, crate::EngineState>,
    project_path: String,
) -> Result<(), String> {
    engine_send(&state, serde_json::json!({ "action": "cqc_list_clients", "project_path": project_path }))
}

#[tauri::command]
pub fn cqc_save_client(
    state: tauri::State<'_, crate::EngineState>,
    project_path: String,
    client: serde_json::Value,
) -> Result<(), String> {
    engine_send(&state, serde_json::json!({ "action": "cqc_save_client", "project_path": project_path, "client": client }))
}

#[tauri::command]
pub fn cqc_delete_client(
    state: tauri::State<'_, crate::EngineState>,
    project_path: String,
    id: String,
) -> Result<(), String> {
    engine_send(&state, serde_json::json!({ "action": "cqc_delete_client", "project_path": project_path, "id": id }))
}

#[tauri::command]
pub fn cqc_run_text_check(
    state: tauri::State<'_, crate::EngineState>,
    project_path: String,
    client: serde_json::Value,
    text: String,
    user: String,
) -> Result<(), String> {
    engine_send(&state, serde_json::json!({
        "action": "cqc_run_text_check",
        "project_path": project_path,
        "client": client,
        "text": text,
        "user": user
    }))
}

#[tauri::command]
pub fn cqc_run_image_check(
    state: tauri::State<'_, crate::EngineState>,
    project_path: String,
) -> Result<(), String> {
    engine_send(&state, serde_json::json!({ "action": "cqc_run_image_check", "project_path": project_path }))
}

#[tauri::command]
pub fn cqc_list_log(
    state: tauri::State<'_, crate::EngineState>,
    project_path: String,
    limit: Option<i64>,
) -> Result<(), String> {
    engine_send(&state, serde_json::json!({
        "action": "cqc_list_log",
        "project_path": project_path,
        "limit": limit.unwrap_or(100)
    }))
}

// ─── Interactive Terminal ─────────────────────────────────────────────────────

/// Detect the best interactive shell for the current platform.
fn detect_shell() -> String {
    #[cfg(windows)]
    {
        for candidate in &["powershell.exe", "cmd.exe"] {
            if std::process::Command::new("where")
                .arg(candidate)
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
            {
                return candidate.to_string();
            }
        }
        "cmd.exe".into()
    }
    #[cfg(not(windows))]
    {
        let shell = std::env::var("SHELL").unwrap_or_default();
        if !shell.is_empty() && std::path::Path::new(&shell).exists() {
            return shell;
        }
        for s in &["/bin/zsh", "/bin/bash", "/bin/sh"] {
            if std::path::Path::new(s).exists() {
                return s.to_string();
            }
        }
        "/bin/sh".into()
    }
}

/// Spawn a real PTY shell and stream its output to the frontend as base64-encoded
/// `terminal_output` events.
#[tauri::command]
pub async fn create_terminal(
    state: tauri::State<'_, crate::TerminalState>,
    app: tauri::AppHandle,
    id: String,
    cwd: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    use base64::Engine as _;
    use portable_pty::{native_pty_system, CommandBuilder, PtySize};
    use tauri::Emitter;

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let shell = detect_shell();
    let mut cmd = CommandBuilder::new(&shell);

    // Set working directory
    if let Some(ref dir) = cwd {
        cmd.cwd(dir);
    }

    // Shell flags for interactive / login on Unix
    #[cfg(not(windows))]
    {
        let shell_name = std::path::Path::new(&shell)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("sh");
        match shell_name {
            "zsh" => {
                cmd.arg("-i");
                cmd.arg("-l");
            }
            "bash" => {
                cmd.arg("-i");
                cmd.arg("-l");
            }
            _ => {
                cmd.arg("-i");
            }
        }
    }

    // Environment
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("LANG", "en_US.UTF-8");
    cmd.env("PATH", expanded_path());

    // Spawn into the slave side of the PTY
    let _child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

    // Writer goes into the session; reader runs in a background task
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

    let term_id = id.clone();
    let app_handle = app.clone();

    // Background reader task — streams PTY output to the frontend
    std::thread::spawn(move || {
        use tauri::Manager;
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => {
                    let _ = app_handle.emit(
                        "terminal_exit",
                        serde_json::json!({ "id": term_id, "code": null }),
                    );
                    if let Some(state) = app_handle.try_state::<crate::TerminalState>() {
                        if let Ok(mut sessions) = state.sessions.lock() {
                            sessions.remove(&term_id);
                        }
                    }
                    break;
                }
                Ok(n) => {
                    let encoded = base64::engine::general_purpose::STANDARD.encode(&buf[..n]);
                    let _ = app_handle.emit(
                        "terminal_output",
                        serde_json::json!({ "id": term_id, "data": encoded }),
                    );
                }
            }
        }
    });

    // Store session
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    sessions.insert(
        id,
        crate::TerminalSession {
            writer,
            master: pair.master,
        },
    );

    Ok(())
}

/// Forward raw keystroke / paste data from xterm.js to the PTY stdin.
#[tauri::command]
pub fn write_to_terminal(
    state: tauri::State<'_, crate::TerminalState>,
    id: String,
    data: String,
) -> Result<(), String> {
    use std::io::Write;
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions
        .get_mut(&id)
        .ok_or_else(|| format!("Terminal session '{}' not found", id))?;
    session.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    session.writer.flush().map_err(|e| e.to_string())?;
    Ok(())
}

/// Notify the PTY of new terminal dimensions (for programs like vim / htop).
#[tauri::command]
pub fn resize_terminal(
    state: tauri::State<'_, crate::TerminalState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    use portable_pty::PtySize;
    let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions
        .get(&id)
        .ok_or_else(|| format!("Terminal session '{}' not found", id))?;
    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())
}

/// Kill the shell and remove its session from state.
#[tauri::command]
pub fn kill_terminal(
    state: tauri::State<'_, crate::TerminalState>,
    id: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    sessions.remove(&id);
    Ok(())
}

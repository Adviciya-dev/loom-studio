use std::collections::HashMap;
use std::fs;
use std::path::Path;

use crate::{EngineState, HarnessChatState};

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

    let mut child = Command::new("claude")
        .args(&args)
        .current_dir(&project_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start Claude: {}", e))?;

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
pub fn gh_check() -> bool {
    std::process::Command::new("which").arg("gh").output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Returns the default branch name from gh CLI, falling back to "main".
#[tauri::command]
pub fn gh_default_branch(project_path: String) -> String {
    let result = std::process::Command::new("gh")
        .args(["repo", "view", "--json", "defaultBranchRef", "--jq", ".defaultBranchRef.name"])
        .current_dir(&project_path)
        .output();
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
pub fn gh_pr_list(project_path: String) -> Vec<serde_json::Value> {
    let out = std::process::Command::new("gh")
        .args(["pr", "list", "--json", "number,title,headRefName,state,url"])
        .current_dir(&project_path)
        .output();
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

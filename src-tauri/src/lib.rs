mod commands;

use std::sync::Mutex;
use tauri::{Emitter, Manager};
use tauri_plugin_shell::{process::CommandChild, ShellExt};

pub struct EngineState {
    pub stdin: Mutex<Option<CommandChild>>,
}

pub struct HarnessChatState {
    pub pid: Mutex<Option<u32>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(EngineState {
            stdin: Mutex::new(None),
        })
        .manage(HarnessChatState {
            pid: Mutex::new(None),
        })
        .setup(|app| {
            #[cfg(debug_assertions)]
            app.get_webview_window("main").unwrap().open_devtools();

            let handle = app.handle().clone();
            let sidecar = app.shell().sidecar("loom-engine")?;
            let (mut rx, child) = sidecar.spawn()?;

            // Store the child process so commands can write to its stdin.
            *app.state::<EngineState>().stdin.lock().unwrap() = Some(child);

            tauri::async_runtime::spawn(async move {
                use tauri_plugin_shell::process::CommandEvent;
                while let Some(event) = rx.recv().await {
                    if let CommandEvent::Stdout(line) = event {
                        let text = String::from_utf8_lossy(&line);
                        let text = text.trim();
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(text) {
                            if let Some(event_name) =
                                val.get("event").and_then(|e| e.as_str())
                            {
                                let payload = val
                                    .get("payload")
                                    .cloned()
                                    .unwrap_or(serde_json::Value::Null);
                                let emit_name = if event_name == "ready" {
                                    "engine_ready"
                                } else {
                                    event_name
                                };
                                let _ = handle.emit(emit_name, payload);
                            }
                        }
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::open_folder_picker,
            commands::open_file_picker,
            commands::read_harness_tasks,
            commands::engine_command,
            commands::read_directory,
            commands::read_file_content,
            commands::write_file_content,
            commands::open_in_editor,
            commands::invoke_claude,
            commands::stop_harness_chat,
            commands::git_log_branch,
            commands::git_branch_pushed,
            commands::gh_check,
            commands::gh_default_branch,
            commands::gh_pr_list,
            commands::get_platform,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

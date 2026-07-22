use serde_json::{json, Value};
use tauri::Manager;

fn task_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory.join("ai-tasks.json"))
}

#[tauri::command]
pub fn load_ai_tasks(app: tauri::AppHandle) -> Result<Value, String> {
    match std::fs::read_to_string(task_path(&app)?) {
        Ok(contents) => serde_json::from_str(&contents).map_err(|error| error.to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Ok(json!({ "version": 1, "tasks": [] }))
        }
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub fn save_ai_tasks(app: tauri::AppHandle, store: Value) -> Result<(), String> {
    let path = task_path(&app)?;
    let temporary = path.with_extension("json.tmp");
    let json = serde_json::to_string_pretty(&store).map_err(|error| error.to_string())?;
    std::fs::write(&temporary, json).map_err(|error| error.to_string())?;
    std::fs::rename(&temporary, &path).map_err(|error| error.to_string())
}

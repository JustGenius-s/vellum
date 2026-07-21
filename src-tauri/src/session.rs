use tauri::Manager;

#[derive(serde::Serialize, serde::Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SavedState {
    #[serde(alias = "vault_path")]
    vault_path: Option<String>,
    #[serde(alias = "open_tabs")]
    open_tabs: Vec<String>,
    #[serde(alias = "active_tab_path")]
    active_tab_path: Option<String>,
    #[serde(alias = "latin_font")]
    latin_font: Option<String>,
    #[serde(alias = "cjk_font")]
    cjk_font: Option<String>,
    #[serde(alias = "package_cache_path")]
    package_cache_path: Option<String>,
    #[serde(alias = "package_data_path")]
    package_data_path: Option<String>,
}

fn state_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory.join("session.json"))
}

#[tauri::command]
pub fn load_state(app: tauri::AppHandle) -> Result<SavedState, String> {
    match std::fs::read_to_string(state_path(&app)?) {
        Ok(contents) => serde_json::from_str(&contents).map_err(|error| error.to_string()),
        Err(_) => Ok(SavedState::default()),
    }
}

#[tauri::command]
pub fn save_state(app: tauri::AppHandle, state: SavedState) -> Result<(), String> {
    let json = serde_json::to_string_pretty(&state).map_err(|error| error.to_string())?;
    std::fs::write(state_path(&app)?, json).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::SavedState;

    #[test]
    fn session_uses_camel_case_keys() {
        let value = serde_json::to_value(SavedState {
            vault_path: Some("/notes".into()),
            open_tabs: vec!["/notes/main.typ".into()],
            active_tab_path: Some("/notes/main.typ".into()),
            latin_font: Some("Libertinus Serif".into()),
            cjk_font: Some("Songti SC".into()),
            package_cache_path: Some("/packages/downloaded".into()),
            package_data_path: Some("/packages/local".into()),
        })
        .expect("serialize session");
        assert_eq!(value["vaultPath"], "/notes");
        assert!(value.get("vault_path").is_none());
        assert_eq!(value["latinFont"], "Libertinus Serif");
        assert_eq!(value["cjkFont"], "Songti SC");
        assert_eq!(value["packageCachePath"], "/packages/downloaded");
        assert_eq!(value["packageDataPath"], "/packages/local");
    }
}

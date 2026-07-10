mod world;

use regex::Regex;
use std::collections::HashMap;
use std::path::Path;
use tauri::Manager;
use typst::diag::{Severity, SourceDiagnostic};
use typst::{World, WorldExt};
use walkdir::WalkDir;

static WIKILINK_RE: std::sync::LazyLock<Regex> =
    std::sync::LazyLock::new(|| Regex::new(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]").unwrap());

fn expand_wikilinks(source: &str) -> String {
    WIKILINK_RE
        .replace_all(source, |caps: &regex::Captures| {
            let target = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            let label = caps.get(2).map(|m| m.as_str()).unwrap_or(target);
            let escaped_target = target.replace('\\', "\\\\").replace('"', "\\\"");
            let escaped_label = label.replace('\\', "\\\\").replace('"', "\\\"");
            format!("#link(\"{}.typ\")[{}]", escaped_target, escaped_label)
        })
        .to_string()
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CompileDiagnostic {
    severity: String,
    message: String,
    line: Option<u32>,
    column: Option<u32>,
    path: Option<String>,
    hints: Vec<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct CompileSvgResult {
    svg: Option<String>,
    diagnostics: Vec<CompileDiagnostic>,
}

fn format_diagnostic(world: &world::TypstWorld, diag: &SourceDiagnostic) -> CompileDiagnostic {
    let severity = match diag.severity {
        Severity::Error => "error",
        Severity::Warning => "warning",
    }
    .to_string();

    let mut line = None;
    let mut column = None;
    let mut path = None;

    if let Some(id) = diag.span.id() {
        path = Some(id.vpath().get_without_slash().to_string());
        if let Some(range) = world.range(diag.span) {
            if let Ok(source) = world.source(id) {
                if let Some((l, c)) = source.lines().byte_to_line_column(range.start) {
                    line = Some((l + 1) as u32);
                    column = Some((c + 1) as u32);
                }
            }
        }
    }

    let hints = diag.hints.iter().map(|h| h.v.to_string()).collect();

    CompileDiagnostic {
        severity,
        message: diag.message.to_string(),
        line,
        column,
        path,
        hints,
    }
}

#[tauri::command]
fn compile_typst_pdf(
    source: String,
    vault_path: String,
    main_file: String,
) -> Result<Vec<u8>, String> {
    let expanded = expand_wikilinks(&source);
    let world = world::TypstWorld::new(expanded, vault_path, main_file);
    let warned = typst::compile::<typst_layout::PagedDocument>(&world);
    let document = warned.output.map_err(|errors| {
        errors
            .iter()
            .map(|e| e.message.to_string())
            .collect::<Vec<_>>()
            .join("; ")
    })?;
    let pdf = typst_pdf::pdf(&document, &typst_pdf::PdfOptions::default())
        .map_err(|e| format!("{:?}", e))?;
    Ok(pdf)
}

#[tauri::command]
fn compile_typst_svg(
    source: String,
    vault_path: String,
    main_file: String,
) -> Result<CompileSvgResult, String> {
    let expanded = expand_wikilinks(&source);
    let world = world::TypstWorld::new(expanded, vault_path, main_file);
    let warned = typst::compile::<typst_layout::PagedDocument>(&world);

    let mut diagnostics: Vec<CompileDiagnostic> = warned
        .warnings
        .iter()
        .map(|d| format_diagnostic(&world, d))
        .collect();

    match warned.output {
        Ok(document) => {
            let svg = typst_svg::svg_merged(
                &document,
                &typst_svg::SvgOptions::default(),
                typst::layout::Abs::zero(),
            );
            Ok(CompileSvgResult {
                svg: Some(svg),
                diagnostics,
            })
        }
        Err(errors) => {
            diagnostics.extend(errors.iter().map(|d| format_diagnostic(&world, d)));
            Ok(CompileSvgResult {
                svg: None,
                diagnostics,
            })
        }
    }
}

#[derive(serde::Serialize, Clone)]
struct TreeNode {
    name: String,
    path: String,
    is_dir: bool,
    children: Vec<TreeNode>,
}

fn build_tree(path: &Path) -> Vec<TreeNode> {
    let mut nodes = Vec::new();
    let entries = match std::fs::read_dir(path) {
        Ok(e) => e,
        Err(_) => return nodes,
    };
    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let entry_path = entry.path();
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let children = if is_dir {
            build_tree(&entry_path)
        } else {
            Vec::new()
        };
        nodes.push(TreeNode {
            name,
            path: entry_path.to_string_lossy().to_string(),
            is_dir,
            children,
        });
    }
    nodes.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name)));
    nodes
}

#[tauri::command]
fn list_vault_tree(path: String) -> Result<Vec<TreeNode>, String> {
    Ok(build_tree(Path::new(&path)))
}

fn ensure_within_vault(path: &str, vault_path: &str) -> Result<std::path::PathBuf, String> {
    let vault = std::path::Path::new(vault_path)
        .canonicalize()
        .map_err(|e| format!("Invalid vault path: {e}"))?;
    let resolved = if std::path::Path::new(path).is_absolute() {
        std::path::Path::new(path).to_path_buf()
    } else {
        vault.join(path)
    };
    let canonical = resolved
        .canonicalize()
        .map_err(|e| format!("Invalid path: {e}"))?;
    if !canonical.starts_with(&vault) {
        return Err("Path is outside the vault".into());
    }
    Ok(canonical)
}

fn ensure_new_path_within_vault(
    path: &str,
    vault_path: &str,
) -> Result<std::path::PathBuf, String> {
    let vault = std::path::Path::new(vault_path)
        .canonicalize()
        .map_err(|e| format!("Invalid vault path: {e}"))?;
    let requested = if std::path::Path::new(path).is_absolute() {
        std::path::Path::new(path).to_path_buf()
    } else {
        vault.join(path)
    };
    let file_name = requested
        .file_name()
        .ok_or_else(|| "Path must have a file name".to_string())?;
    let parent = requested
        .parent()
        .ok_or_else(|| "Path must have a parent directory".to_string())?
        .canonicalize()
        .map_err(|e| format!("Invalid parent directory: {e}"))?;
    if !parent.starts_with(&vault) {
        return Err("Path is outside the vault".into());
    }
    Ok(parent.join(file_name))
}

#[tauri::command]
fn create_file(path: String, vault_path: String, is_dir: bool) -> Result<(), String> {
    let resolved = ensure_new_path_within_vault(&path, &vault_path)?;
    if resolved.exists() {
        return Err("A file or folder with that name already exists".into());
    }
    if is_dir {
        std::fs::create_dir(&resolved).map_err(|e| e.to_string())
    } else {
        if !path.ends_with(".typ") {
            return Err("Only .typ files allowed".into());
        }
        std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&resolved)
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn rename_path(old_path: String, new_path: String, vault_path: String) -> Result<(), String> {
    let old_resolved = ensure_within_vault(&old_path, &vault_path)?;
    let new_resolved = ensure_new_path_within_vault(&new_path, &vault_path)?;
    if new_resolved.exists() {
        return Err("A file or folder with that name already exists".into());
    }
    std::fs::rename(&old_resolved, &new_resolved).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_path(path: String, vault_path: String) -> Result<(), String> {
    let resolved = ensure_within_vault(&path, &vault_path)?;
    let vault = std::path::Path::new(&vault_path)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if resolved == vault {
        return Err("Cannot delete the vault root".into());
    }
    if resolved.is_dir() {
        std::fs::remove_dir_all(&resolved).map_err(|e| e.to_string())
    } else {
        std::fs::remove_file(&resolved).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn read_file(path: String, vault_path: String) -> Result<String, String> {
    let resolved = ensure_within_vault(&path, &vault_path)?;
    std::fs::read_to_string(&resolved).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(path: String, content: String, vault_path: String) -> Result<(), String> {
    let resolved = ensure_within_vault(&path, &vault_path)?;
    std::fs::write(&resolved, content).map_err(|e| e.to_string())
}

fn file_stem(path: &str) -> String {
    Path::new(path)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default()
}

#[tauri::command]
fn index_backlinks(vault_path: String) -> Result<BacklinkIndex, String> {
    let mut links: HashMap<String, Vec<String>> = HashMap::new();

    for entry in WalkDir::new(&vault_path).max_depth(3) {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_file() || path.extension().and_then(|e| e.to_str()) != Some("typ") {
            continue;
        }
        let content = match std::fs::read_to_string(path) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let source_file = path.to_string_lossy().to_string();
        let stem = file_stem(&source_file);

        for caps in WIKILINK_RE.captures_iter(&content) {
            let target = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            if target.is_empty() {
                continue;
            }
            links
                .entry(target.to_string())
                .or_default()
                .push(stem.clone());
        }
    }

    Ok(BacklinkIndex { links })
}

#[derive(serde::Serialize)]
struct BacklinkIndex {
    links: HashMap<String, Vec<String>>,
}

#[derive(serde::Serialize, serde::Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct SavedState {
    #[serde(alias = "vault_path")]
    vault_path: Option<String>,
    #[serde(alias = "open_tabs")]
    open_tabs: Vec<String>,
    #[serde(alias = "active_tab_path")]
    active_tab_path: Option<String>,
}

#[tauri::command]
fn load_state(app: tauri::AppHandle) -> Result<SavedState, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let config_path = data_dir.join("config.json");
    match std::fs::read_to_string(&config_path) {
        Ok(contents) => serde_json::from_str(&contents).map_err(|e| e.to_string()),
        Err(_) => Ok(SavedState::default()),
    }
}

#[tauri::command]
fn save_state(app: tauri::AppHandle, state: SavedState) -> Result<(), String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let config_path = data_dir.join("config.json");
    let json = serde_json::to_string_pretty(&state).map_err(|e| e.to_string())?;
    std::fs::write(&config_path, json).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            compile_typst_pdf,
            compile_typst_svg,
            list_vault_tree,
            read_file,
            write_file,
            create_file,
            rename_path,
            delete_path,
            index_backlinks,
            load_state,
            save_state,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_directory() -> std::path::PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be valid")
            .as_nanos();
        std::env::temp_dir().join(format!("vellum-test-{}-{unique}", std::process::id()))
    }

    #[test]
    fn saved_state_uses_camel_case_keys() {
        let state = SavedState {
            vault_path: Some("/notes".into()),
            open_tabs: vec!["/notes/main.typ".into()],
            active_tab_path: Some("/notes/main.typ".into()),
        };

        let value = serde_json::to_value(state).expect("state should serialize");

        assert_eq!(value["vaultPath"], "/notes");
        assert_eq!(value["openTabs"][0], "/notes/main.typ");
        assert_eq!(value["activeTabPath"], "/notes/main.typ");
        assert!(value.get("vault_path").is_none());
    }

    #[test]
    fn saved_state_accepts_legacy_snake_case_keys() {
        let legacy = serde_json::json!({
            "vault_path": "/notes",
            "open_tabs": ["/notes/main.typ"],
            "active_tab_path": "/notes/main.typ"
        });

        let state: SavedState =
            serde_json::from_value(legacy).expect("legacy state should deserialize");

        assert_eq!(state.vault_path.as_deref(), Some("/notes"));
        assert_eq!(state.open_tabs, ["/notes/main.typ"]);
        assert_eq!(state.active_tab_path.as_deref(), Some("/notes/main.typ"));
    }

    #[test]
    fn new_paths_must_stay_inside_the_vault() {
        let root = test_directory();
        let vault = root.join("vault");
        let outside = root.join("outside");
        std::fs::create_dir_all(&vault).expect("vault should be created");
        std::fs::create_dir_all(&outside).expect("outside directory should be created");

        let inside = vault.join("note.typ");
        let resolved = ensure_new_path_within_vault(
            inside.to_string_lossy().as_ref(),
            vault.to_string_lossy().as_ref(),
        )
        .expect("inside path should be accepted");
        assert_eq!(
            resolved,
            vault
                .canonicalize()
                .expect("vault should canonicalize")
                .join("note.typ")
        );

        let escaped = outside.join("note.typ");
        assert!(ensure_new_path_within_vault(
            escaped.to_string_lossy().as_ref(),
            vault.to_string_lossy().as_ref(),
        )
        .is_err());

        std::fs::remove_dir_all(root).expect("test directory should be removed");
    }
}

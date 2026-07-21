use regex::{Regex, RegexBuilder};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;
use walkdir::WalkDir;

static WIKILINK_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]").expect("valid wikilink regex")
});

#[derive(serde::Serialize, Clone)]
pub struct TreeNode {
    name: String,
    path: String,
    is_dir: bool,
    children: Vec<TreeNode>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatch {
    path: String,
    relative_path: String,
    line: u32,
    column: u32,
    preview: String,
}

#[derive(serde::Serialize)]
pub struct BacklinkIndex {
    links: HashMap<String, Vec<String>>,
}

fn is_supported_document(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase())
            .as_deref(),
        Some("typ" | "md" | "bib")
    )
}

fn build_tree(path: &Path) -> Vec<TreeNode> {
    let Ok(entries) = std::fs::read_dir(path) else {
        return Vec::new();
    };
    let mut nodes = Vec::new();

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let entry_path = entry.path();
        let is_dir = entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false);
        if !is_dir && !is_supported_document(&entry_path) {
            continue;
        }
        nodes.push(TreeNode {
            name,
            path: entry_path.to_string_lossy().to_string(),
            is_dir,
            children: if is_dir {
                build_tree(&entry_path)
            } else {
                Vec::new()
            },
        });
    }

    nodes.sort_by(|left, right| {
        right
            .is_dir
            .cmp(&left.is_dir)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    nodes
}

fn canonical_vault(vault_path: &str) -> Result<PathBuf, String> {
    Path::new(vault_path)
        .canonicalize()
        .map_err(|error| format!("Invalid vault path: {error}"))
}

fn existing_path(path: &str, vault_path: &str) -> Result<PathBuf, String> {
    let vault = canonical_vault(vault_path)?;
    let requested = if Path::new(path).is_absolute() {
        PathBuf::from(path)
    } else {
        vault.join(path)
    };
    let resolved = requested
        .canonicalize()
        .map_err(|error| format!("Invalid path: {error}"))?;
    if !resolved.starts_with(&vault) {
        return Err("Path is outside the vault".into());
    }
    Ok(resolved)
}

fn resolve_new_path(path: &str, vault_path: &str) -> Result<PathBuf, String> {
    let vault = canonical_vault(vault_path)?;
    let requested = if Path::new(path).is_absolute() {
        PathBuf::from(path)
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
        .map_err(|error| format!("Invalid parent directory: {error}"))?;
    if !parent.starts_with(&vault) {
        return Err("Path is outside the vault".into());
    }
    Ok(parent.join(file_name))
}

#[tauri::command]
pub fn list_vault_tree(path: String) -> Result<Vec<TreeNode>, String> {
    let vault = canonical_vault(&path)?;
    Ok(build_tree(&vault))
}

fn search_vault_sync(vault_path: &str, query: &str) -> Result<Vec<SearchMatch>, String> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let vault = canonical_vault(vault_path)?;
    let matcher = RegexBuilder::new(&regex::escape(query))
        .case_insensitive(true)
        .build()
        .map_err(|error| error.to_string())?;
    let mut matches = Vec::new();

    for entry in WalkDir::new(&vault).into_iter().filter_entry(|entry| {
        entry.depth() == 0 || !entry.file_name().to_string_lossy().starts_with('.')
    }) {
        let Ok(entry) = entry else { continue };
        let path = entry.path();
        if !path.is_file() || !is_supported_document(path) {
            continue;
        }
        let Ok(content) = std::fs::read_to_string(path) else {
            continue;
        };
        let relative_path = path
            .strip_prefix(&vault)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('\\', "/");

        for (line_index, line) in content.lines().enumerate() {
            for found in matcher.find_iter(line) {
                matches.push(SearchMatch {
                    path: path.to_string_lossy().to_string(),
                    relative_path: relative_path.clone(),
                    line: (line_index + 1) as u32,
                    column: (line[..found.start()].chars().count() + 1) as u32,
                    preview: line.trim().chars().take(240).collect(),
                });
                if matches.len() >= 200 {
                    return Ok(matches);
                }
            }
        }
    }
    Ok(matches)
}

#[tauri::command]
pub async fn search_vault(vault_path: String, query: String) -> Result<Vec<SearchMatch>, String> {
    tauri::async_runtime::spawn_blocking(move || search_vault_sync(&vault_path, &query))
        .await
        .map_err(|error| format!("Search task failed: {error}"))?
}

#[tauri::command]
pub fn create_file(path: String, vault_path: String, is_dir: bool) -> Result<(), String> {
    let resolved = resolve_new_path(&path, &vault_path)?;
    if resolved.exists() {
        return Err("A file or folder with that name already exists".into());
    }
    if is_dir {
        std::fs::create_dir(&resolved).map_err(|error| error.to_string())
    } else {
        if !is_supported_document(&resolved) {
            return Err("Only .typ, .md, and .bib files are supported".into());
        }
        std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(resolved)
            .map(|_| ())
            .map_err(|error| error.to_string())
    }
}

#[tauri::command]
pub fn rename_path(old_path: String, new_path: String, vault_path: String) -> Result<(), String> {
    let old_resolved = existing_path(&old_path, &vault_path)?;
    let new_resolved = resolve_new_path(&new_path, &vault_path)?;
    if new_resolved.exists() {
        return Err("A file or folder with that name already exists".into());
    }
    std::fs::rename(old_resolved, new_resolved).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_path(path: String, vault_path: String) -> Result<(), String> {
    let resolved = existing_path(&path, &vault_path)?;
    let vault = canonical_vault(&vault_path)?;
    if resolved == vault {
        return Err("Cannot delete the vault root".into());
    }
    if resolved.is_dir() {
        std::fs::remove_dir_all(resolved).map_err(|error| error.to_string())
    } else {
        std::fs::remove_file(resolved).map_err(|error| error.to_string())
    }
}

#[tauri::command]
pub fn read_file(path: String, vault_path: String) -> Result<String, String> {
    std::fs::read_to_string(existing_path(&path, &vault_path)?).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn write_file(path: String, content: String, vault_path: String) -> Result<(), String> {
    std::fs::write(existing_path(&path, &vault_path)?, content).map_err(|error| error.to_string())
}

fn file_stem(path: &Path) -> String {
    path.file_stem()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_default()
}

#[tauri::command]
pub fn index_backlinks(vault_path: String) -> Result<BacklinkIndex, String> {
    let vault = canonical_vault(&vault_path)?;
    let mut links: HashMap<String, Vec<String>> = HashMap::new();

    for entry in WalkDir::new(&vault).into_iter().filter_entry(|entry| {
        entry.depth() == 0 || !entry.file_name().to_string_lossy().starts_with('.')
    }) {
        let Ok(entry) = entry else { continue };
        let path = entry.path();
        if !path.is_file() || !is_supported_document(path) {
            continue;
        }
        let Ok(content) = std::fs::read_to_string(path) else {
            continue;
        };
        let source = file_stem(path);
        for captures in WIKILINK_RE.captures_iter(&content) {
            if let Some(target) = captures.get(1) {
                let target = file_stem(Path::new(target.as_str()));
                links
                    .entry(target)
                    .or_default()
                    .push(source.clone());
            }
        }
    }
    Ok(BacklinkIndex { links })
}

#[cfg(test)]
mod tests {
    use super::{is_supported_document, resolve_new_path, search_vault_sync};
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn fixture_root() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("valid clock")
            .as_nanos();
        std::env::temp_dir().join(format!("vellum-test-{unique}"))
    }

    #[test]
    fn new_paths_cannot_escape_the_vault() {
        let root = fixture_root();
        let vault = root.join("vault");
        let outside = root.join("outside");
        std::fs::create_dir_all(&vault).expect("create vault");
        std::fs::create_dir_all(&outside).expect("create outside");
        assert!(resolve_new_path(
            outside.join("note.typ").to_string_lossy().as_ref(),
            vault.to_string_lossy().as_ref(),
        )
        .is_err());
        std::fs::remove_dir_all(root).expect("remove fixture");
    }

    #[test]
    fn bibliography_files_are_supported_documents() {
        assert!(is_supported_document(PathBuf::from("references.bib").as_path()));
        assert!(is_supported_document(PathBuf::from("REFERENCES.BIB").as_path()));
    }

    #[test]
    fn search_returns_source_locations() {
        let root = fixture_root();
        let vault = root.join("vault");
        std::fs::create_dir_all(&vault).expect("create vault");
        std::fs::write(vault.join("notes.typ"), "= Intro\nTypst stays local.\n")
            .expect("write note");
        let matches =
            search_vault_sync(vault.to_string_lossy().as_ref(), "typst").expect("search succeeds");
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].line, 2);
        assert_eq!(matches[0].column, 1);

        std::fs::write(vault.join("draft.md"), "# Draft\nMarkdown stays local.\n")
            .expect("write markdown note");
        let markdown_matches = search_vault_sync(
            vault.to_string_lossy().as_ref(),
            "markdown",
        )
        .expect("markdown search succeeds");
        assert_eq!(markdown_matches.len(), 1);
        assert_eq!(markdown_matches[0].line, 2);

        std::fs::write(
            vault.join("references.bib"),
            "@article{knuth1984,\n  title = {Literate Programming}\n}\n",
        )
        .expect("write bibliography");
        let bibliography_matches = search_vault_sync(
            vault.to_string_lossy().as_ref(),
            "literate programming",
        )
        .expect("bibliography search succeeds");
        assert_eq!(bibliography_matches.len(), 1);
        assert_eq!(bibliography_matches[0].line, 2);
        std::fs::remove_dir_all(root).expect("remove fixture");
    }
}

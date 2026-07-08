mod world;

use regex::Regex;
use std::collections::HashMap;
use std::path::Path;
use walkdir::WalkDir;

static WIKILINK_RE: std::sync::LazyLock<Regex> = std::sync::LazyLock::new(|| {
    Regex::new(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]").unwrap()
});

fn expand_wikilinks(source: &str) -> String {
    WIKILINK_RE
        .replace_all(source, |caps: &regex::Captures| {
            let target = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            let label = caps.get(2).map(|m| m.as_str()).unwrap_or(target);
            format!("#link(\"{}.typ\")[{}]", target, label)
        })
        .to_string()
}

#[tauri::command]
fn compile_typst_pdf(source: String) -> Result<Vec<u8>, String> {
    let expanded = expand_wikilinks(&source);
    let world = world::TypstWorld::new(expanded);
    let document = typst::compile::<typst_layout::PagedDocument>(&world)
        .output
        .map_err(|e| format!("{:?}", e))?;
    let pdf = typst_pdf::pdf(&document, &typst_pdf::PdfOptions::default())
        .map_err(|e| format!("{:?}", e))?;
    Ok(pdf)
}

#[tauri::command]
fn compile_typst_svg(source: String) -> Result<String, String> {
    let expanded = expand_wikilinks(&source);
    let world = world::TypstWorld::new(expanded);
    let document = typst::compile::<typst_layout::PagedDocument>(&world)
        .output
        .map_err(|e| format!("{:?}", e))?;
    let svg = typst_svg::svg_merged(
        &document,
        &typst_svg::SvgOptions::default(),
        typst::layout::Abs::zero(),
    );
    Ok(svg)
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

#[tauri::command]
fn list_vault(path: String) -> Result<Vec<FlatEntry>, String> {
    let entries = std::fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        if name.starts_with('.') {
            continue;
        }
        result.push(FlatEntry {
            name,
            path: entry.path().to_string_lossy().to_string(),
            is_dir,
        });
    }
    result.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name)));
    Ok(result)
}

#[tauri::command]
fn create_file(path: String, is_dir: bool) -> Result<(), String> {
    if is_dir {
        std::fs::create_dir_all(&path).map_err(|e| e.to_string())
    } else {
        if !path.ends_with(".typ") {
            return Err("Only .typ files allowed".into());
        }
        std::fs::write(&path, "").map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn rename_path(old_path: String, new_path: String) -> Result<(), String> {
    std::fs::rename(&old_path, &new_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_path(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        std::fs::remove_dir_all(p).map_err(|e| e.to_string())
    } else {
        std::fs::remove_file(p).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

fn file_stem(path: &str) -> String {
    Path::new(path)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default()
}

#[derive(serde::Serialize, Clone)]
struct ZoteroEntry {
    citekey: String,
    title: String,
    authors: String,
    year: String,
}

#[tauri::command]
fn zotero_status() -> Result<bool, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get("http://localhost:23119/better-bibtex/cayw?probe=true")
        .send();
    Ok(resp.map(|r| r.status().is_success()).unwrap_or(false))
}

#[tauri::command]
fn zotero_search(query: String) -> Result<Vec<ZoteroEntry>, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get("http://localhost:23119/better-bibtex/bibliography.json")
        .send()
        .map_err(|e| e.to_string())?;
    let items: Vec<serde_json::Value> = resp.json().map_err(|e| e.to_string())?;

    let q = query.to_lowercase();
    let mut result = Vec::new();
    for item in items {
        let citekey = item
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let title = item
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let authors = item
            .get("author")
            .and_then(|a| a.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|a| {
                        let last = a.get("family").and_then(|v| v.as_str()).unwrap_or("");
                        let first = a.get("given").and_then(|v| v.as_str()).unwrap_or("");
                        if last.is_empty() {
                            None
                        } else {
                            Some(format!("{} {}", first, last))
                        }
                    })
                    .collect::<Vec<_>>()
                    .join(", ")
            })
            .unwrap_or_default();

        let year = item
            .get("issued")
            .and_then(|i| i.get("date-parts"))
            .and_then(|d| d.as_array())
            .and_then(|d| d.first())
            .and_then(|d| d.as_array())
            .and_then(|d| d.first())
            .and_then(|y| y.as_i64())
            .map(|y| y.to_string())
            .unwrap_or_default();

        let hay = format!("{} {} {} {}", citekey, title, authors, year).to_lowercase();
        if q.is_empty() || hay.contains(&q) {
            result.push(ZoteroEntry {
                citekey,
                title,
                authors,
                year,
            });
        }
    }
    Ok(result)
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

        let _ = stem;
    }

    Ok(BacklinkIndex { links })
}

#[derive(serde::Serialize)]
struct FlatEntry {
    name: String,
    path: String,
    is_dir: bool,
}

#[derive(serde::Serialize)]
struct BacklinkIndex {
    links: HashMap<String, Vec<String>>,
}

#[derive(serde::Serialize)]
struct SearchResult {
    path: String,
    stem: String,
    line: usize,
    snippet: String,
}

#[tauri::command]
fn search_vault(vault_path: String, query: String) -> Result<Vec<SearchResult>, String> {
    let q = query.to_lowercase();
    if q.is_empty() {
        return Ok(Vec::new());
    }
    let mut results = Vec::new();
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
        let path_str = path.to_string_lossy().to_string();
        let stem = file_stem(&path_str);
        for (i, line) in content.lines().enumerate() {
            if line.to_lowercase().contains(&q) {
                let snippet = if line.len() > 120 {
                    format!("{}...", &line[..120])
                } else {
                    line.to_string()
                };
                results.push(SearchResult {
                    path: path_str.clone(),
                    stem: stem.clone(),
                    line: i + 1,
                    snippet,
                });
            }
        }
    }
    results.sort_by(|a, b| a.path.cmp(&b.path).then(a.line.cmp(&b.line)));
    Ok(results)
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
            list_vault,
            list_vault_tree,
            read_file,
            write_file,
            create_file,
            rename_path,
            delete_path,
            index_backlinks,
            zotero_status,
            zotero_search,
            search_vault,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
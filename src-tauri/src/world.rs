use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock, Mutex, OnceLock};
use std::time::SystemTime;
use tauri::ipc::Channel;
use typst::foundations::{Bytes, Datetime, Duration};
use typst::syntax::{FileId, RootedPath, Source, VirtualPath, VirtualRoot};
use typst::text::{Font, FontBook, FontInfo};
use typst::utils::LazyHash;
use typst::{Library, LibraryExt, World};
use typst_kit::datetime::Time;
use walkdir::WalkDir;

use crate::{compiler::preprocess_source, packages};

static FONT_LIBRARY: LazyLock<FontLibrary> = LazyLock::new(FontLibrary::load);
static FILE_CACHE: LazyLock<Mutex<FileSnapshotCache>> =
    LazyLock::new(|| Mutex::new(FileSnapshotCache::new(64 * 1024 * 1024)));

#[derive(Clone)]
struct FileSnapshot {
    modified: Option<SystemTime>,
    len: u64,
    bytes: Vec<u8>,
    last_used: u64,
}

struct FileSnapshotCache {
    entries: HashMap<PathBuf, FileSnapshot>,
    bytes: usize,
    capacity: usize,
    clock: u64,
}

impl FileSnapshotCache {
    fn new(capacity: usize) -> Self {
        Self { entries: HashMap::new(), bytes: 0, capacity, clock: 0 }
    }

    fn read(&mut self, path: &Path) -> Result<(Vec<u8>, bool), typst::diag::FileError> {
        let metadata = std::fs::metadata(path)
            .map_err(|_| typst::diag::FileError::NotFound(path.to_path_buf()))?;
        let modified = metadata.modified().ok();
        let len = metadata.len();
        self.clock = self.clock.wrapping_add(1);
        if let Some(snapshot) = self.entries.get_mut(path) {
            if snapshot.modified == modified && snapshot.len == len {
                snapshot.last_used = self.clock;
                return Ok((snapshot.bytes.clone(), true));
            }
        }
        let bytes = std::fs::read(path)
            .map_err(|_| typst::diag::FileError::NotFound(path.to_path_buf()))?;
        if let Some(previous) = self.entries.remove(path) {
            self.bytes = self.bytes.saturating_sub(previous.bytes.len());
        }
        self.bytes += bytes.len();
        self.entries.insert(path.to_path_buf(), FileSnapshot {
            modified,
            len,
            bytes: bytes.clone(),
            last_used: self.clock,
        });
        while self.bytes > self.capacity && self.entries.len() > 1 {
            let Some(oldest) = self.entries.iter().min_by_key(|(_, value)| value.last_used).map(|(path, _)| path.clone()) else { break; };
            if let Some(removed) = self.entries.remove(&oldest) {
                self.bytes = self.bytes.saturating_sub(removed.bytes.len());
            }
        }
        Ok((bytes, false))
    }
}

#[derive(Clone, Default)]
pub struct WorldMetrics {
    pub file_cache_hits: usize,
    pub file_cache_misses: usize,
}

pub struct WorldOverlay {
    pub path: String,
    pub revision: u64,
    pub content: String,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompileProgress {
    stage: String,
    value: u8,
    label: String,
    detail: Option<String>,
}

#[derive(Clone)]
pub struct CompileProgressReporter {
    channel: Channel<CompileProgress>,
    seen_files: Arc<Mutex<HashSet<String>>>,
}

impl CompileProgressReporter {
    pub fn new(channel: Channel<CompileProgress>) -> Self {
        Self {
            channel,
            seen_files: Arc::new(Mutex::new(HashSet::new())),
        }
    }

    pub fn emit(&self, stage: &str, value: u8, label: &str, detail: Option<String>) {
        let _ = self.channel.send(CompileProgress {
            stage: stage.to_string(),
            value,
            label: label.to_string(),
            detail,
        });
    }

    fn report_file(&self, id: FileId, source: bool) {
        let (key, label, detail) = match id.root() {
            VirtualRoot::Project => {
                let path = id.vpath().get_without_slash().to_string();
                (
                    format!("project:{path}"),
                    if source { "Compiling file" } else { "Loading asset" },
                    path,
                )
            }
            VirtualRoot::Package(spec) => {
                let path = id.vpath().get_without_slash();
                (
                    format!("package:{spec}:{path}"),
                    "Loading package",
                    format!("{spec} /{path}"),
                )
            }
        };

        let count = {
            let Ok(mut seen_files) = self.seen_files.lock() else {
                return;
            };
            if !seen_files.insert(key) {
                return;
            }
            seen_files.len()
        };
        let value = (24usize + count.saturating_mul(4)).min(68) as u8;
        self.emit("compiling", value, label, Some(detail));
    }
}

enum FontSource {
    Embedded(Font),
    System {
        file: Arc<SystemFontFile>,
        index: u32,
        loaded: OnceLock<Option<Font>>,
    },
}

struct SystemFontFile {
    path: PathBuf,
    data: OnceLock<Option<Bytes>>,
}

impl SystemFontFile {
    fn new(path: PathBuf) -> Self {
        Self {
            path,
            data: OnceLock::new(),
        }
    }

    fn data(&self) -> Option<Bytes> {
        self.data
            .get_or_init(|| std::fs::read(&self.path).ok().map(Bytes::new))
            .clone()
    }
}

struct FontSlot {
    info: FontInfo,
    source: FontSource,
}

impl FontSlot {
    fn embedded(font: Font) -> Self {
        Self {
            info: font.info().clone(),
            source: FontSource::Embedded(font),
        }
    }

    fn system(file: Arc<SystemFontFile>, index: u32, info: FontInfo) -> Self {
        Self {
            info,
            source: FontSource::System {
                file,
                index,
                loaded: OnceLock::new(),
            },
        }
    }

    fn get(&self) -> Option<Font> {
        match &self.source {
            FontSource::Embedded(font) => Some(font.clone()),
            FontSource::System {
                file,
                index,
                loaded,
            } => loaded
                .get_or_init(|| file.data().and_then(|data| Font::new(data, *index)))
                .clone(),
        }
    }
}

struct FontLibrary {
    book: FontBook,
    slots: Vec<FontSlot>,
}

#[derive(serde::Serialize)]
pub struct FontCatalog {
    latin: Vec<String>,
    cjk: Vec<String>,
}

impl FontLibrary {
    fn load() -> Self {
        let mut slots = load_system_fonts();
        slots.extend(
            typst_assets::fonts()
                .flat_map(|data| Font::iter(Bytes::new(data)))
                .map(FontSlot::embedded),
        );
        let book = FontBook::from_infos(slots.iter().map(|slot| slot.info.clone()));
        Self { book, slots }
    }
}

fn is_font_path(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase())
            .as_deref(),
        Some("ttf" | "otf" | "ttc" | "otc")
    )
}

fn system_font_dirs() -> Vec<PathBuf> {
    let mut dirs = std::env::var_os("TYPST_FONT_PATHS")
        .map(|value| std::env::split_paths(&value).collect::<Vec<_>>())
        .unwrap_or_default();

    #[cfg(target_os = "macos")]
    {
        dirs.extend([
            PathBuf::from("/System/Library/Fonts"),
            PathBuf::from("/Library/Fonts"),
        ]);
        if let Some(home) = std::env::var_os("HOME") {
            dirs.push(PathBuf::from(home).join("Library/Fonts"));
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(windir) = std::env::var_os("WINDIR") {
            dirs.push(PathBuf::from(windir).join("Fonts"));
        }
        if let Some(local_app_data) = std::env::var_os("LOCALAPPDATA") {
            dirs.push(PathBuf::from(local_app_data).join("Microsoft/Windows/Fonts"));
        }
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        dirs.extend([
            PathBuf::from("/usr/share/fonts"),
            PathBuf::from("/usr/local/share/fonts"),
        ]);
        if let Some(home) = std::env::var_os("HOME") {
            let home = PathBuf::from(home);
            dirs.push(home.join(".fonts"));
            dirs.push(home.join(".local/share/fonts"));
        }
    }

    let mut seen = HashSet::new();
    dirs.into_iter()
        .filter(|path| path.is_dir())
        .filter(|path| seen.insert(path.canonicalize().unwrap_or_else(|_| path.clone())))
        .collect()
}

fn load_system_fonts() -> Vec<FontSlot> {
    let mut slots = Vec::new();
    let mut seen_files = HashSet::new();

    for directory in system_font_dirs() {
        let mut paths = WalkDir::new(directory)
            .into_iter()
            .filter_map(Result::ok)
            .map(|entry| entry.into_path())
            .filter(|path| path.is_file() && is_font_path(path))
            .collect::<Vec<_>>();
        paths.sort();

        for path in paths {
            let canonical = path.canonicalize().unwrap_or(path);
            if !seen_files.insert(canonical.clone()) {
                continue;
            }
            let Ok(data) = std::fs::read(&canonical) else {
                continue;
            };
            let file = Arc::new(SystemFontFile::new(canonical));
            for font in Font::iter(Bytes::new(data)) {
                slots.push(FontSlot::system(
                    file.clone(),
                    font.index(),
                    font.info().clone(),
                ));
            }
        }
    }

    slots
}

#[tauri::command]
pub async fn list_font_families() -> Result<FontCatalog, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let mut latin = Vec::new();
        let mut cjk = Vec::new();

        for (family, indices) in FONT_LIBRARY.book.families() {
            let infos = indices.filter_map(|index| FONT_LIBRARY.book.info(index));
            let (has_latin, has_cjk) = infos.fold((false, false), |(latin, cjk), info| {
                (
                    latin || info.coverage.contains('A' as u32),
                    cjk
                        || info.coverage.contains('中' as u32)
                        || info.coverage.contains('文' as u32),
                )
            });
            if has_cjk {
                cjk.push(family.to_string());
            } else if has_latin {
                latin.push(family.to_string());
            }
        }

        latin.sort_by_key(|family| family.to_lowercase());
        cjk.sort_by_key(|family| family.to_lowercase());
        FontCatalog { latin, cjk }
    })
    .await
    .map_err(|error| format!("Font discovery task failed: {error}"))
}

pub struct TypstWorld {
    library: LazyHash<Library>,
    book: LazyHash<FontBook>,
    main: FileId,
    source: Source,
    vault_path: String,
    main_vpath: VirtualPath,
    package_cache_path: Option<String>,
    package_data_path: Option<String>,
    progress: Option<CompileProgressReporter>,
    overlays: HashMap<String, (u64, String)>,
    metrics: Arc<Mutex<WorldMetrics>>,
    time: Time,
}

impl TypstWorld {
    pub fn new(
        source: String,
        vault_path: String,
        main_file: String,
        package_cache_path: Option<String>,
        package_data_path: Option<String>,
        progress: Option<CompileProgressReporter>,
        overlays: Vec<WorldOverlay>,
    ) -> Result<Self, String> {
        let library = Library::default();
        let book = FONT_LIBRARY.book.clone();
        let relative = main_file
            .strip_prefix(&vault_path)
            .unwrap_or(&main_file)
            .trim_start_matches(|character| character == '/' || character == '\\');
        let main_vpath = VirtualPath::new(format!("/{}", relative.replace('\\', "/")))
            .unwrap_or_else(|_| VirtualPath::new("/main.typ").expect("valid fallback path"));
        let main = FileId::new(RootedPath::new(VirtualRoot::Project, main_vpath.clone()));

        let vault = Path::new(&vault_path)
            .canonicalize()
            .map_err(|error| format!("Invalid vault path: {error}"))?;
        let mut normalized_overlays = HashMap::new();
        for overlay in overlays {
            let requested = Path::new(&overlay.path);
            let absolute = if requested.is_absolute() {
                requested.to_path_buf()
            } else {
                vault.join(requested)
            };
            let resolved = absolute
                .canonicalize()
                .map_err(|error| format!("Invalid overlay path {}: {error}", overlay.path))?;
            let relative = resolved
                .strip_prefix(&vault)
                .map_err(|_| format!("Overlay leaves the open vault: {}", overlay.path))?;
            normalized_overlays.insert(
                relative.to_string_lossy().replace('\\', "/"),
                (overlay.revision, overlay.content),
            );
        }

        Ok(Self {
            library: LazyHash::new(library),
            book: LazyHash::new(book),
            main,
            source: Source::new(main, source),
            vault_path,
            main_vpath,
            package_cache_path,
            package_data_path,
            progress,
            overlays: normalized_overlays,
            metrics: Arc::new(Mutex::new(WorldMetrics::default())),
            time: Time::system(),
        })
    }

    fn resolve_project_to_disk(
        &self,
        id: FileId,
    ) -> Result<std::path::PathBuf, typst::diag::FileError> {
        let relative = if id == self.main {
            std::path::Path::new(self.main_vpath.get_without_slash())
        } else {
            std::path::Path::new(id.vpath().get_without_slash())
        };
        let requested = std::path::Path::new(&self.vault_path).join(relative);
        let resolved = requested
            .canonicalize()
            .map_err(|_| typst::diag::FileError::NotFound(requested.clone()))?;
        let vault = std::path::Path::new(&self.vault_path)
            .canonicalize()
            .map_err(|_| typst::diag::FileError::NotFound(self.vault_path.clone().into()))?;
        if !resolved.starts_with(vault) {
            return Err(typst::diag::FileError::NotFound(requested));
        }
        Ok(resolved)
    }

    fn relative_key(&self, id: FileId) -> String {
        id.vpath().get_without_slash().replace('\\', "/")
    }

    fn read_project_bytes(&self, id: FileId) -> Result<Vec<u8>, typst::diag::FileError> {
        if let Some((_, content)) = self.overlays.get(&self.relative_key(id)) {
            return Ok(content.as_bytes().to_vec());
        }
        let path = self.resolve_project_to_disk(id)?;
        let (bytes, hit) = FILE_CACHE
            .lock()
            .map_err(|_| typst::diag::FileError::Other(Some("File cache is unavailable".into())))?
            .read(&path)?;
        if let Ok(mut metrics) = self.metrics.lock() {
            if hit { metrics.file_cache_hits += 1; } else { metrics.file_cache_misses += 1; }
        }
        Ok(bytes)
    }

    pub fn metrics(&self) -> WorldMetrics {
        self.metrics.lock().map(|value| value.clone()).unwrap_or_default()
    }
}

impl World for TypstWorld {
    fn library(&self) -> &LazyHash<Library> {
        &self.library
    }

    fn book(&self) -> &LazyHash<FontBook> {
        &self.book
    }

    fn main(&self) -> FileId {
        self.main
    }

    fn source(&self, id: FileId) -> Result<Source, typst::diag::FileError> {
        if id == self.main {
            return Ok(self.source.clone());
        }
        if let Some(progress) = &self.progress {
            progress.report_file(id, true);
        }

        let content = match id.root() {
            VirtualRoot::Project => {
                let bytes = self.read_project_bytes(id)?;
                let content = String::from_utf8(bytes)
                    .map_err(|_| typst::diag::FileError::InvalidUtf8)?;
                preprocess_source(id.vpath().get_without_slash(), &content)
            }
            VirtualRoot::Package(spec) => {
                let bytes = packages::load_package_file(
                    spec,
                    id.vpath(),
                    self.package_cache_path.as_deref(),
                    self.package_data_path.as_deref(),
                )?;
                std::str::from_utf8(bytes.as_slice())
                    .map_err(|_| typst::diag::FileError::InvalidUtf8)?
                    .to_owned()
            }
        };
        Ok(Source::new(id, content))
    }

    fn file(&self, id: FileId) -> Result<Bytes, typst::diag::FileError> {
        if let Some(progress) = &self.progress {
            progress.report_file(id, false);
        }
        match id.root() {
            VirtualRoot::Project => {
                Ok(Bytes::new(self.read_project_bytes(id)?))
            }
            VirtualRoot::Package(spec) => packages::load_package_file(
                spec,
                id.vpath(),
                self.package_cache_path.as_deref(),
                self.package_data_path.as_deref(),
            ),
        }
    }

    fn font(&self, index: usize) -> Option<Font> {
        FONT_LIBRARY.slots.get(index).and_then(FontSlot::get)
    }

    fn today(&self, offset: Option<Duration>) -> Option<Datetime> {
        self.time.today(offset)
    }
}

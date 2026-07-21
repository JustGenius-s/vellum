use regex::Regex;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock, OnceLock};
use typst::foundations::{Bytes, Datetime, Duration};
use typst::syntax::{FileId, RootedPath, Source, VirtualPath, VirtualRoot};
use typst::text::{Font, FontBook, FontInfo};
use typst::utils::LazyHash;
use typst::{Library, LibraryExt, World};
use walkdir::WalkDir;

use crate::packages;

static WIKILINK_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]").expect("valid wikilink regex")
});

static FONT_LIBRARY: LazyLock<FontLibrary> = LazyLock::new(FontLibrary::load);

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

fn expand_wikilinks(source: &str) -> String {
    WIKILINK_RE
        .replace_all(source, |captures: &regex::Captures| {
            let target = captures.get(1).map(|value| value.as_str()).unwrap_or("");
            let label = captures
                .get(2)
                .map(|value| value.as_str())
                .unwrap_or(target);
            let target = if Path::new(target).extension().is_some() {
                target.to_string()
            } else {
                format!("{target}.typ")
            };
            format!(
                "#link(\"{}\")[{}]",
                target.replace('\\', "\\\\").replace('"', "\\\""),
                label.replace('\\', "\\\\").replace('"', "\\\"")
            )
        })
        .into_owned()
}

pub struct TypstWorld {
    library: LazyHash<Library>,
    book: LazyHash<FontBook>,
    main: FileId,
    source: Source,
    vault_path: String,
    main_vpath: VirtualPath,
}

impl TypstWorld {
    pub fn new(source: String, vault_path: String, main_file: String) -> Self {
        let library = Library::default();
        let book = FONT_LIBRARY.book.clone();
        let relative = main_file
            .strip_prefix(&vault_path)
            .unwrap_or(&main_file)
            .trim_start_matches(|character| character == '/' || character == '\\');
        let main_vpath = VirtualPath::new(format!("/{}", relative.replace('\\', "/")))
            .unwrap_or_else(|_| VirtualPath::new("/main.typ").expect("valid fallback path"));
        let main = FileId::new(RootedPath::new(VirtualRoot::Project, main_vpath.clone()));

        Self {
            library: LazyHash::new(library),
            book: LazyHash::new(book),
            main,
            source: Source::new(main, source),
            vault_path,
            main_vpath,
        }
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

        let content = match id.root() {
            VirtualRoot::Project => {
                let path = self.resolve_project_to_disk(id)?;
                let content = std::fs::read_to_string(&path)
                    .map_err(|_| typst::diag::FileError::NotFound(path.clone()))?;
                if path
                    .extension()
                    .and_then(|value| value.to_str())
                    .is_some_and(|value| value.eq_ignore_ascii_case("typ"))
                {
                    expand_wikilinks(&content)
                } else {
                    content
                }
            }
            VirtualRoot::Package(spec) => {
                let bytes = packages::load_package_file(spec, id.vpath())?;
                std::str::from_utf8(bytes.as_slice())
                    .map_err(|_| typst::diag::FileError::InvalidUtf8)?
                    .to_owned()
            }
        };
        Ok(Source::new(id, content))
    }

    fn file(&self, id: FileId) -> Result<Bytes, typst::diag::FileError> {
        match id.root() {
            VirtualRoot::Project => {
                let path = self.resolve_project_to_disk(id)?;
                let bytes = std::fs::read(&path)
                    .map_err(|_| typst::diag::FileError::NotFound(path.clone()))?;
                Ok(Bytes::new(bytes))
            }
            VirtualRoot::Package(spec) => packages::load_package_file(spec, id.vpath()),
        }
    }

    fn font(&self, index: usize) -> Option<Font> {
        FONT_LIBRARY.slots.get(index).and_then(FontSlot::get)
    }

    fn today(&self, _offset: Option<Duration>) -> Option<Datetime> {
        None
    }
}

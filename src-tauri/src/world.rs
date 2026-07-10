use typst::foundations::{Bytes, Datetime, Duration};
use typst::syntax::{FileId, RootedPath, Source, VirtualPath, VirtualRoot};
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;
use typst::{Library, LibraryExt, World};

pub struct TypstWorld {
    library: LazyHash<Library>,
    book: LazyHash<FontBook>,
    fonts: Vec<Font>,
    main: FileId,
    source: Source,
    vault_path: String,
    main_vpath: VirtualPath,
}

impl TypstWorld {
    pub fn new(source: String, vault_path: String, main_file: String) -> Self {
        let library = Library::default();
        let fonts: Vec<Font> = typst_assets::fonts()
            .flat_map(|data| Font::new(Bytes::new(data), 0))
            .collect();
        let book = FontBook::from_fonts(&fonts);

        let rel = main_file
            .strip_prefix(&vault_path)
            .unwrap_or(&main_file)
            .trim_start_matches('/');
        let main_vpath = VirtualPath::new(format!("/{}", rel))
            .unwrap_or_else(|_| VirtualPath::new("/main.typ").unwrap());
        let id = FileId::new(RootedPath::new(VirtualRoot::Project, main_vpath.clone()));
        let source = Source::new(id, source);

        Self {
            library: LazyHash::new(library),
            book: LazyHash::new(book),
            fonts,
            main: id,
            source,
            vault_path,
            main_vpath,
        }
    }

    fn resolve_to_disk(&self, id: FileId) -> Result<std::path::PathBuf, typst::diag::FileError> {
        let rel = if id == self.main {
            std::path::Path::new(self.main_vpath.get_without_slash())
        } else {
            std::path::Path::new(id.vpath().get_without_slash())
        };
        let resolved = std::path::Path::new(&self.vault_path).join(rel);
        let canonical = resolved
            .canonicalize()
            .map_err(|_| typst::diag::FileError::NotFound(resolved.clone()))?;
        let vault_canonical = std::path::Path::new(&self.vault_path)
            .canonicalize()
            .map_err(|_| {
                typst::diag::FileError::NotFound(std::path::PathBuf::from(&self.vault_path))
            })?;
        if !canonical.starts_with(&vault_canonical) {
            return Err(typst::diag::FileError::NotFound(resolved));
        }
        Ok(canonical)
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
        let path = self.resolve_to_disk(id)?;
        let content =
            std::fs::read_to_string(&path).map_err(|_| typst::diag::FileError::NotFound(path))?;
        Ok(Source::new(id, content))
    }
    fn file(&self, id: FileId) -> Result<Bytes, typst::diag::FileError> {
        let path = self.resolve_to_disk(id)?;
        let data =
            std::fs::read(&path).map_err(|_| typst::diag::FileError::NotFound(path.clone()))?;
        Ok(Bytes::new(data))
    }
    fn font(&self, index: usize) -> Option<Font> {
        self.fonts.get(index).cloned()
    }
    fn today(&self, _offset: Option<Duration>) -> Option<Datetime> {
        None
    }
}

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
}

impl TypstWorld {
    pub fn new(source: String) -> Self {
        let library = Library::default();
        let fonts: Vec<Font> = typst_assets::fonts()
            .flat_map(|data| Font::new(Bytes::new(data), 0))
            .collect();
        let book = FontBook::from_fonts(&fonts);
        let id = FileId::new(RootedPath::new(
            VirtualRoot::Project,
            VirtualPath::new("/main.typ").unwrap(),
        ));
        let source = Source::new(id, source);
        Self {
            library: LazyHash::new(library),
            book: LazyHash::new(book),
            fonts,
            main: id,
            source,
        }
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
            Ok(self.source.clone())
        } else {
            Err(typst::diag::FileError::NotFound(std::path::PathBuf::new()))
        }
    }
    fn file(&self, _id: FileId) -> Result<Bytes, typst::diag::FileError> {
        Err(typst::diag::FileError::NotFound(std::path::PathBuf::new()))
    }
    fn font(&self, index: usize) -> Option<Font> {
        self.fonts.get(index).cloned()
    }
    fn today(&self, _offset: Option<Duration>) -> Option<Datetime> {
        None
    }
}
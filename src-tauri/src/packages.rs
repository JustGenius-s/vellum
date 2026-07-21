use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::Component;
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::sync::{LazyLock, Mutex};
use std::time::UNIX_EPOCH;
use typst::diag::{FileError, FileResult};
use typst::foundations::Bytes;
use typst::syntax::package::{PackageManifest, PackageSpec, VersionlessPackageSpec};
use typst::syntax::VirtualPath;
use typst_kit::downloader::SystemDownloader;
use typst_kit::packages::{FsPackages, SystemPackages, UniversePackages};
use walkdir::WalkDir;

#[derive(Clone, Default, Eq, Hash, PartialEq)]
struct PackageDirectories {
    cache: Option<PathBuf>,
    data: Option<PathBuf>,
}

static PACKAGE_STORES: LazyLock<Mutex<HashMap<PackageDirectories, SystemPackages>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[derive(Clone, Copy, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PackageLocation {
    Cache,
    Data,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateMetadata {
    path: String,
    entrypoint: String,
    thumbnail: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageEntry {
    spec: String,
    namespace: String,
    name: String,
    version: String,
    location: PackageLocation,
    path: String,
    size_bytes: u64,
    modified_at_ms: Option<u64>,
    removable: bool,
    description: Option<String>,
    template: Option<TemplateMetadata>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageCatalog {
    packages: Vec<PackageEntry>,
    cache_path: Option<String>,
    data_path: Option<String>,
    cache_size_bytes: u64,
    data_size_bytes: u64,
    cache_count: usize,
    data_count: usize,
    template_count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateProjectPlan {
    destination: String,
    entrypoint: String,
    destination_exists: bool,
    destination_file_count: usize,
    template_file_count: usize,
    files_to_create: usize,
    conflicts: Vec<String>,
    requires_merge: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateProjectResult {
    destination: String,
    entrypoint: String,
    created_files: usize,
    skipped_files: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateThumbnail {
    media_type: String,
    bytes: Vec<u8>,
}

struct TemplateSource {
    package_root: PathBuf,
    root: PathBuf,
    entrypoint: PathBuf,
    metadata: TemplateMetadata,
}

struct TemplateSourceEntry {
    source: PathBuf,
    relative: PathBuf,
    is_dir: bool,
}

struct TemplateInspection {
    plan: TemplateProjectPlan,
    destination: PathBuf,
    entries: Vec<TemplateSourceEntry>,
}

fn package_directories(
    cache_path: Option<&str>,
    data_path: Option<&str>,
) -> Result<PackageDirectories, String> {
    fn parse(path: Option<&str>, label: &str) -> Result<Option<PathBuf>, String> {
        let Some(path) = path.map(str::trim).filter(|path| !path.is_empty()) else {
            return Ok(None);
        };
        let path = PathBuf::from(path);
        if !path.is_absolute() {
            return Err(format!("{label} package directory must be an absolute path"));
        }
        Ok(Some(path))
    }

    Ok(PackageDirectories {
        cache: parse(cache_path, "Downloaded")?,
        data: parse(data_path, "Local")?,
    })
}

fn create_package_store(directories: &PackageDirectories) -> Result<SystemPackages, String> {
    for (label, path) in [
        ("downloaded", directories.cache.as_deref()),
        ("local", directories.data.as_deref()),
    ] {
        if let Some(path) = path {
            reject_symlink(path)?;
            std::fs::create_dir_all(path)
                .map_err(|error| format!("Could not create {label} package directory: {error}"))?;
            if !path.is_dir() {
                return Err(format!("{label} package path is not a directory: {}", path.display()));
            }
        }
    }

    let data = directories
        .data
        .clone()
        .map(FsPackages::new)
        .or_else(FsPackages::system_data);
    let cache = directories
        .cache
        .clone()
        .map(FsPackages::new)
        .or_else(FsPackages::system_cache);
    let user_agent = format!("Vellum/{}", env!("CARGO_PKG_VERSION"));
    let universe = UniversePackages::new(SystemDownloader::new(user_agent));
    Ok(SystemPackages::from_parts(data, cache, universe))
}

fn with_packages<T>(
    cache_path: Option<&str>,
    data_path: Option<&str>,
    operation: impl FnOnce(&SystemPackages) -> Result<T, String>,
) -> Result<T, String> {
    let directories = package_directories(cache_path, data_path)?;
    let mut stores = PACKAGE_STORES
        .lock()
        .map_err(|_| "Typst package store is unavailable".to_string())?;
    if !stores.contains_key(&directories) {
        let packages = create_package_store(&directories)?;
        stores.insert(directories.clone(), packages);
    }
    operation(stores.get(&directories).expect("package store inserted"))
}

pub fn load_package_file(
    spec: &PackageSpec,
    path: &VirtualPath,
    cache_path: Option<&str>,
    data_path: Option<&str>,
) -> FileResult<Bytes> {
    let directories = package_directories(cache_path, data_path)
        .map_err(|error| FileError::Other(Some(error.into())))?;
    let mut stores = PACKAGE_STORES
        .lock()
        .map_err(|_| FileError::Other(Some("Typst package store is unavailable".into())))?;
    if !stores.contains_key(&directories) {
        let packages = create_package_store(&directories)
            .map_err(|error| FileError::Other(Some(error.into())))?;
        stores.insert(directories.clone(), packages);
    }
    stores
        .get(&directories)
        .expect("package store inserted")
        .obtain(spec)?
        .load(path)
}

fn child_directories(path: &Path) -> Vec<PathBuf> {
    let mut directories = std::fs::read_dir(path)
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter_map(|entry| {
            entry
                .file_type()
                .ok()
                .filter(|kind| kind.is_dir())
                .map(|_| entry.path())
        })
        .collect::<Vec<_>>();
    directories.sort();
    directories
}

fn directory_metrics(path: &Path) -> (u64, Option<u64>) {
    let mut size = 0;
    let mut modified_at_ms = None;

    for entry in WalkDir::new(path)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
    {
        if entry.file_type().is_symlink() {
            continue;
        }
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        if metadata.is_file() {
            size += metadata.len();
        }
        if let Ok(modified) = metadata.modified() {
            if let Ok(elapsed) = modified.duration_since(UNIX_EPOCH) {
                let millis = elapsed.as_millis().min(u128::from(u64::MAX)) as u64;
                modified_at_ms =
                    Some(modified_at_ms.map_or(millis, |current: u64| current.max(millis)));
            }
        }
    }

    (size, modified_at_ms)
}

fn relative_path(value: &str, label: &str, allow_empty: bool) -> Result<PathBuf, String> {
    let mut normalized = PathBuf::new();
    for component in Path::new(value).components() {
        match component {
            Component::Normal(part) => normalized.push(part),
            Component::CurDir => {}
            _ => return Err(format!("Template {label} must be a relative path")),
        }
    }
    if !allow_empty && normalized.as_os_str().is_empty() {
        return Err(format!("Template {label} cannot be empty"));
    }
    Ok(normalized)
}

fn relative_string(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn read_manifest(package_root: &Path, spec: &PackageSpec) -> Result<PackageManifest, String> {
    let path = package_root.join("typst.toml");
    let source = std::fs::read_to_string(&path)
        .map_err(|error| format!("Could not read {}: {error}", path.display()))?;
    let manifest: PackageManifest = toml::from_str(&source)
        .map_err(|error| format!("Invalid {}: {error}", path.display()))?;
    manifest
        .validate(spec)
        .map_err(|error| format!("Invalid package manifest: {error}"))?;
    Ok(manifest)
}

fn manifest_metadata(
    package_root: &Path,
    spec: &PackageSpec,
) -> Result<(Option<String>, Option<TemplateMetadata>), String> {
    let manifest = read_manifest(package_root, spec)?;
    let description = manifest.package.description.map(|value| value.to_string());
    let template = manifest
        .template
        .map(|template| -> Result<TemplateMetadata, String> {
            let path = relative_path(template.path.as_str(), "path", true)?;
            let entrypoint = relative_path(template.entrypoint.as_str(), "entrypoint", false)?;
            let thumbnail = template
                .thumbnail
                .map(|value| relative_path(value.as_str(), "thumbnail", false))
                .transpose()?
                .map(|value| relative_string(&value));
            Ok(TemplateMetadata {
                path: relative_string(&path),
                entrypoint: relative_string(&entrypoint),
                thumbnail,
            })
        })
        .transpose()?;
    Ok((description, template))
}

fn reject_relative_symlinks(root: &Path, relative: &Path) -> Result<(), String> {
    let mut current = root.to_path_buf();
    for component in relative.components() {
        let Component::Normal(part) = component else {
            continue;
        };
        current.push(part);
        if let Ok(metadata) = std::fs::symlink_metadata(&current) {
            if metadata.file_type().is_symlink() {
                return Err(format!(
                    "Template paths cannot contain symbolic links: {}",
                    current.display()
                ));
            }
        }
    }
    Ok(())
}

fn template_source(package_root: &Path, spec: &PackageSpec) -> Result<TemplateSource, String> {
    let package_root = package_root
        .canonicalize()
        .map_err(|error| format!("Invalid package path: {error}"))?;
    let manifest = read_manifest(&package_root, spec)?;
    let template = manifest
        .template
        .ok_or_else(|| format!("{spec} is not a Typst template"))?;
    let template_path = relative_path(template.path.as_str(), "path", true)?;
    let entrypoint = relative_path(template.entrypoint.as_str(), "entrypoint", false)?;
    let thumbnail = template
        .thumbnail
        .map(|value| relative_path(value.as_str(), "thumbnail", false))
        .transpose()?
        .map(|value| relative_string(&value));

    reject_relative_symlinks(&package_root, &template_path)?;
    let source = package_root.join(&template_path);
    let source = source
        .canonicalize()
        .map_err(|error| format!("Invalid template path: {error}"))?;
    if !source.starts_with(&package_root) || !source.is_dir() {
        return Err("Template path is outside the package or is not a directory".into());
    }

    reject_relative_symlinks(&source, &entrypoint)?;
    let source_entrypoint = source.join(&entrypoint);
    let resolved_entrypoint = source_entrypoint
        .canonicalize()
        .map_err(|error| format!("Invalid template entrypoint: {error}"))?;
    if !resolved_entrypoint.starts_with(&source) || !resolved_entrypoint.is_file() {
        return Err("Template entrypoint is outside the template or is not a file".into());
    }

    let metadata = TemplateMetadata {
        path: relative_string(&template_path),
        entrypoint: relative_string(&entrypoint),
        thumbnail,
    };
    Ok(TemplateSource {
        package_root,
        root: source,
        entrypoint,
        metadata,
    })
}

fn package_root(
    packages: &SystemPackages,
    spec: &PackageSpec,
    location: PackageLocation,
) -> Result<PathBuf, String> {
    let (root, label) = match location {
        PackageLocation::Cache => (packages.cache(), "downloaded"),
        PackageLocation::Data => (packages.data(), "local"),
    };
    let root = root.ok_or_else(|| format!("The {label} package directory is unavailable"))?;
    let namespace = root.path().join(spec.namespace.as_str());
    let name = namespace.join(spec.name.as_str());
    let package = package_target(root, spec);
    for path in [root.path(), namespace.as_path(), name.as_path(), package.as_path()] {
        reject_symlink(path)?;
    }
    if !package.is_dir() {
        return Err(format!("{label} package {spec} was not found"));
    }
    Ok(package)
}

fn collect_template_entries(source: &Path) -> Result<Vec<TemplateSourceEntry>, String> {
    let mut entries = Vec::new();
    for entry in WalkDir::new(source).follow_links(false).min_depth(1) {
        let entry = entry.map_err(|error| format!("Could not inspect template: {error}"))?;
        let kind = entry.file_type();
        if kind.is_symlink() {
            return Err(format!(
                "Templates containing symbolic links are not supported: {}",
                entry.path().display()
            ));
        }
        if !kind.is_dir() && !kind.is_file() {
            return Err(format!(
                "Templates containing special files are not supported: {}",
                entry.path().display()
            ));
        }
        let relative = entry
            .path()
            .strip_prefix(source)
            .map_err(|_| "Template contains an invalid path".to_string())?
            .to_path_buf();
        entries.push(TemplateSourceEntry {
            source: entry.path().to_path_buf(),
            relative,
            is_dir: kind.is_dir(),
        });
    }
    entries.sort_by(|left, right| {
        left.relative
            .components()
            .count()
            .cmp(&right.relative.components().count())
            .then_with(|| left.relative.cmp(&right.relative))
    });
    Ok(entries)
}

fn project_destination(parent_path: &str, project_name: &str) -> Result<PathBuf, String> {
    let parent_path = Path::new(parent_path.trim());
    if !parent_path.is_absolute() {
        return Err("Project location must be an absolute path".into());
    }
    reject_symlink(parent_path)?;
    let parent = parent_path
        .canonicalize()
        .map_err(|error| format!("Invalid project location: {error}"))?;
    if !parent.is_dir() {
        return Err("Project location is not a directory".into());
    }

    let project_name = project_name.trim();
    let mut components = Path::new(project_name).components();
    let valid_name = matches!(components.next(), Some(Component::Normal(_)))
        && components.next().is_none()
        && project_name != "."
        && project_name != "..";
    if !valid_name {
        return Err("Project name must be a single folder name".into());
    }
    Ok(parent.join(project_name))
}

fn inspect_destination(path: &Path) -> Result<(bool, bool, usize), String> {
    let metadata = match std::fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok((false, false, 0));
        }
        Err(error) => {
            return Err(format!("Could not inspect project destination: {error}"));
        }
    };
    if metadata.file_type().is_symlink() {
        return Err("Project destination cannot be a symbolic link".into());
    }
    if !metadata.is_dir() {
        return Err("A file already exists at the project destination".into());
    }
    let non_empty = path
        .read_dir()
        .map_err(|error| format!("Could not inspect project destination: {error}"))?
        .next()
        .is_some();
    let mut files = 0;
    for entry in WalkDir::new(path).follow_links(false).min_depth(1) {
        let entry = entry.map_err(|error| format!("Could not inspect project destination: {error}"))?;
        if entry.file_type().is_symlink() {
            return Err(format!(
                "Project destinations containing symbolic links are not supported: {}",
                entry.path().display()
            ));
        }
        if entry.file_type().is_file() {
            files += 1;
        }
    }
    Ok((true, non_empty, files))
}

fn ensure_entrypoint_available(destination: &Path, entrypoint: &Path) -> Result<(), String> {
    let mut current = destination.to_path_buf();
    let components = entrypoint.components().collect::<Vec<_>>();
    for (index, component) in components.iter().enumerate() {
        let Component::Normal(part) = component else {
            continue;
        };
        current.push(part);
        let Ok(metadata) = std::fs::symlink_metadata(&current) else {
            continue;
        };
        if metadata.file_type().is_symlink() {
            return Err("The template entrypoint is blocked by a symbolic link".into());
        }
        let is_entrypoint = index + 1 == components.len();
        if (is_entrypoint && !metadata.is_file()) || (!is_entrypoint && !metadata.is_dir()) {
            return Err(format!(
                "The template entrypoint is blocked by {}",
                current.display()
            ));
        }
    }
    Ok(())
}

fn inspect_template(
    packages: &SystemPackages,
    spec: &PackageSpec,
    location: PackageLocation,
    parent_path: &str,
    project_name: &str,
) -> Result<TemplateInspection, String> {
    let package = package_root(packages, spec, location)?;
    let source = template_source(&package, spec)?;
    let entries = collect_template_entries(&source.root)?;
    let destination = project_destination(parent_path, project_name)?;
    let (destination_exists, destination_non_empty, destination_file_count) =
        inspect_destination(&destination)?;
    ensure_entrypoint_available(&destination, &source.entrypoint)?;

    let mut blocked_directories = Vec::<PathBuf>::new();
    let mut conflicts = Vec::new();
    let mut template_file_count = 0;
    let mut files_to_create = 0;
    for entry in &entries {
        let blocked = blocked_directories
            .iter()
            .any(|path| entry.relative.starts_with(path));
        if !entry.is_dir {
            template_file_count += 1;
        }
        if blocked {
            if !entry.is_dir {
                conflicts.push(relative_string(&entry.relative));
            }
            continue;
        }

        let target = destination.join(&entry.relative);
        match std::fs::symlink_metadata(&target) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err(format!(
                    "Project destinations containing symbolic links are not supported: {}",
                    target.display()
                ));
            }
            Ok(metadata) if entry.is_dir && metadata.is_dir() => {}
            Ok(_) if entry.is_dir => {
                conflicts.push(relative_string(&entry.relative));
                blocked_directories.push(entry.relative.clone());
            }
            Ok(_) => conflicts.push(relative_string(&entry.relative)),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                if !entry.is_dir {
                    files_to_create += 1;
                }
            }
            Err(error) => {
                return Err(format!("Could not inspect {}: {error}", target.display()));
            }
        }
    }

    let entrypoint = destination.join(&source.entrypoint);
    Ok(TemplateInspection {
        plan: TemplateProjectPlan {
            destination: destination.to_string_lossy().into_owned(),
            entrypoint: entrypoint.to_string_lossy().into_owned(),
            destination_exists,
            destination_file_count,
            template_file_count,
            files_to_create,
            conflicts,
            requires_merge: destination_exists && destination_non_empty,
        },
        destination,
        entries,
    })
}

fn rollback_template_copy(
    root_created: bool,
    destination: &Path,
    files: &[PathBuf],
    dirs: &[PathBuf],
) {
    for path in files.iter().rev() {
        let _ = std::fs::remove_file(path);
    }
    for path in dirs.iter().rev() {
        let _ = std::fs::remove_dir(path);
    }
    if root_created {
        let _ = std::fs::remove_dir(destination);
    }
}

fn copy_template(inspection: &TemplateInspection, merge: bool) -> Result<(usize, usize), String> {
    if inspection.plan.requires_merge && !merge {
        return Err("The project directory is not empty; confirm a non-overwriting merge first".into());
    }
    if !inspection.plan.conflicts.is_empty() && !merge {
        return Err("The project directory contains conflicting template paths".into());
    }

    let root_created = !inspection.plan.destination_exists;
    if root_created {
        std::fs::create_dir(&inspection.destination)
            .map_err(|error| format!("Could not create project directory: {error}"))?;
    }

    let mut created_files = Vec::<PathBuf>::new();
    let mut created_dirs = Vec::<PathBuf>::new();
    let mut blocked_directories = Vec::<PathBuf>::new();
    let mut skipped_files = 0;

    let result = (|| -> Result<(), String> {
        for entry in &inspection.entries {
            let blocked = blocked_directories
                .iter()
                .any(|path| entry.relative.starts_with(path));
            if blocked {
                if !entry.is_dir {
                    skipped_files += 1;
                }
                continue;
            }

            let target = inspection.destination.join(&entry.relative);
            match std::fs::symlink_metadata(&target) {
                Ok(metadata) if metadata.file_type().is_symlink() => {
                    return Err(format!(
                        "Refusing to write through symbolic link: {}",
                        target.display()
                    ));
                }
                Ok(metadata) if entry.is_dir && metadata.is_dir() => continue,
                Ok(_) if entry.is_dir && merge => {
                    blocked_directories.push(entry.relative.clone());
                    continue;
                }
                Ok(_) if entry.is_dir => {
                    return Err(format!("A file blocks template directory {}", target.display()));
                }
                Ok(_) if merge => {
                    skipped_files += 1;
                    continue;
                }
                Ok(_) => return Err(format!("Template file already exists: {}", target.display())),
                Err(error) if error.kind() != std::io::ErrorKind::NotFound => {
                    return Err(format!("Could not inspect {}: {error}", target.display()));
                }
                Err(_) => {}
            }

            if entry.is_dir {
                std::fs::create_dir(&target)
                    .map_err(|error| format!("Could not create {}: {error}", target.display()))?;
                created_dirs.push(target);
                continue;
            }

            let mut input = std::fs::File::open(&entry.source)
                .map_err(|error| format!("Could not read {}: {error}", entry.source.display()))?;
            let mut output = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&target)
                .map_err(|error| format!("Could not create {}: {error}", target.display()))?;
            if let Err(error) = std::io::copy(&mut input, &mut output)
                .and_then(|_| output.flush())
            {
                drop(output);
                let _ = std::fs::remove_file(&target);
                return Err(format!("Could not copy {}: {error}", target.display()));
            }
            created_files.push(target);
        }
        Ok(())
    })();

    if let Err(error) = result {
        rollback_template_copy(
            root_created,
            &inspection.destination,
            &created_files,
            &created_dirs,
        );
        return Err(error);
    }

    Ok((created_files.len(), skipped_files))
}

fn scan_packages(root: &FsPackages, location: PackageLocation) -> Vec<PackageEntry> {
    let mut entries = Vec::new();

    for namespace_path in child_directories(root.path()) {
        for name_path in child_directories(&namespace_path) {
            for version_path in child_directories(&name_path) {
                let Some(namespace) = namespace_path.file_name().and_then(|value| value.to_str())
                else {
                    continue;
                };
                let Some(name) = name_path.file_name().and_then(|value| value.to_str()) else {
                    continue;
                };
                let Some(version) = version_path.file_name().and_then(|value| value.to_str()) else {
                    continue;
                };
                let Ok(spec) = PackageSpec::from_str(&format!("@{namespace}/{name}:{version}"))
                else {
                    continue;
                };
                let (size_bytes, modified_at_ms) = directory_metrics(&version_path);
                let (description, template) =
                    manifest_metadata(&version_path, &spec).unwrap_or_default();

                entries.push(PackageEntry {
                    spec: spec.to_string(),
                    namespace: spec.namespace.to_string(),
                    name: spec.name.to_string(),
                    version: spec.version.to_string(),
                    location,
                    path: version_path.to_string_lossy().into_owned(),
                    size_bytes,
                    modified_at_ms,
                    removable: true,
                    description,
                    template,
                });
            }
        }
    }

    entries
}

fn build_catalog(packages: &SystemPackages) -> PackageCatalog {
    let cache_path = packages
        .cache()
        .map(|root| root.path().to_string_lossy().into_owned());
    let data_path = packages
        .data()
        .map(|root| root.path().to_string_lossy().into_owned());
    let cache_size_bytes = packages
        .cache()
        .map(|root| directory_metrics(root.path()).0)
        .unwrap_or(0);
    let data_size_bytes = packages
        .data()
        .map(|root| directory_metrics(root.path()).0)
        .unwrap_or(0);
    let mut entries = Vec::new();

    if let Some(cache) = packages.cache() {
        entries.extend(scan_packages(cache, PackageLocation::Cache));
    }
    if let Some(data) = packages.data() {
        entries.extend(scan_packages(data, PackageLocation::Data));
    }

    entries.sort_by(|left, right| {
        left.name
            .cmp(&right.name)
            .then_with(|| left.namespace.cmp(&right.namespace))
            .then_with(|| left.version.cmp(&right.version))
            .then_with(|| {
                left.location
                    .eq(&PackageLocation::Data)
                    .cmp(&right.location.eq(&PackageLocation::Data))
            })
    });

    let cache_count = entries
        .iter()
        .filter(|entry| entry.location == PackageLocation::Cache)
        .count();
    let data_count = entries.len() - cache_count;
    let template_count = entries
        .iter()
        .filter(|entry| entry.template.is_some())
        .count();

    PackageCatalog {
        packages: entries,
        cache_path,
        data_path,
        cache_size_bytes,
        data_size_bytes,
        cache_count,
        data_count,
        template_count,
    }
}

fn parse_install_spec(input: &str, packages: &SystemPackages) -> Result<PackageSpec, String> {
    let input = input.trim();
    if input.is_empty() {
        return Err("Enter a package such as @preview/tiaoma:0.3.0".to_string());
    }

    if input.rsplit('/').next().is_some_and(|part| part.contains(':')) {
        return PackageSpec::from_str(input).map_err(|error| error.to_string());
    }

    let versionless = VersionlessPackageSpec::from_str(input).map_err(|error| error.to_string())?;
    let version = packages
        .latest_version(&versionless)
        .map_err(|error| error.to_string())?;
    Ok(versionless.at(version))
}

fn package_target(root: &FsPackages, spec: &PackageSpec) -> PathBuf {
    root.path()
        .join(spec.namespace.as_str())
        .join(spec.name.as_str())
        .join(spec.version.to_string())
}

fn reject_symlink(path: &Path) -> Result<(), String> {
    if let Ok(metadata) = std::fs::symlink_metadata(path) {
        if metadata.file_type().is_symlink() {
            return Err(format!(
                "Refusing to modify symlinked package path: {}",
                path.display()
            ));
        }
    }
    Ok(())
}

fn remove_package_directory(
    packages: &SystemPackages,
    spec: &PackageSpec,
    location: PackageLocation,
) -> Result<(), String> {
    let (root, label) = match location {
        PackageLocation::Cache => (packages.cache(), "downloaded"),
        PackageLocation::Data => (packages.data(), "local"),
    };
    let root = root.ok_or_else(|| format!("The {label} package directory is unavailable"))?;
    let namespace_path = root.path().join(spec.namespace.as_str());
    let name_path = namespace_path.join(spec.name.as_str());
    let target = package_target(root, spec);

    reject_symlink(root.path())?;
    reject_symlink(&namespace_path)?;
    reject_symlink(&name_path)?;
    reject_symlink(&target)?;

    if !target.exists() {
        return Err(format!("{label} package {spec} was not found"));
    }
    if !target.is_dir() {
        return Err(format!("{label} package path is not a directory: {}", target.display()));
    }

    std::fs::remove_dir_all(&target)
        .map_err(|error| format!("Could not remove {spec}: {error}"))?;

    for directory in [&name_path, &namespace_path] {
        if directory
            .read_dir()
            .ok()
            .is_some_and(|mut entries| entries.next().is_none())
        {
            let _ = std::fs::remove_dir(directory);
        }
    }

    Ok(())
}

fn template_thumbnail(source: &TemplateSource) -> Result<Option<TemplateThumbnail>, String> {
    let Some(thumbnail) = source.metadata.thumbnail.as_deref() else {
        return Ok(None);
    };
    let relative = relative_path(thumbnail, "thumbnail", false)?;
    reject_relative_symlinks(&source.package_root, &relative)?;
    let path = source.package_root.join(&relative);
    let resolved = path
        .canonicalize()
        .map_err(|error| format!("Invalid template thumbnail: {error}"))?;
    if !resolved.starts_with(&source.package_root) || !resolved.is_file() {
        return Err("Template thumbnail is outside the package or is not a file".into());
    }
    let media_type = match resolved
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("png") => "image/png",
        Some("webp") => "image/webp",
        _ => return Err("Template thumbnails must be PNG or WebP files".into()),
    };
    let metadata = resolved
        .metadata()
        .map_err(|error| format!("Could not inspect template thumbnail: {error}"))?;
    if metadata.len() > 10 * 1024 * 1024 {
        return Err("Template thumbnail exceeds the 10 MB limit".into());
    }
    let bytes = std::fs::read(&resolved)
        .map_err(|error| format!("Could not read template thumbnail: {error}"))?;
    Ok(Some(TemplateThumbnail {
        media_type: media_type.into(),
        bytes,
    }))
}

#[tauri::command]
pub async fn list_packages(
    cache_path: Option<String>,
    data_path: Option<String>,
) -> Result<PackageCatalog, String> {
    tauri::async_runtime::spawn_blocking(move || {
        with_packages(cache_path.as_deref(), data_path.as_deref(), |packages| {
            Ok(build_catalog(packages))
        })
    })
    .await
    .map_err(|error| format!("Package discovery task failed: {error}"))?
}

#[tauri::command]
pub async fn install_package(
    spec: String,
    cache_path: Option<String>,
    data_path: Option<String>,
) -> Result<PackageCatalog, String> {
    tauri::async_runtime::spawn_blocking(move || {
        with_packages(cache_path.as_deref(), data_path.as_deref(), |packages| {
            let spec = parse_install_spec(&spec, packages)?;
            packages.obtain(&spec).map_err(|error| error.to_string())?;
            Ok(build_catalog(packages))
        })
    })
    .await
    .map_err(|error| format!("Package installation task failed: {error}"))?
}

#[tauri::command]
pub async fn remove_package(
    spec: String,
    location: PackageLocation,
    cache_path: Option<String>,
    data_path: Option<String>,
) -> Result<PackageCatalog, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let spec = PackageSpec::from_str(spec.trim()).map_err(|error| error.to_string())?;
        with_packages(cache_path.as_deref(), data_path.as_deref(), |packages| {
            remove_package_directory(packages, &spec, location)?;
            Ok(build_catalog(packages))
        })
    })
    .await
    .map_err(|error| format!("Package removal task failed: {error}"))?
}

#[tauri::command]
pub async fn clear_package_cache(
    cache_path: Option<String>,
    data_path: Option<String>,
) -> Result<PackageCatalog, String> {
    tauri::async_runtime::spawn_blocking(move || {
        with_packages(cache_path.as_deref(), data_path.as_deref(), |packages| {
            let cache = packages
                .cache()
                .ok_or_else(|| "The downloaded package directory is unavailable".to_string())?;
            let path = cache.path();

            reject_symlink(path)?;
            if path.exists() {
                if !path.is_dir() {
                    return Err(format!(
                        "Downloaded package path is not a directory: {}",
                        path.display()
                    ));
                }
                std::fs::remove_dir_all(path)
                    .map_err(|error| format!("Could not clear downloaded packages: {error}"))?;
                std::fs::create_dir_all(path).map_err(|error| {
                    format!("Could not recreate downloaded package directory: {error}")
                })?;
            }

            Ok(build_catalog(packages))
        })
    })
    .await
    .map_err(|error| format!("Downloaded package task failed: {error}"))?
}

#[tauri::command]
pub async fn preflight_template_project(
    spec: String,
    location: PackageLocation,
    parent_path: String,
    project_name: String,
    cache_path: Option<String>,
    data_path: Option<String>,
) -> Result<TemplateProjectPlan, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let spec = PackageSpec::from_str(spec.trim()).map_err(|error| error.to_string())?;
        with_packages(cache_path.as_deref(), data_path.as_deref(), |packages| {
            Ok(inspect_template(
                packages,
                &spec,
                location,
                &parent_path,
                &project_name,
            )?
            .plan)
        })
    })
    .await
    .map_err(|error| format!("Template preflight task failed: {error}"))?
}

#[tauri::command]
pub async fn create_template_project(
    spec: String,
    location: PackageLocation,
    parent_path: String,
    project_name: String,
    merge: bool,
    cache_path: Option<String>,
    data_path: Option<String>,
) -> Result<TemplateProjectResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let spec = PackageSpec::from_str(spec.trim()).map_err(|error| error.to_string())?;
        with_packages(cache_path.as_deref(), data_path.as_deref(), |packages| {
            let inspection = inspect_template(
                packages,
                &spec,
                location,
                &parent_path,
                &project_name,
            )?;
            let (created_files, skipped_files) = copy_template(&inspection, merge)?;
            Ok(TemplateProjectResult {
                destination: inspection.plan.destination,
                entrypoint: inspection.plan.entrypoint,
                created_files,
                skipped_files,
            })
        })
    })
    .await
    .map_err(|error| format!("Template creation task failed: {error}"))?
}

#[tauri::command]
pub async fn read_template_thumbnail(
    spec: String,
    location: PackageLocation,
    cache_path: Option<String>,
    data_path: Option<String>,
) -> Result<Option<TemplateThumbnail>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let spec = PackageSpec::from_str(spec.trim()).map_err(|error| error.to_string())?;
        with_packages(cache_path.as_deref(), data_path.as_deref(), |packages| {
            let package = package_root(packages, &spec, location)?;
            template_thumbnail(&template_source(&package, &spec)?)
        })
    })
    .await
    .map_err(|error| format!("Template thumbnail task failed: {error}"))?
}

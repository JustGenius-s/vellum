use serde::Serialize;
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::sync::{LazyLock, Mutex};
use std::time::UNIX_EPOCH;
use typst::diag::{FileError, FileResult};
use typst::foundations::Bytes;
use typst::syntax::package::{PackageSpec, VersionlessPackageSpec};
use typst::syntax::VirtualPath;
use typst_kit::downloader::SystemDownloader;
use typst_kit::packages::{FsPackages, SystemPackages};
use walkdir::WalkDir;

static SYSTEM_PACKAGES: LazyLock<Mutex<SystemPackages>> = LazyLock::new(|| {
    let user_agent = format!("Vellum/{}", env!("CARGO_PKG_VERSION"));
    Mutex::new(SystemPackages::new(SystemDownloader::new(user_agent)))
});

#[derive(Clone, Copy, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
enum PackageLocation {
    Cache,
    Data,
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
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageCatalog {
    packages: Vec<PackageEntry>,
    cache_path: Option<String>,
    data_path: Option<String>,
    cache_size_bytes: u64,
    cache_count: usize,
    data_count: usize,
}

fn lock_error() -> String {
    "Typst package store is unavailable".to_string()
}

fn file_lock_error() -> FileError {
    FileError::Other(Some("Typst package store is unavailable".into()))
}

pub fn load_package_file(spec: &PackageSpec, path: &VirtualPath) -> FileResult<Bytes> {
    let packages = SYSTEM_PACKAGES.lock().map_err(|_| file_lock_error())?;
    packages.obtain(spec)?.load(path)
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

                entries.push(PackageEntry {
                    spec: spec.to_string(),
                    namespace: spec.namespace.to_string(),
                    name: spec.name.to_string(),
                    version: spec.version.to_string(),
                    location,
                    path: version_path.to_string_lossy().into_owned(),
                    size_bytes,
                    modified_at_ms,
                    removable: location == PackageLocation::Cache,
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

    PackageCatalog {
        packages: entries,
        cache_path,
        data_path,
        cache_size_bytes,
        cache_count,
        data_count,
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

fn remove_cached_package(packages: &SystemPackages, spec: &PackageSpec) -> Result<(), String> {
    let cache = packages
        .cache()
        .ok_or_else(|| "The system package cache directory is unavailable".to_string())?;
    let namespace_path = cache.path().join(spec.namespace.as_str());
    let name_path = namespace_path.join(spec.name.as_str());
    let target = package_target(cache, spec);

    reject_symlink(cache.path())?;
    reject_symlink(&namespace_path)?;
    reject_symlink(&name_path)?;
    reject_symlink(&target)?;

    if !target.exists() {
        return Err(format!("Cached package {spec} was not found"));
    }
    if !target.is_dir() {
        return Err(format!("Cached package path is not a directory: {}", target.display()));
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

#[tauri::command]
pub async fn list_packages() -> Result<PackageCatalog, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let packages = SYSTEM_PACKAGES.lock().map_err(|_| lock_error())?;
        Ok(build_catalog(&packages))
    })
    .await
    .map_err(|error| format!("Package discovery task failed: {error}"))?
}

#[tauri::command]
pub async fn install_package(spec: String) -> Result<PackageCatalog, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let packages = SYSTEM_PACKAGES.lock().map_err(|_| lock_error())?;
        let spec = parse_install_spec(&spec, &packages)?;
        packages.obtain(&spec).map_err(|error| error.to_string())?;
        Ok(build_catalog(&packages))
    })
    .await
    .map_err(|error| format!("Package installation task failed: {error}"))?
}

#[tauri::command]
pub async fn remove_package(spec: String) -> Result<PackageCatalog, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let spec = PackageSpec::from_str(spec.trim()).map_err(|error| error.to_string())?;
        let packages = SYSTEM_PACKAGES.lock().map_err(|_| lock_error())?;
        remove_cached_package(&packages, &spec)?;
        Ok(build_catalog(&packages))
    })
    .await
    .map_err(|error| format!("Package removal task failed: {error}"))?
}

#[tauri::command]
pub async fn clear_package_cache() -> Result<PackageCatalog, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let packages = SYSTEM_PACKAGES.lock().map_err(|_| lock_error())?;
        let cache = packages
            .cache()
            .ok_or_else(|| "The system package cache directory is unavailable".to_string())?;
        let path = cache.path();

        reject_symlink(path)?;
        if path.exists() {
            if !path.is_dir() {
                return Err(format!("Package cache path is not a directory: {}", path.display()));
            }
            std::fs::remove_dir_all(path)
                .map_err(|error| format!("Could not clear package cache: {error}"))?;
            std::fs::create_dir_all(path)
                .map_err(|error| format!("Could not recreate package cache: {error}"))?;
        }

        Ok(build_catalog(&packages))
    })
    .await
    .map_err(|error| format!("Package cache task failed: {error}"))?
}

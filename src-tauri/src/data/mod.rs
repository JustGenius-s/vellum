mod tabular;
mod tensor;

use serde::{Deserialize, Serialize};
use serde_json::{Number, Value};
use std::cmp::Ordering;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

const DEFAULT_PREVIEW_LIMIT: usize = 80;
const MAX_PREVIEW_LIMIT: usize = 100_000;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DataFormat {
    Csv,
    Tsv,
    Json,
    Jsonl,
    Xlsx,
    Parquet,
    Hdf5,
    Mat,
    Netcdf,
}

impl DataFormat {
    pub fn from_path(path: &Path) -> Option<Self> {
        match path
            .extension()
            .and_then(|value| value.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref()
        {
            Some("csv") => Some(Self::Csv),
            Some("tsv") => Some(Self::Tsv),
            Some("json") => Some(Self::Json),
            Some("jsonl" | "ndjson") => Some(Self::Jsonl),
            Some("xlsx" | "xls" | "xlsb" | "ods") => Some(Self::Xlsx),
            Some("parquet") => Some(Self::Parquet),
            Some("h5" | "hdf5") => Some(Self::Hdf5),
            Some("mat") => Some(Self::Mat),
            Some("nc" | "cdf" | "netcdf") => Some(Self::Netcdf),
            _ => None,
        }
    }

    fn adapter_name(self) -> &'static str {
        match self {
            Self::Csv => "Delimited text",
            Self::Tsv => "Tab-separated text",
            Self::Json => "JSON",
            Self::Jsonl => "JSON Lines",
            Self::Xlsx => "Spreadsheet",
            Self::Parquet => "Apache Parquet",
            Self::Hdf5 => "HDF5",
            Self::Mat => "MATLAB",
            Self::Netcdf => "NetCDF",
        }
    }

    fn is_tabular(self) -> bool {
        matches!(
            self,
            Self::Csv | Self::Tsv | Self::Json | Self::Jsonl | Self::Xlsx | Self::Parquet
        )
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DatasetKind {
    Table,
    Tensor,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataDimension {
    pub name: String,
    pub size: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataColumn {
    pub name: String,
    pub data_type: String,
    pub numeric: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatasetDescriptor {
    pub id: String,
    pub name: String,
    pub kind: DatasetKind,
    pub data_type: String,
    pub shape: Vec<u64>,
    pub dimensions: Vec<DataDimension>,
    pub columns: Vec<DataColumn>,
    pub row_count: Option<u64>,
    pub description: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataCatalog {
    pub format: DataFormat,
    pub adapter: String,
    pub source_path: String,
    pub size_bytes: u64,
    pub datasets: Vec<DatasetDescriptor>,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FixedDimension {
    pub dimension: usize,
    pub index: u64,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataQuery {
    #[serde(default)]
    pub dataset_id: String,
    #[serde(default)]
    pub offset: usize,
    pub limit: Option<usize>,
    #[serde(default)]
    pub varying_dimensions: Vec<usize>,
    #[serde(default)]
    pub fixed_dimensions: Vec<FixedDimension>,
    #[serde(default)]
    pub exact_statistics: bool,
}

impl DataQuery {
    fn preview_limit(&self) -> usize {
        self.limit
            .unwrap_or(DEFAULT_PREVIEW_LIMIT)
            .clamp(1, MAX_PREVIEW_LIMIT)
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeriesStatistics {
    pub name: String,
    pub count: u64,
    pub valid_count: u64,
    pub missing_count: u64,
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub mean: Option<f64>,
    pub median: Option<f64>,
    pub standard_deviation: Option<f64>,
    pub q1: Option<f64>,
    pub q3: Option<f64>,
    pub sampled: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TensorPoint {
    pub coordinates: Vec<u64>,
    pub value: Option<f64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TensorPreview {
    pub shape: Vec<u64>,
    pub varying_dimensions: Vec<usize>,
    pub fixed_dimensions: Vec<FixedDimension>,
    pub points: Vec<TensorPoint>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataPreview {
    pub dataset_id: String,
    pub kind: DatasetKind,
    pub columns: Vec<DataColumn>,
    pub rows: Vec<Vec<Value>>,
    pub row_offset: usize,
    pub total_rows: Option<u64>,
    pub statistics: Vec<SeriesStatistics>,
    pub tensor: Option<TensorPreview>,
    pub sampled: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataFileRequest {
    pub path: String,
    pub vault_path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataPreviewRequest {
    pub path: String,
    pub vault_path: String,
    pub query: DataQuery,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareDataFigureRequest {
    pub path: String,
    pub vault_path: String,
    pub query: DataQuery,
    pub title: Option<String>,
    pub model: String,
    pub prompt: String,
    pub typst_source: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedDataFigure {
    pub id: String,
    pub directory_path: String,
    pub typst_path: String,
    pub data_path: String,
    pub metadata_path: String,
}

pub(super) fn json_number(value: f64) -> Value {
    Number::from_f64(value)
        .map(Value::Number)
        .unwrap_or(Value::Null)
}

pub(super) fn infer_value(value: &str) -> Value {
    let value = value.trim();
    if value.is_empty() {
        Value::Null
    } else if value.eq_ignore_ascii_case("true") {
        Value::Bool(true)
    } else if value.eq_ignore_ascii_case("false") {
        Value::Bool(false)
    } else if let Ok(number) = value.parse::<i64>() {
        Value::Number(number.into())
    } else if let Ok(number) = value.parse::<f64>() {
        json_number(number)
    } else {
        Value::String(value.to_string())
    }
}

pub(super) fn value_type(value: &Value) -> (&'static str, bool) {
    match value {
        Value::Null => ("null", false),
        Value::Bool(_) => ("boolean", false),
        Value::Number(_) => ("number", true),
        Value::String(_) => ("string", false),
        Value::Array(_) => ("array", false),
        Value::Object(_) => ("object", false),
    }
}

pub(super) fn columns_from_rows(names: &[String], rows: &[Vec<Value>]) -> Vec<DataColumn> {
    names
        .iter()
        .enumerate()
        .map(|(index, name)| {
            let mut types = HashSet::new();
            let mut numeric = true;
            for value in rows.iter().filter_map(|row| row.get(index)) {
                if value.is_null() {
                    continue;
                }
                let (kind, is_numeric) = value_type(value);
                types.insert(kind);
                numeric &= is_numeric;
            }
            let data_type = match types.len() {
                0 => "unknown".to_string(),
                1 => types.into_iter().next().unwrap_or("unknown").to_string(),
                _ => "mixed".to_string(),
            };
            DataColumn {
                name: name.clone(),
                data_type,
                numeric,
            }
        })
        .collect()
}

pub(super) fn statistics(
    name: &str,
    values: &[Option<f64>],
    total: u64,
    sampled: bool,
) -> SeriesStatistics {
    let mut numbers = values
        .iter()
        .flatten()
        .copied()
        .filter(|value| value.is_finite())
        .collect::<Vec<_>>();
    numbers.sort_by(|left, right| left.partial_cmp(right).unwrap_or(Ordering::Equal));
    let count = if sampled { values.len() as u64 } else { total };
    let valid_count = numbers.len() as u64;
    let missing_count = count.saturating_sub(valid_count);
    let mean = (!numbers.is_empty()).then(|| numbers.iter().sum::<f64>() / numbers.len() as f64);
    let standard_deviation = mean.map(|mean| {
        let variance = numbers
            .iter()
            .map(|value| {
                let delta = value - mean;
                delta * delta
            })
            .sum::<f64>()
            / numbers.len().max(1) as f64;
        variance.sqrt()
    });
    let percentile = |fraction: f64| {
        if numbers.is_empty() {
            return None;
        }
        let index = ((numbers.len() - 1) as f64 * fraction).round() as usize;
        numbers.get(index).copied()
    };
    SeriesStatistics {
        name: name.to_string(),
        count,
        valid_count,
        missing_count,
        min: numbers.first().copied(),
        max: numbers.last().copied(),
        mean,
        median: percentile(0.5),
        standard_deviation,
        q1: percentile(0.25),
        q3: percentile(0.75),
        sampled,
    }
}

fn existing_data_path(path: &str, vault_path: &str) -> Result<PathBuf, String> {
    let vault = Path::new(vault_path)
        .canonicalize()
        .map_err(|error| format!("Invalid vault path: {error}"))?;
    let requested = if Path::new(path).is_absolute() {
        PathBuf::from(path)
    } else {
        vault.join(path)
    };
    let resolved = requested
        .canonicalize()
        .map_err(|error| format!("Invalid data path: {error}"))?;
    if !resolved.starts_with(&vault) || !resolved.is_file() {
        return Err("Data file is outside the vault or does not exist".into());
    }
    if DataFormat::from_path(&resolved).is_none() {
        return Err("Unsupported data file format".into());
    }
    Ok(resolved)
}

fn inspect_sync(path: &Path) -> Result<DataCatalog, String> {
    let format =
        DataFormat::from_path(path).ok_or_else(|| "Unsupported data format".to_string())?;
    let size_bytes = std::fs::metadata(path)
        .map_err(|error| error.to_string())?
        .len();
    let (datasets, warnings) = if format.is_tabular() {
        tabular::inspect(path, format)?
    } else {
        tensor::inspect(path, format)?
    };
    Ok(DataCatalog {
        format,
        adapter: format.adapter_name().to_string(),
        source_path: path.to_string_lossy().to_string(),
        size_bytes,
        datasets,
        warnings,
    })
}

fn preview_sync(path: &Path, query: &DataQuery) -> Result<DataPreview, String> {
    let format =
        DataFormat::from_path(path).ok_or_else(|| "Unsupported data format".to_string())?;
    if format.is_tabular() {
        tabular::preview(path, format, query)
    } else {
        tensor::preview(path, format, query)
    }
}

#[tauri::command]
pub async fn inspect_data_file(request: DataFileRequest) -> Result<DataCatalog, String> {
    let path = existing_data_path(&request.path, &request.vault_path)?;
    tauri::async_runtime::spawn_blocking(move || inspect_sync(&path))
        .await
        .map_err(|error| format!("Data inspection task failed: {error}"))?
}

#[tauri::command]
pub async fn preview_data_file(request: DataPreviewRequest) -> Result<DataPreview, String> {
    let path = existing_data_path(&request.path, &request.vault_path)?;
    tauri::async_runtime::spawn_blocking(move || preview_sync(&path, &request.query))
        .await
        .map_err(|error| format!("Data preview task failed: {error}"))?
}

fn figure_slug(value: &str) -> String {
    let mut slug = String::new();
    let mut separator = false;
    for character in value.chars().flat_map(char::to_lowercase) {
        if character.is_ascii_alphanumeric() {
            slug.push(character);
            separator = false;
        } else if !separator && !slug.is_empty() {
            slug.push('-');
            separator = true;
        }
        if slug.len() >= 56 {
            break;
        }
    }
    slug.trim_matches('-').to_string()
}

fn unique_figure_directory(
    vault: &Path,
    source: &Path,
    title: Option<&str>,
) -> Result<(String, PathBuf), String> {
    let figures = vault.join("figures");
    std::fs::create_dir_all(&figures).map_err(|error| error.to_string())?;
    let fallback = source
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("data");
    let base = title
        .filter(|value| !value.trim().is_empty())
        .map(figure_slug)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| format!("{}-chart", figure_slug(fallback)));
    for suffix in 1..=999 {
        let id = if suffix == 1 {
            base.clone()
        } else {
            format!("{base}-{suffix}")
        };
        let candidate = figures.join(&id);
        if !candidate.exists() {
            return Ok((id, candidate));
        }
    }
    Err("Could not find a free figure bundle name".into())
}

fn prepare_figure_sync(
    path: &Path,
    vault: &Path,
    request: PrepareDataFigureRequest,
) -> Result<PreparedDataFigure, String> {
    if request.typst_source.trim().is_empty() {
        return Err("The AI returned empty Typst source".into());
    }

    let mut query = request.query.clone();
    query.offset = 0;
    query.limit = Some(MAX_PREVIEW_LIMIT);
    let preview = preview_sync(path, &query)?;
    let format =
        DataFormat::from_path(path).ok_or_else(|| "Unsupported data format".to_string())?;
    let title = request
        .title
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| {
            path.file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("Data figure")
                .to_string()
        });
    let (id, directory_path) = unique_figure_directory(vault, path, Some(&title))?;
    std::fs::create_dir(&directory_path).map_err(|error| error.to_string())?;
    let data_path = directory_path.join("projection.json");
    let typst_path = directory_path.join("chart.typ");
    let metadata_path = directory_path.join("metadata.toml");

    let projection = serde_json::json!({
        "version": 1,
        "source": {
            "file": path.file_name().and_then(|value| value.to_str()).unwrap_or("data"),
            "format": format,
            "dataset": &request.query.dataset_id,
        },
        "kind": &preview.kind,
        "columns": &preview.columns,
        "rows": &preview.rows,
        "rowOffset": preview.row_offset,
        "totalRows": preview.total_rows,
        "statistics": &preview.statistics,
        "tensor": &preview.tensor,
        "query": &query,
        "sampled": preview.sampled,
    });

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct FigureMetadata<'a> {
        version: u8,
        id: &'a str,
        source: String,
        format: DataFormat,
        dataset: &'a str,
        kind: DatasetKind,
        title: &'a str,
        model: &'a str,
        prompt: &'a str,
        projection_rows: usize,
        source_rows: Option<u64>,
        sampled: bool,
        query: &'a DataQuery,
    }

    let projection_rows = preview
        .rows
        .len()
        .max(preview.tensor.as_ref().map(|tensor| tensor.points.len()).unwrap_or(0));
    let metadata = toml::to_string_pretty(&FigureMetadata {
        version: 1,
        id: &id,
        source: path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("data")
            .to_string(),
        format,
        dataset: &request.query.dataset_id,
        kind: preview.kind.clone(),
        title: &title,
        model: &request.model,
        prompt: &request.prompt,
        projection_rows,
        source_rows: preview.total_rows,
        sampled: preview.sampled,
        query: &query,
    })
    .map_err(|error| error.to_string())?;

    let write_result = (|| {
        std::fs::write(
            &data_path,
            serde_json::to_vec_pretty(&projection).map_err(|error| error.to_string())?,
        )
        .map_err(|error| error.to_string())?;
        std::fs::write(&metadata_path, metadata).map_err(|error| error.to_string())?;
        std::fs::write(&typst_path, request.typst_source).map_err(|error| error.to_string())?;
        Ok::<(), String>(())
    })();
    if let Err(error) = write_result {
        let _ = std::fs::remove_dir_all(&directory_path);
        return Err(error);
    }

    Ok(PreparedDataFigure {
        id,
        directory_path: directory_path.to_string_lossy().to_string(),
        typst_path: typst_path.to_string_lossy().to_string(),
        data_path: data_path.to_string_lossy().to_string(),
        metadata_path: metadata_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub async fn prepare_data_figure(
    request: PrepareDataFigureRequest,
) -> Result<PreparedDataFigure, String> {
    let path = existing_data_path(&request.path, &request.vault_path)?;
    let vault = Path::new(&request.vault_path)
        .canonicalize()
        .map_err(|error| format!("Invalid vault path: {error}"))?;
    tauri::async_runtime::spawn_blocking(move || prepare_figure_sync(&path, &vault, request))
        .await
        .map_err(|error| format!("Figure preparation task failed: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::{columns_from_rows, statistics};
    use serde_json::json;

    #[test]
    fn infers_numeric_columns_and_statistics() {
        let names = vec!["label".into(), "value".into()];
        let rows = vec![vec![json!("a"), json!(2)], vec![json!("b"), json!(4)]];
        let columns = columns_from_rows(&names, &rows);
        assert!(!columns[0].numeric);
        assert!(columns[1].numeric);

        let result = statistics("value", &[Some(2.0), Some(4.0)], 2, false);
        assert_eq!(result.mean, Some(3.0));
        assert_eq!(result.min, Some(2.0));
        assert_eq!(result.max, Some(4.0));
    }

    #[test]
    fn sampled_statistics_do_not_treat_unread_values_as_missing() {
        let result = statistics("value", &[Some(2.0), Some(4.0)], 10_000, true);
        assert_eq!(result.count, 2);
        assert_eq!(result.valid_count, 2);
        assert_eq!(result.missing_count, 0);
        assert!(result.sampled);
    }
}

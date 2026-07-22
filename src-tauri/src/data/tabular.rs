use super::{
    columns_from_rows, infer_value, statistics, DataColumn, DataFormat, DataPreview,
    DataQuery, DatasetDescriptor, DatasetKind, SeriesStatistics,
};
use calamine::{open_workbook_auto, Data, Reader};
use parquet::file::reader::{FileReader, SerializedFileReader};
use parquet::record::Field;
use serde_json::Value;
use std::collections::HashSet;
use std::fs::File;
use std::path::Path;

const INFERENCE_ROWS: usize = 256;
const STATISTICS_ROWS: usize = 10_000;

pub fn inspect(path: &Path, format: DataFormat) -> Result<(Vec<DatasetDescriptor>, Vec<String>), String> {
    match format {
        DataFormat::Csv => inspect_delimited(path, b','),
        DataFormat::Tsv => inspect_delimited(path, b'\t'),
        DataFormat::Json => inspect_json(path),
        DataFormat::Jsonl => inspect_jsonl(path),
        DataFormat::Xlsx => inspect_workbook(path),
        DataFormat::Parquet => inspect_parquet(path),
        _ => Err("The selected adapter is not tabular".into()),
    }
}

pub fn preview(path: &Path, format: DataFormat, query: &DataQuery) -> Result<DataPreview, String> {
    match format {
        DataFormat::Csv => preview_delimited(path, b',', query),
        DataFormat::Tsv => preview_delimited(path, b'\t', query),
        DataFormat::Json => preview_json(path, query),
        DataFormat::Jsonl => preview_jsonl(path, query),
        DataFormat::Xlsx => preview_workbook(path, query),
        DataFormat::Parquet => preview_parquet(path, query),
        _ => Err("The selected adapter is not tabular".into()),
    }
}

fn unique_headers(values: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut used = HashSet::new();
    values
        .into_iter()
        .enumerate()
        .map(|(index, value)| {
            let base = if value.trim().is_empty() {
                format!("column_{}", index + 1)
            } else {
                value.trim().to_string()
            };
            if used.insert(base.clone()) {
                return base;
            }
            let mut suffix = 2;
            loop {
                let candidate = format!("{base}_{suffix}");
                if used.insert(candidate.clone()) {
                    return candidate;
                }
                suffix += 1;
            }
        })
        .collect()
}

fn numeric_statistics(columns: &[DataColumn], rows: &[Vec<Value>], total_rows: u64, sampled: bool) -> Vec<SeriesStatistics> {
    columns
        .iter()
        .enumerate()
        .filter(|(_, column)| column.numeric)
        .map(|(index, column)| {
            let values = rows
                .iter()
                .map(|row| row.get(index).and_then(Value::as_f64))
                .collect::<Vec<_>>();
            statistics(&column.name, &values, total_rows, sampled)
        })
        .collect()
}

fn table_preview(
    dataset_id: String,
    names: Vec<String>,
    all_rows: Vec<Vec<Value>>,
    offset: usize,
    limit: usize,
    total_rows: u64,
    statistics_rows: Option<&[Vec<Value>]>,
) -> DataPreview {
    let inference = statistics_rows.unwrap_or(&all_rows);
    let columns = columns_from_rows(&names, inference);
    let sampled = statistics_rows.is_some_and(|values| values.len() as u64 != total_rows);
    let stats = numeric_statistics(&columns, inference, total_rows, sampled);
    let rows = all_rows.into_iter().skip(offset).take(limit).collect::<Vec<_>>();
    DataPreview {
        dataset_id,
        kind: DatasetKind::Table,
        columns,
        rows,
        row_offset: offset,
        total_rows: Some(total_rows),
        statistics: stats,
        tensor: None,
        sampled,
    }
}

fn open_delimited(path: &Path, delimiter: u8) -> Result<csv::Reader<File>, String> {
    csv::ReaderBuilder::new()
        .delimiter(delimiter)
        .flexible(true)
        .from_path(path)
        .map_err(|error| error.to_string())
}

fn read_delimited(path: &Path, delimiter: u8, max_rows: Option<usize>) -> Result<(Vec<String>, Vec<Vec<Value>>), String> {
    let mut reader = open_delimited(path, delimiter)?;
    let headers = unique_headers(
        reader
            .headers()
            .map_err(|error| error.to_string())?
            .iter()
            .map(str::to_string),
    );
    let rows = reader
        .records()
        .take(max_rows.unwrap_or(usize::MAX))
        .map(|record| {
            record
                .map(|record| record.iter().map(infer_value).collect::<Vec<_>>())
                .map_err(|error| error.to_string())
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok((headers, rows))
}

fn inspect_delimited(path: &Path, delimiter: u8) -> Result<(Vec<DatasetDescriptor>, Vec<String>), String> {
    let (headers, sample) = read_delimited(path, delimiter, Some(INFERENCE_ROWS))?;
    let row_count = open_delimited(path, delimiter)?.records().count() as u64;
    let columns = columns_from_rows(&headers, &sample);
    Ok((
        vec![DatasetDescriptor {
            id: "$".into(),
            name: "Data".into(),
            kind: DatasetKind::Table,
            data_type: "records".into(),
            shape: vec![row_count, headers.len() as u64],
            dimensions: Vec::new(),
            columns,
            row_count: Some(row_count),
            description: Some(if delimiter == b'\t' { "Tab-separated values" } else { "Comma-separated values" }.into()),
        }],
        Vec::new(),
    ))
}

fn preview_delimited(path: &Path, delimiter: u8, query: &DataQuery) -> Result<DataPreview, String> {
    let (headers, rows) = read_delimited(path, delimiter, Some(STATISTICS_ROWS.max(query.offset + query.preview_limit())))?;
    let total_rows = open_delimited(path, delimiter)?.records().count() as u64;
    let statistics_rows = rows.iter().take(STATISTICS_ROWS).cloned().collect::<Vec<_>>();
    Ok(table_preview(
        "$".into(),
        headers,
        rows,
        query.offset,
        query.preview_limit(),
        total_rows,
        Some(&statistics_rows),
    ))
}

fn read_json(path: &Path) -> Result<Value, String> {
    let bytes = std::fs::read(path).map_err(|error| error.to_string())?;
    serde_json::from_slice(&bytes).map_err(|error| error.to_string())
}

fn json_pointer_segment(value: &str) -> String {
    value.replace('~', "~0").replace('/', "~1")
}

fn numeric_shape(value: &Value) -> Option<Vec<u64>> {
    let Value::Array(values) = value else {
        return value.as_f64().map(|_| Vec::new());
    };
    if values.is_empty() {
        return Some(vec![0]);
    }
    let first = numeric_shape(&values[0])?;
    if values.iter().skip(1).any(|value| numeric_shape(value).as_ref() != Some(&first)) {
        return None;
    }
    let mut shape = vec![values.len() as u64];
    shape.extend(first);
    Some(shape)
}

fn table_rows_from_json(value: &Value) -> Option<(Vec<String>, Vec<Vec<Value>>)> {
    match value {
        Value::Array(values) if values.iter().all(|value| value.is_object()) => {
            let mut names = Vec::new();
            let mut seen = HashSet::new();
            for object in values.iter().filter_map(Value::as_object) {
                for name in object.keys() {
                    if seen.insert(name.clone()) {
                        names.push(name.clone());
                    }
                }
            }
            let rows = values
                .iter()
                .filter_map(Value::as_object)
                .map(|object| names.iter().map(|name| object.get(name).cloned().unwrap_or(Value::Null)).collect())
                .collect();
            Some((names, rows))
        }
        Value::Array(values) if values.iter().all(|value| !value.is_array() && !value.is_object()) => {
            Some((vec!["value".into()], values.iter().cloned().map(|value| vec![value]).collect()))
        }
        Value::Array(values) if values.iter().all(Value::is_array) && numeric_shape(value).is_none() => {
            let width = values.iter().filter_map(Value::as_array).map(Vec::len).max().unwrap_or(0);
            let names = (0..width).map(|index| format!("column_{}", index + 1)).collect::<Vec<_>>();
            let rows = values
                .iter()
                .filter_map(Value::as_array)
                .map(|row| (0..width).map(|index| row.get(index).cloned().unwrap_or(Value::Null)).collect())
                .collect();
            Some((names, rows))
        }
        Value::Object(object) if object.values().all(|value| !value.is_array() && !value.is_object()) => {
            let names = object.keys().cloned().collect::<Vec<_>>();
            let row = names.iter().map(|name| object.get(name).cloned().unwrap_or(Value::Null)).collect();
            Some((names, vec![row]))
        }
        _ => None,
    }
}

fn collect_json_datasets(value: &Value, id: &str, name: &str, depth: usize, datasets: &mut Vec<DatasetDescriptor>) {
    if depth > 5 {
        return;
    }
    if let Some(shape) = numeric_shape(value).filter(|shape| !shape.is_empty()) {
        datasets.push(DatasetDescriptor {
            id: id.to_string(),
            name: name.to_string(),
            kind: DatasetKind::Tensor,
            data_type: "number".into(),
            dimensions: shape
                .iter()
                .enumerate()
                .map(|(index, size)| super::DataDimension { name: format!("dim_{index}"), size: *size })
                .collect(),
            shape,
            columns: Vec::new(),
            row_count: None,
            description: Some("Numeric JSON array".into()),
        });
        return;
    }
    if let Some((names, rows)) = table_rows_from_json(value) {
        datasets.push(DatasetDescriptor {
            id: id.to_string(),
            name: name.to_string(),
            kind: DatasetKind::Table,
            data_type: "records".into(),
            shape: vec![rows.len() as u64, names.len() as u64],
            dimensions: Vec::new(),
            columns: columns_from_rows(&names, &rows.iter().take(INFERENCE_ROWS).cloned().collect::<Vec<_>>()),
            row_count: Some(rows.len() as u64),
            description: None,
        });
        return;
    }
    if let Value::Object(object) = value {
        for (key, child) in object {
            let child_id = if id == "$" {
                format!("/{}", json_pointer_segment(key))
            } else {
                format!("{id}/{}", json_pointer_segment(key))
            };
            collect_json_datasets(child, &child_id, key, depth + 1, datasets);
        }
    }
}

fn inspect_json(path: &Path) -> Result<(Vec<DatasetDescriptor>, Vec<String>), String> {
    let value = read_json(path)?;
    let mut datasets = Vec::new();
    collect_json_datasets(&value, "$", "Root", 0, &mut datasets);
    if datasets.is_empty() {
        return Err("JSON contains no tabular records or numeric arrays".into());
    }
    Ok((datasets, Vec::new()))
}

fn select_json<'a>(value: &'a Value, id: &str) -> Result<&'a Value, String> {
    if id.is_empty() || id == "$" {
        Ok(value)
    } else {
        value.pointer(id).ok_or_else(|| format!("JSON dataset not found: {id}"))
    }
}

fn preview_json(path: &Path, query: &DataQuery) -> Result<DataPreview, String> {
    let value = read_json(path)?;
    let selected = select_json(&value, if query.dataset_id.is_empty() { "$" } else { &query.dataset_id })?;
    if numeric_shape(selected).is_some_and(|shape| !shape.is_empty()) {
        return super::tensor::preview_json_tensor(selected, query);
    }
    let (names, rows) = table_rows_from_json(selected).ok_or_else(|| "Selected JSON value is not tabular".to_string())?;
    let total_rows = rows.len() as u64;
    let statistics_rows = rows.iter().take(STATISTICS_ROWS).cloned().collect::<Vec<_>>();
    Ok(table_preview(
        query.dataset_id.clone().is_empty().then_some("$".into()).unwrap_or_else(|| query.dataset_id.clone()),
        names,
        rows,
        query.offset,
        query.preview_limit(),
        total_rows,
        Some(&statistics_rows),
    ))
}

fn read_jsonl(path: &Path, max_rows: Option<usize>) -> Result<Vec<Value>, String> {
    let source = std::fs::read_to_string(path).map_err(|error| error.to_string())?;
    source
        .lines()
        .filter(|line| !line.trim().is_empty())
        .take(max_rows.unwrap_or(usize::MAX))
        .enumerate()
        .map(|(index, line)| serde_json::from_str(line).map_err(|error| format!("JSONL line {}: {error}", index + 1)))
        .collect()
}

fn inspect_jsonl(path: &Path) -> Result<(Vec<DatasetDescriptor>, Vec<String>), String> {
    let values = read_jsonl(path, None)?;
    let (names, rows) = table_rows_from_json(&Value::Array(values)).ok_or_else(|| "JSONL records are not tabular".to_string())?;
    let descriptor = DatasetDescriptor {
        id: "$".into(),
        name: "Records".into(),
        kind: DatasetKind::Table,
        data_type: "records".into(),
        shape: vec![rows.len() as u64, names.len() as u64],
        dimensions: Vec::new(),
        columns: columns_from_rows(&names, &rows.iter().take(INFERENCE_ROWS).cloned().collect::<Vec<_>>()),
        row_count: Some(rows.len() as u64),
        description: Some("Newline-delimited JSON records".into()),
    };
    Ok((vec![descriptor], Vec::new()))
}

fn preview_jsonl(path: &Path, query: &DataQuery) -> Result<DataPreview, String> {
    let values = read_jsonl(path, None)?;
    let (names, rows) = table_rows_from_json(&Value::Array(values)).ok_or_else(|| "JSONL records are not tabular".to_string())?;
    let total_rows = rows.len() as u64;
    let statistics_rows = rows.iter().take(STATISTICS_ROWS).cloned().collect::<Vec<_>>();
    Ok(table_preview("$".into(), names, rows, query.offset, query.preview_limit(), total_rows, Some(&statistics_rows)))
}

fn cell_value(value: &Data) -> Value {
    match value {
        Data::Empty => Value::Null,
        Data::Int(value) => Value::Number((*value).into()),
        Data::Float(value) => super::json_number(*value),
        Data::String(value) | Data::DateTimeIso(value) | Data::DurationIso(value) => Value::String(value.clone()),
        Data::Bool(value) => Value::Bool(*value),
        Data::DateTime(value) => super::json_number(value.as_f64()),
        Data::Error(value) => Value::String(format!("{value:?}")),
    }
}

fn worksheet_data(path: &Path, sheet: &str) -> Result<(Vec<String>, Vec<Vec<Value>>), String> {
    let mut workbook = open_workbook_auto(path).map_err(|error| error.to_string())?;
    let range = workbook.worksheet_range(sheet).map_err(|error| error.to_string())?;
    let mut rows = range.rows();
    let headers = unique_headers(
        rows.next()
            .unwrap_or(&[])
            .iter()
            .map(|value| match cell_value(value) {
                Value::String(value) => value,
                value => value.to_string().trim_matches('"').to_string(),
            }),
    );
    let values = rows
        .map(|row| (0..headers.len()).map(|index| row.get(index).map(cell_value).unwrap_or(Value::Null)).collect())
        .collect();
    Ok((headers, values))
}

fn inspect_workbook(path: &Path) -> Result<(Vec<DatasetDescriptor>, Vec<String>), String> {
    let workbook = open_workbook_auto(path).map_err(|error| error.to_string())?;
    let sheet_names = workbook.sheet_names().to_vec();
    drop(workbook);
    let mut datasets = Vec::new();
    let mut warnings = Vec::new();
    for sheet in sheet_names {
        match worksheet_data(path, &sheet) {
            Ok((headers, rows)) => datasets.push(DatasetDescriptor {
                id: sheet.clone(),
                name: sheet,
                kind: DatasetKind::Table,
                data_type: "worksheet".into(),
                shape: vec![rows.len() as u64, headers.len() as u64],
                dimensions: Vec::new(),
                columns: columns_from_rows(&headers, &rows.iter().take(INFERENCE_ROWS).cloned().collect::<Vec<_>>()),
                row_count: Some(rows.len() as u64),
                description: Some("Spreadsheet worksheet".into()),
            }),
            Err(error) => warnings.push(format!("Could not read sheet {sheet}: {error}")),
        }
    }
    if datasets.is_empty() {
        return Err("Workbook contains no readable worksheets".into());
    }
    Ok((datasets, warnings))
}

fn preview_workbook(path: &Path, query: &DataQuery) -> Result<DataPreview, String> {
    let sheet = if query.dataset_id.is_empty() {
        let workbook = open_workbook_auto(path).map_err(|error| error.to_string())?;
        workbook.sheet_names().first().cloned().ok_or_else(|| "Workbook has no worksheets".to_string())?
    } else {
        query.dataset_id.clone()
    };
    let (headers, rows) = worksheet_data(path, &sheet)?;
    let total_rows = rows.len() as u64;
    let statistics_rows = rows.iter().take(STATISTICS_ROWS).cloned().collect::<Vec<_>>();
    Ok(table_preview(sheet, headers, rows, query.offset, query.preview_limit(), total_rows, Some(&statistics_rows)))
}

fn parquet_value(value: &Field) -> Value {
    match value {
        Field::Null => Value::Null,
        Field::Bool(value) => Value::Bool(*value),
        Field::Byte(value) => Value::Number((*value as i64).into()),
        Field::Short(value) => Value::Number((*value as i64).into()),
        Field::Int(value) => Value::Number((*value).into()),
        Field::Long(value) => Value::Number((*value).into()),
        Field::UByte(value) => Value::Number((*value as u64).into()),
        Field::UShort(value) => Value::Number((*value as u64).into()),
        Field::UInt(value) => Value::Number((*value).into()),
        Field::ULong(value) => Value::Number((*value).into()),
        Field::Float16(value) => super::json_number(value.to_f64()),
        Field::Float(value) => super::json_number(*value as f64),
        Field::Double(value) => super::json_number(*value),
        Field::Str(value) => Value::String(value.clone()),
        Field::Date(value) => Value::Number((*value).into()),
        Field::TimeMillis(value) => Value::Number((*value).into()),
        Field::TimeMicros(value) => Value::Number((*value).into()),
        Field::TimestampMillis(value) => Value::Number((*value).into()),
        Field::TimestampMicros(value) => Value::Number((*value).into()),
        Field::Decimal(_) | Field::Bytes(_) | Field::Group(_) | Field::ListInternal(_) | Field::MapInternal(_) => {
            Value::String(value.to_string())
        }
    }
}

fn parquet_rows(path: &Path, max_rows: usize) -> Result<(Vec<String>, Vec<Vec<Value>>, u64), String> {
    let file = File::open(path).map_err(|error| error.to_string())?;
    let reader = SerializedFileReader::new(file).map_err(|error| error.to_string())?;
    let total_rows = reader.metadata().file_metadata().num_rows().max(0) as u64;
    let mut rows = reader
        .get_row_iter(None)
        .map_err(|error| error.to_string())?
        .take(max_rows)
        .map(|row| row.map_err(|error| error.to_string()))
        .collect::<Result<Vec<_>, _>>()?;
    let names = rows
        .first()
        .map(|row| row.get_column_iter().map(|(name, _)| name.clone()).collect())
        .unwrap_or_else(|| {
            reader
                .metadata()
                .file_metadata()
                .schema_descr()
                .columns()
                .iter()
                .map(|column| column.name().to_string())
                .collect()
        });
    let values = rows
        .drain(..)
        .map(|row| row.get_column_iter().map(|(_, value)| parquet_value(value)).collect())
        .collect();
    Ok((names, values, total_rows))
}

fn inspect_parquet(path: &Path) -> Result<(Vec<DatasetDescriptor>, Vec<String>), String> {
    let (names, rows, total_rows) = parquet_rows(path, INFERENCE_ROWS)?;
    let columns = columns_from_rows(&names, &rows);
    Ok((
        vec![DatasetDescriptor {
            id: "$".into(),
            name: "Rows".into(),
            kind: DatasetKind::Table,
            data_type: "columnar records".into(),
            shape: vec![total_rows, names.len() as u64],
            dimensions: Vec::new(),
            columns,
            row_count: Some(total_rows),
            description: Some("Apache Parquet row groups".into()),
        }],
        Vec::new(),
    ))
}

fn preview_parquet(path: &Path, query: &DataQuery) -> Result<DataPreview, String> {
    let max_rows = STATISTICS_ROWS.max(query.offset + query.preview_limit());
    let (names, rows, total_rows) = parquet_rows(path, max_rows)?;
    let statistics_rows = rows.iter().take(STATISTICS_ROWS).cloned().collect::<Vec<_>>();
    Ok(table_preview("$".into(), names, rows, query.offset, query.preview_limit(), total_rows, Some(&statistics_rows)))
}

#[cfg(test)]
mod tests {
    use super::{numeric_shape, table_rows_from_json};
    use serde_json::json;

    #[test]
    fn distinguishes_records_from_numeric_tensors() {
        assert_eq!(numeric_shape(&json!([[1, 2], [3, 4]])), Some(vec![2, 2]));
        let (columns, rows) = table_rows_from_json(&json!([{ "x": 1, "y": 2 }, { "x": 3, "y": 4 }])).unwrap();
        assert_eq!(columns, vec!["x", "y"]);
        assert_eq!(rows.len(), 2);
    }
}

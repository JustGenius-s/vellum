use super::{
    statistics, DataDimension, DataFormat, DataPreview, DataQuery, DatasetDescriptor, DatasetKind,
    FixedDimension, TensorPoint, TensorPreview,
};
use hdf5_reader::group::Group;
use hdf5_reader::{Datatype, Dataset, Hdf5File, SliceInfo, SliceInfoElem};
use matfile::{MatFile, NumericData};
use netcdf_reader::{NcFile, NcGroup, NcSliceInfo, NcSliceInfoElem};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::path::Path;

const MAX_TENSOR_POINTS: u64 = 4_096;

pub fn inspect(path: &Path, format: DataFormat) -> Result<(Vec<DatasetDescriptor>, Vec<String>), String> {
    match format {
        DataFormat::Hdf5 => inspect_hdf5(path, Vec::new()),
        DataFormat::Mat if is_hdf5(path)? => inspect_hdf5(
            path,
            vec!["MATLAB v7.3 uses the HDF5 adapter; internal MATLAB metadata may be visible".into()],
        ),
        DataFormat::Mat => inspect_mat(path),
        DataFormat::Netcdf => inspect_netcdf(path),
        _ => Err("The selected adapter is not multidimensional".into()),
    }
}

pub fn preview(path: &Path, format: DataFormat, query: &DataQuery) -> Result<DataPreview, String> {
    match format {
        DataFormat::Hdf5 => preview_hdf5(path, query),
        DataFormat::Mat if is_hdf5(path)? => preview_hdf5(path, query),
        DataFormat::Mat => preview_mat(path, query),
        DataFormat::Netcdf => preview_netcdf(path, query),
        _ => Err("The selected adapter is not multidimensional".into()),
    }
}

fn is_hdf5(path: &Path) -> Result<bool, String> {
    use std::io::Read;
    let mut file = File::open(path).map_err(|error| error.to_string())?;
    let mut signature = [0u8; 8];
    let read = file.read(&mut signature).map_err(|error| error.to_string())?;
    Ok(read == signature.len() && signature == [0x89, b'H', b'D', b'F', b'\r', b'\n', 0x1a, b'\n'])
}

#[derive(Debug)]
struct SelectionPlan {
    varying: Vec<usize>,
    fixed: Vec<FixedDimension>,
    steps: Vec<u64>,
    output_shape: Vec<u64>,
    sampled: bool,
    total_points: u64,
}

fn selection_plan(shape: &[u64], query: &DataQuery) -> Result<SelectionPlan, String> {
    if shape.iter().any(|size| *size == 0) {
        return Ok(SelectionPlan {
            varying: Vec::new(),
            fixed: Vec::new(),
            steps: Vec::new(),
            output_shape: Vec::new(),
            sampled: false,
            total_points: 0,
        });
    }
    let mut varying = query
        .varying_dimensions
        .iter()
        .copied()
        .filter(|dimension| *dimension < shape.len())
        .collect::<Vec<_>>();
    varying.sort_unstable();
    varying.dedup();
    varying.truncate(2);
    if varying.is_empty() && !shape.is_empty() {
        if shape.len() <= 2 {
            varying.extend(0..shape.len());
        } else {
            varying.push(shape.len() - 1);
        }
    }
    let varying_set = varying.iter().copied().collect::<HashSet<_>>();
    let requested_fixed = query
        .fixed_dimensions
        .iter()
        .map(|item| (item.dimension, item.index))
        .collect::<HashMap<_, _>>();
    let fixed = shape
        .iter()
        .enumerate()
        .filter(|(dimension, _)| !varying_set.contains(dimension))
        .map(|(dimension, size)| FixedDimension {
            dimension,
            index: requested_fixed.get(&dimension).copied().unwrap_or(0).min(size.saturating_sub(1)),
        })
        .collect::<Vec<_>>();
    let mut steps = varying.iter().map(|_| 1u64).collect::<Vec<_>>();
    let total_points = varying
        .iter()
        .try_fold(1u64, |total, dimension| total.checked_mul(shape[*dimension]))
        .ok_or_else(|| "Tensor slice is too large".to_string())?;
    let count = |steps: &[u64]| {
        varying
            .iter()
            .zip(steps)
            .fold(1u64, |total, (dimension, step)| {
                total.saturating_mul(shape[*dimension].div_ceil(*step))
            })
    };
    while count(&steps) > MAX_TENSOR_POINTS {
        let Some((index, _)) = varying
            .iter()
            .enumerate()
            .max_by_key(|(index, dimension)| shape[**dimension].div_ceil(steps[*index]))
        else {
            break;
        };
        steps[index] = steps[index].saturating_mul(2);
    }
    let output_shape = varying
        .iter()
        .zip(&steps)
        .map(|(dimension, step)| shape[*dimension].div_ceil(*step))
        .collect::<Vec<_>>();
    let sampled = count(&steps) < total_points;
    Ok(SelectionPlan {
        varying,
        fixed,
        sampled,
        steps,
        output_shape,
        total_points,
    })
}

fn coordinates(plan: &SelectionPlan, value_count: usize) -> Vec<Vec<u64>> {
    if plan.varying.is_empty() {
        return (0..value_count).map(|_| Vec::new()).collect();
    }
    (0..value_count)
        .map(|mut linear| {
            let mut coordinate = vec![0u64; plan.output_shape.len()];
            for index in (0..plan.output_shape.len()).rev() {
                let size = plan.output_shape[index].max(1) as usize;
                coordinate[index] = (linear % size) as u64 * plan.steps[index];
                linear /= size;
            }
            coordinate
        })
        .collect()
}

fn tensor_preview(
    dataset_id: String,
    original_shape: Vec<u64>,
    plan: SelectionPlan,
    values: Vec<f64>,
) -> DataPreview {
    let points = coordinates(&plan, values.len())
        .into_iter()
        .zip(values.iter().copied())
        .map(|(coordinates, value)| TensorPoint {
            coordinates,
            value: value.is_finite().then_some(value),
        })
        .collect::<Vec<_>>();
    let stat_values = values
        .iter()
        .map(|value| value.is_finite().then_some(*value))
        .collect::<Vec<_>>();
    let stats = statistics("value", &stat_values, plan.total_points, plan.sampled);
    DataPreview {
        dataset_id,
        kind: DatasetKind::Tensor,
        columns: Vec::new(),
        rows: Vec::new(),
        row_offset: 0,
        total_rows: None,
        statistics: vec![stats],
        tensor: Some(TensorPreview {
            shape: original_shape,
            varying_dimensions: plan.varying,
            fixed_dimensions: plan.fixed,
            points,
        }),
        sampled: plan.sampled,
    }
}

fn source_index(shape: &[u64], coordinate: &[u64], column_major: bool) -> Option<usize> {
    if shape.len() != coordinate.len() {
        return None;
    }
    let mut index = 0u64;
    let mut stride = 1u64;
    if column_major {
        for (size, value) in shape.iter().zip(coordinate) {
            index = index.checked_add(value.checked_mul(stride)?)?;
            stride = stride.checked_mul(*size)?;
        }
    } else {
        for (size, value) in shape.iter().zip(coordinate).rev() {
            index = index.checked_add(value.checked_mul(stride)?)?;
            stride = stride.checked_mul(*size)?;
        }
    }
    usize::try_from(index).ok()
}

fn project_flat_values(shape: &[u64], values: &[f64], plan: &SelectionPlan, column_major: bool) -> Vec<f64> {
    let count = plan.output_shape.iter().product::<u64>().max(1) as usize;
    coordinates(plan, count)
        .into_iter()
        .filter_map(|varying_coordinate| {
            let mut source_coordinate = vec![0u64; shape.len()];
            for fixed in &plan.fixed {
                source_coordinate[fixed.dimension] = fixed.index;
            }
            for (index, dimension) in plan.varying.iter().enumerate() {
                source_coordinate[*dimension] = varying_coordinate[index];
            }
            source_index(shape, &source_coordinate, column_major).and_then(|index| values.get(index).copied())
        })
        .collect()
}

fn flatten_json_numbers(value: &Value, output: &mut Vec<f64>) -> Result<(), String> {
    match value {
        Value::Array(values) => {
            for value in values {
                flatten_json_numbers(value, output)?;
            }
            Ok(())
        }
        Value::Number(value) => {
            output.push(value.as_f64().ok_or_else(|| "JSON number cannot be represented as f64".to_string())?);
            Ok(())
        }
        _ => Err("JSON tensor contains a non-numeric value".into()),
    }
}

fn json_shape(value: &Value) -> Result<Vec<u64>, String> {
    match value {
        Value::Number(_) => Ok(Vec::new()),
        Value::Array(values) => {
            if values.is_empty() {
                return Ok(vec![0]);
            }
            let child = json_shape(&values[0])?;
            if values.iter().skip(1).any(|value| json_shape(value).ok().as_ref() != Some(&child)) {
                return Err("JSON tensor is ragged".into());
            }
            let mut shape = vec![values.len() as u64];
            shape.extend(child);
            Ok(shape)
        }
        _ => Err("JSON value is not a numeric tensor".into()),
    }
}

pub(super) fn preview_json_tensor(value: &Value, query: &DataQuery) -> Result<DataPreview, String> {
    let shape = json_shape(value)?;
    let plan = selection_plan(&shape, query)?;
    let mut values = Vec::new();
    flatten_json_numbers(value, &mut values)?;
    let projected = project_flat_values(&shape, &values, &plan, false);
    Ok(tensor_preview(
        if query.dataset_id.is_empty() { "$".into() } else { query.dataset_id.clone() },
        shape,
        plan,
        projected,
    ))
}

fn hdf5_type_name(dtype: &Datatype) -> String {
    match dtype {
        Datatype::FixedPoint { size, signed, .. } => format!("{}{}", if *signed { "int" } else { "uint" }, u16::from(*size) * 8),
        Datatype::FloatingPoint { size, .. } => format!("float{}", u16::from(*size) * 8),
        Datatype::String { .. } | Datatype::VarLen { .. } => "string".into(),
        Datatype::Compound { .. } => "compound".into(),
        Datatype::Array { .. } => "array".into(),
        Datatype::Enum { .. } => "enum".into(),
        Datatype::Opaque { .. } => "opaque".into(),
        Datatype::Reference { .. } => "reference".into(),
        Datatype::Bitfield { size, .. } => format!("bitfield{}", u16::from(*size) * 8),
    }
}

fn hdf5_descriptor(path: String, dataset: &Dataset) -> DatasetDescriptor {
    let shape = dataset.shape().to_vec();
    DatasetDescriptor {
        id: path,
        name: dataset.name().to_string(),
        kind: DatasetKind::Tensor,
        data_type: hdf5_type_name(dataset.dtype()),
        dimensions: shape
            .iter()
            .enumerate()
            .map(|(index, size)| DataDimension { name: format!("dim_{index}"), size: *size })
            .collect(),
        shape,
        columns: Vec::new(),
        row_count: None,
        description: dataset.chunks().map(|chunks| format!("Chunked {}", chunks.iter().map(u32::to_string).collect::<Vec<_>>().join(" x "))),
    }
}

fn collect_hdf5(group: Group, parent: &str, datasets: &mut Vec<DatasetDescriptor>, warnings: &mut Vec<String>) {
    let (groups, children) = match group.members() {
        Ok(members) => members,
        Err(error) => {
            warnings.push(format!("Could not inspect HDF5 group {parent}: {error}"));
            return;
        }
    };
    for dataset in children {
        let path = format!("{}/{}", parent.trim_end_matches('/'), dataset.name());
        datasets.push(hdf5_descriptor(if path.starts_with('/') { path } else { format!("/{path}") }, &dataset));
    }
    for child in groups {
        let path = format!("{}/{}", parent.trim_end_matches('/'), child.name());
        collect_hdf5(child, &path, datasets, warnings);
    }
}

fn inspect_hdf5(path: &Path, mut warnings: Vec<String>) -> Result<(Vec<DatasetDescriptor>, Vec<String>), String> {
    let file = Hdf5File::open(path).map_err(|error| error.to_string())?;
    let root = file.root_group().map_err(|error| error.to_string())?;
    let mut datasets = Vec::new();
    collect_hdf5(root, "", &mut datasets, &mut warnings);
    if datasets.is_empty() {
        return Err("HDF5 file contains no readable datasets".into());
    }
    datasets.sort_by(|left, right| left.id.cmp(&right.id));
    Ok((datasets, warnings))
}

fn hdf5_selection(shape: &[u64], plan: &SelectionPlan) -> SliceInfo {
    let fixed = plan.fixed.iter().map(|item| (item.dimension, item.index)).collect::<HashMap<_, _>>();
    let steps = plan.varying.iter().copied().zip(plan.steps.iter().copied()).collect::<HashMap<_, _>>();
    SliceInfo {
        selections: shape
            .iter()
            .enumerate()
            .map(|(dimension, size)| {
                fixed
                    .get(&dimension)
                    .copied()
                    .map(SliceInfoElem::Index)
                    .unwrap_or_else(|| SliceInfoElem::Slice {
                        start: 0,
                        end: *size,
                        step: steps.get(&dimension).copied().unwrap_or(1),
                    })
            })
            .collect(),
    }
}

fn hdf5_numeric_values(dataset: &Dataset, selection: &SliceInfo) -> Result<Vec<f64>, String> {
    macro_rules! read_values {
        ($ty:ty) => {{
            dataset
                .read_slice::<$ty>(selection)
                .map(|array| array.iter().map(|value| *value as f64).collect())
                .map_err(|error| error.to_string())
        }};
    }
    match dataset.dtype() {
        Datatype::FixedPoint { size: 1, signed: true, .. } => read_values!(i8),
        Datatype::FixedPoint { size: 1, signed: false, .. } => read_values!(u8),
        Datatype::FixedPoint { size: 2, signed: true, .. } => read_values!(i16),
        Datatype::FixedPoint { size: 2, signed: false, .. } => read_values!(u16),
        Datatype::FixedPoint { size: 4, signed: true, .. } => read_values!(i32),
        Datatype::FixedPoint { size: 4, signed: false, .. } => read_values!(u32),
        Datatype::FixedPoint { size: 8, signed: true, .. } => read_values!(i64),
        Datatype::FixedPoint { size: 8, signed: false, .. } => read_values!(u64),
        Datatype::FloatingPoint { size: 4, .. } => read_values!(f32),
        Datatype::FloatingPoint { size: 8, .. } => read_values!(f64),
        other => Err(format!("HDF5 dataset type is not numeric: {}", hdf5_type_name(other))),
    }
}

fn preview_hdf5(path: &Path, query: &DataQuery) -> Result<DataPreview, String> {
    let file = Hdf5File::open(path).map_err(|error| error.to_string())?;
    let dataset_id = if query.dataset_id.is_empty() {
        inspect_hdf5(path, Vec::new())?.0.first().map(|dataset| dataset.id.clone()).ok_or_else(|| "HDF5 file has no datasets".to_string())?
    } else {
        query.dataset_id.clone()
    };
    let dataset = file.dataset(&dataset_id).map_err(|error| error.to_string())?;
    let shape = dataset.shape().to_vec();
    let plan = selection_plan(&shape, query)?;
    let selection = hdf5_selection(&shape, &plan);
    let values = hdf5_numeric_values(&dataset, &selection)?;
    Ok(tensor_preview(dataset_id, shape, plan, values))
}

fn mat_type_name(data: &NumericData) -> &'static str {
    match data {
        NumericData::Int8 { .. } => "int8",
        NumericData::UInt8 { .. } => "uint8",
        NumericData::Int16 { .. } => "int16",
        NumericData::UInt16 { .. } => "uint16",
        NumericData::Int32 { .. } => "int32",
        NumericData::UInt32 { .. } => "uint32",
        NumericData::Int64 { .. } => "int64",
        NumericData::UInt64 { .. } => "uint64",
        NumericData::Single { .. } => "float32",
        NumericData::Double { .. } => "float64",
    }
}

fn mat_values(data: &NumericData) -> Vec<f64> {
    macro_rules! values {
        ($real:expr) => {
            $real.iter().map(|value| *value as f64).collect()
        };
    }
    match data {
        NumericData::Int8 { real, .. } => values!(real),
        NumericData::UInt8 { real, .. } => values!(real),
        NumericData::Int16 { real, .. } => values!(real),
        NumericData::UInt16 { real, .. } => values!(real),
        NumericData::Int32 { real, .. } => values!(real),
        NumericData::UInt32 { real, .. } => values!(real),
        NumericData::Int64 { real, .. } => values!(real),
        NumericData::UInt64 { real, .. } => values!(real),
        NumericData::Single { real, .. } => values!(real),
        NumericData::Double { real, .. } => real.clone(),
    }
}

fn mat_has_imaginary(data: &NumericData) -> bool {
    match data {
        NumericData::Int8 { imag, .. } => imag.is_some(),
        NumericData::UInt8 { imag, .. } => imag.is_some(),
        NumericData::Int16 { imag, .. } => imag.is_some(),
        NumericData::UInt16 { imag, .. } => imag.is_some(),
        NumericData::Int32 { imag, .. } => imag.is_some(),
        NumericData::UInt32 { imag, .. } => imag.is_some(),
        NumericData::Int64 { imag, .. } => imag.is_some(),
        NumericData::UInt64 { imag, .. } => imag.is_some(),
        NumericData::Single { imag, .. } => imag.is_some(),
        NumericData::Double { imag, .. } => imag.is_some(),
    }
}

fn read_mat(path: &Path) -> Result<MatFile, String> {
    MatFile::parse(File::open(path).map_err(|error| error.to_string())?).map_err(|error| error.to_string())
}

fn inspect_mat(path: &Path) -> Result<(Vec<DatasetDescriptor>, Vec<String>), String> {
    let file = read_mat(path)?;
    let mut warnings = Vec::new();
    let datasets = file
        .arrays()
        .iter()
        .map(|array| {
            if mat_has_imaginary(array.data()) {
                warnings.push(format!("{} is complex; previews currently use the real component", array.name()));
            }
            let shape = array.size().iter().map(|size| *size as u64).collect::<Vec<_>>();
            DatasetDescriptor {
                id: array.name().to_string(),
                name: array.name().to_string(),
                kind: DatasetKind::Tensor,
                data_type: mat_type_name(array.data()).into(),
                dimensions: shape
                    .iter()
                    .enumerate()
                    .map(|(index, size)| DataDimension { name: format!("dim_{index}"), size: *size })
                    .collect(),
                shape,
                columns: Vec::new(),
                row_count: None,
                description: Some("MATLAB numeric array".into()),
            }
        })
        .collect::<Vec<_>>();
    if datasets.is_empty() {
        return Err("MAT file contains no supported numeric arrays".into());
    }
    Ok((datasets, warnings))
}

fn preview_mat(path: &Path, query: &DataQuery) -> Result<DataPreview, String> {
    let file = read_mat(path)?;
    let array = if query.dataset_id.is_empty() {
        file.arrays().first()
    } else {
        file.find_by_name(&query.dataset_id)
    }
    .ok_or_else(|| "MAT variable not found".to_string())?;
    let shape = array.size().iter().map(|size| *size as u64).collect::<Vec<_>>();
    let plan = selection_plan(&shape, query)?;
    let values = mat_values(array.data());
    let projected = project_flat_values(&shape, &values, &plan, true);
    Ok(tensor_preview(array.name().to_string(), shape, plan, projected))
}

fn collect_netcdf_group(group: &NcGroup, parent: &str, datasets: &mut Vec<DatasetDescriptor>) {
    for variable in &group.variables {
        let id = if parent.is_empty() {
            variable.name.clone()
        } else {
            format!("{}/{}", parent.trim_matches('/'), variable.name)
        };
        let shape = variable.shape();
        datasets.push(DatasetDescriptor {
            id,
            name: variable.name.clone(),
            kind: DatasetKind::Tensor,
            data_type: format!("{:?}", variable.dtype()),
            shape,
            dimensions: variable
                .dimensions()
                .iter()
                .map(|dimension| DataDimension { name: dimension.name.clone(), size: dimension.size })
                .collect(),
            columns: Vec::new(),
            row_count: None,
            description: variable
                .is_coordinate_variable()
                .then_some("Coordinate variable".into()),
        });
    }
    for child in &group.groups {
        let path = if parent.is_empty() { child.name.clone() } else { format!("{parent}/{}", child.name) };
        collect_netcdf_group(child, &path, datasets);
    }
}

fn inspect_netcdf(path: &Path) -> Result<(Vec<DatasetDescriptor>, Vec<String>), String> {
    let file = NcFile::open(path).map_err(|error| error.to_string())?;
    let root = file.root_group().map_err(|error| error.to_string())?;
    let mut datasets = Vec::new();
    collect_netcdf_group(root, "", &mut datasets);
    if datasets.is_empty() {
        return Err("NetCDF file contains no variables".into());
    }
    Ok((datasets, Vec::new()))
}

fn netcdf_selection(shape: &[u64], plan: &SelectionPlan) -> NcSliceInfo {
    let fixed = plan.fixed.iter().map(|item| (item.dimension, item.index)).collect::<HashMap<_, _>>();
    let steps = plan.varying.iter().copied().zip(plan.steps.iter().copied()).collect::<HashMap<_, _>>();
    NcSliceInfo {
        selections: shape
            .iter()
            .enumerate()
            .map(|(dimension, size)| {
                fixed
                    .get(&dimension)
                    .copied()
                    .map(NcSliceInfoElem::Index)
                    .unwrap_or_else(|| NcSliceInfoElem::Slice {
                        start: 0,
                        end: *size,
                        step: steps.get(&dimension).copied().unwrap_or(1),
                    })
            })
            .collect(),
    }
}

fn preview_netcdf(path: &Path, query: &DataQuery) -> Result<DataPreview, String> {
    let file = NcFile::open(path).map_err(|error| error.to_string())?;
    let dataset_id = if query.dataset_id.is_empty() {
        inspect_netcdf(path)?.0.first().map(|dataset| dataset.id.clone()).ok_or_else(|| "NetCDF file has no variables".to_string())?
    } else {
        query.dataset_id.clone()
    };
    let variable = file.variable(&dataset_id).map_err(|error| error.to_string())?;
    let shape = variable.shape();
    let plan = selection_plan(&shape, query)?;
    let selection = netcdf_selection(&shape, &plan);
    let values = file
        .read_variable_slice_unpacked_masked(&dataset_id, &selection)
        .map_err(|error| error.to_string())?
        .iter()
        .copied()
        .collect();
    Ok(tensor_preview(dataset_id, shape, plan, values))
}

#[cfg(test)]
mod tests {
    use super::{project_flat_values, selection_plan};
    use crate::data::DataQuery;

    #[test]
    fn projects_a_single_varying_dimension() {
        let query = DataQuery {
            varying_dimensions: vec![1],
            ..Default::default()
        };
        let plan = selection_plan(&[2, 3], &query).unwrap();
        let values = project_flat_values(&[2, 3], &[0.0, 1.0, 2.0, 3.0, 4.0, 5.0], &plan, false);
        assert_eq!(values, vec![0.0, 1.0, 2.0]);
    }
}

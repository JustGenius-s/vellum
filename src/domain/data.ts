export type DataFormat =
  | "csv"
  | "tsv"
  | "json"
  | "jsonl"
  | "xlsx"
  | "parquet"
  | "hdf5"
  | "mat"
  | "netcdf";

export type DatasetKind = "table" | "tensor";

export interface DataDimension {
  name: string;
  size: number;
}

export interface DataColumn {
  name: string;
  dataType: string;
  numeric: boolean;
}

export interface DatasetDescriptor {
  id: string;
  name: string;
  kind: DatasetKind;
  dataType: string;
  shape: number[];
  dimensions: DataDimension[];
  columns: DataColumn[];
  rowCount: number | null;
  description: string | null;
}

export interface DataCatalog {
  format: DataFormat;
  adapter: string;
  sourcePath: string;
  sizeBytes: number;
  datasets: DatasetDescriptor[];
  warnings: string[];
}

export interface FixedDimension {
  dimension: number;
  index: number;
}

export interface DataQuery {
  datasetId: string;
  offset: number;
  limit: number;
  varyingDimensions: number[];
  fixedDimensions: FixedDimension[];
  exactStatistics: boolean;
}

export interface SeriesStatistics {
  name: string;
  count: number;
  validCount: number;
  missingCount: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  median: number | null;
  standardDeviation: number | null;
  q1: number | null;
  q3: number | null;
  sampled: boolean;
}

export interface TensorPoint {
  coordinates: number[];
  value: number | null;
}

export interface TensorPreview {
  shape: number[];
  varyingDimensions: number[];
  fixedDimensions: FixedDimension[];
  points: TensorPoint[];
}

export interface DataPreview {
  datasetId: string;
  kind: DatasetKind;
  columns: DataColumn[];
  rows: unknown[][];
  rowOffset: number;
  totalRows: number | null;
  statistics: SeriesStatistics[];
  tensor: TensorPreview | null;
  sampled: boolean;
}

export interface PreparedDataFigure {
  id: string;
  directoryPath: string;
  typstPath: string;
  dataPath: string;
  metadataPath: string;
}

export const emptyDataQuery = (): DataQuery => ({
  datasetId: "",
  offset: 0,
  limit: 80,
  varyingDimensions: [],
  fixedDimensions: [],
  exactStatistics: false,
});

export function dataFormat(path: string): DataFormat | null {
  const extension = /\.([^.]+)$/.exec(path)?.[1].toLowerCase();
  switch (extension) {
    case "csv":
      return "csv";
    case "tsv":
      return "tsv";
    case "json":
      return "json";
    case "jsonl":
    case "ndjson":
      return "jsonl";
    case "xlsx":
    case "xls":
    case "xlsb":
    case "ods":
      return "xlsx";
    case "parquet":
      return "parquet";
    case "h5":
    case "hdf5":
      return "hdf5";
    case "mat":
      return "mat";
    case "nc":
    case "cdf":
    case "netcdf":
      return "netcdf";
    default:
      return null;
  }
}

export function isDataFile(path: string) {
  return dataFormat(path) !== null;
}

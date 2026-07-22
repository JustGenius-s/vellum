import { isDataFile } from "@/domain/data";

export function isFigureTarget(path: string) {
  return /\.(?:typ|md)$/i.test(path) && !isDataFile(path);
}

export function isWorkspaceTextFile(path: string) {
  return /\.(?:typ|md|bib|txt|toml|ya?ml|csv|tsv|jsonl?|ndjson)$/i.test(path);
}

export function isBinaryDataFile(path: string) {
  return /\.(?:xlsx|parquet|h5|hdf5|mat|nc|cdf|netcdf)$/i.test(path);
}

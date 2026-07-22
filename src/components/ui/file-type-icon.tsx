import {
  BookOpenTextIcon,
  CubeIcon,
  DatabaseIcon,
  FileCodeIcon,
  FileCsvIcon,
  FileTextIcon,
  FileXlsIcon,
} from "@phosphor-icons/react";
import { siMarkdown, siTypst, type SimpleIcon } from "simple-icons";
import type { ComponentProps } from "react";

type FileTypeIconKind =
  | "bibliography"
  | "delimited"
  | "json"
  | "markdown"
  | "spreadsheet"
  | "columnar"
  | "tensor"
  | "typst"
  | "generic";

const simpleIcons: Readonly<Record<Extract<FileTypeIconKind, "markdown" | "typst">, SimpleIcon>> = {
  markdown: siMarkdown,
  typst: siTypst,
};

function resolveFileTypeIconKind(name: string): FileTypeIconKind {
  const extension = /\.([^.]+)$/.exec(name)?.[1].toLowerCase();
  if (extension === "bib") return "bibliography";
  if (extension === "csv" || extension === "tsv") return "delimited";
  if (extension === "json" || extension === "jsonl" || extension === "ndjson") return "json";
  if (["xlsx", "xls", "xlsb", "ods"].includes(extension ?? "")) return "spreadsheet";
  if (extension === "parquet") return "columnar";
  if (["h5", "hdf5", "mat", "nc", "cdf", "netcdf"].includes(extension ?? "")) {
    return "tensor";
  }
  if (extension === "md" || extension === "markdown") return "markdown";
  if (extension === "typ" || extension === "typst") return "typst";
  return "generic";
}

function FileTypeIcon({
  name,
  fallbackWeight = "regular",
  ...props
}: ComponentProps<"svg"> & {
  name: string;
  fallbackWeight?: ComponentProps<typeof FileTextIcon>["weight"];
}) {
  const kind = resolveFileTypeIconKind(name);

  if (kind === "bibliography") {
    return (
      <BookOpenTextIcon
        aria-hidden="true"
        data-slot="file-type-icon"
        focusable="false"
        weight={fallbackWeight}
        {...props}
      />
    );
  }

  const DataIcon =
    kind === "delimited"
      ? FileCsvIcon
      : kind === "json"
        ? FileCodeIcon
        : kind === "spreadsheet"
          ? FileXlsIcon
          : kind === "columnar"
            ? DatabaseIcon
            : kind === "tensor"
              ? CubeIcon
              : null;

  if (DataIcon) {
    return (
      <DataIcon
        aria-hidden="true"
        data-slot="file-type-icon"
        focusable="false"
        weight={fallbackWeight}
        {...props}
      />
    );
  }

  if (kind === "generic") {
    return (
      <FileTextIcon
        aria-hidden="true"
        data-slot="file-type-icon"
        focusable="false"
        weight={fallbackWeight}
        {...props}
      />
    );
  }

  const icon = kind === "markdown" ? simpleIcons.markdown : simpleIcons.typst;

  return (
    <svg
      aria-hidden="true"
      data-slot="file-type-icon"
      fill="currentColor"
      focusable="false"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d={icon.path} />
    </svg>
  );
}

export { FileTypeIcon, resolveFileTypeIconKind };
export type { FileTypeIconKind };

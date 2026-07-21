import { BookOpenTextIcon, FileTextIcon } from "@phosphor-icons/react";
import { siMarkdown, siTypst, type SimpleIcon } from "simple-icons";
import type { ComponentProps } from "react";

type FileTypeIconKind = "bibliography" | "markdown" | "typst" | "generic";

const simpleIcons: Readonly<
  Record<Exclude<FileTypeIconKind, "bibliography" | "generic">, SimpleIcon>
> = {
  markdown: siMarkdown,
  typst: siTypst,
};

function resolveFileTypeIconKind(name: string): FileTypeIconKind {
  const extension = /\.([^.]+)$/.exec(name)?.[1].toLowerCase();
  if (extension === "bib") return "bibliography";
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

  const icon = simpleIcons[kind];

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

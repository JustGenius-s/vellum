import { documentFormat } from "@/domain/workspace";

export type FigurePlacement = "cursor" | "end";

function normalizedParts(path: string) {
  return path.replaceAll("\\", "/").replace(/\/$/, "").split("/");
}

export function relativeFilePath(path: string, fromDirectory: string) {
  const target = normalizedParts(path);
  const from = normalizedParts(fromDirectory);
  let common = 0;
  while (common < target.length && common < from.length && target[common] === from[common]) {
    common += 1;
  }
  return [...Array(from.length - common).fill(".."), ...target.slice(common)].join("/") || ".";
}

export function figureReference(
  targetPath: string,
  figurePath: string,
  figureId: string,
) {
  const directory = targetPath.replaceAll("\\", "/").replace(/\/[^/]*$/, "");
  const includePath = relativeFilePath(figurePath, directory).replaceAll('"', '\\"');
  if (documentFormat(targetPath) === "markdown") {
    return `![[${includePath}]]`;
  }
  return `// vellum:chart id="${figureId.replaceAll('"', '\\"')}"\n#include "${includePath}"`;
}

export function insertFigureReference(
  content: string,
  reference: string,
  placement: FigurePlacement,
  cursorOffset?: number,
) {
  const requested =
    placement === "cursor" && cursorOffset != null
      ? Math.min(Math.max(0, cursorOffset), content.length)
      : content.length;
  const followingBreak = content.indexOf("\n", requested);
  const offset = followingBreak < 0 ? content.length : followingBreak + 1;
  const before = content.slice(0, offset);
  const after = content.slice(offset);
  const prefix = before.length === 0 || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const suffix = after.length === 0 || after.startsWith("\n\n") ? "\n" : after.startsWith("\n") ? "\n" : "\n\n";
  return `${before}${prefix}${reference}${suffix}${after}`;
}

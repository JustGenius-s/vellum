export type RuntimeMode = "desktop" | "demo";

export interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
}

export interface DocumentTab {
  path: string;
  name: string;
  content: string;
  dirty: boolean;
}

export interface CompileDiagnostic {
  severity: string;
  message: string;
  line: number | null;
  column: number | null;
  path: string | null;
  hints: string[];
}

export interface CompileSvgResult {
  pages: string[] | null;
  diagnostics: CompileDiagnostic[];
}

export type CompileProgressStage =
  | "queued"
  | "preparing"
  | "compiling"
  | "rendering"
  | "complete";

export interface CompileProgress {
  stage: CompileProgressStage;
  value: number;
  label: string;
  detail: string | null;
}

export interface SearchMatch {
  path: string;
  relativePath: string;
  line: number;
  column: number;
  preview: string;
}

export interface BacklinkIndex {
  links: Record<string, string[]>;
}

export interface FontCatalog {
  latin: string[];
  cjk: string[];
}

export type PackageLocation = "cache" | "data";

export interface PackageDirectories {
  cachePath: string | null;
  dataPath: string | null;
}

export interface TemplateMetadata {
  path: string;
  entrypoint: string;
  thumbnail: string | null;
}

export interface PackageEntry {
  spec: string;
  namespace: string;
  name: string;
  version: string;
  location: PackageLocation;
  path: string;
  sizeBytes: number;
  modifiedAtMs: number | null;
  removable: boolean;
  description: string | null;
  template: TemplateMetadata | null;
}

export interface PackageCatalog {
  packages: PackageEntry[];
  cachePath: string | null;
  dataPath: string | null;
  cacheSizeBytes: number;
  dataSizeBytes: number;
  cacheCount: number;
  dataCount: number;
  templateCount: number;
}

export interface TemplateProjectPlan {
  destination: string;
  entrypoint: string;
  destinationExists: boolean;
  destinationFileCount: number;
  templateFileCount: number;
  filesToCreate: number;
  conflicts: string[];
  requiresMerge: boolean;
}

export interface TemplateProjectResult {
  destination: string;
  entrypoint: string;
  createdFiles: number;
  skippedFiles: number;
}

export interface TemplateThumbnail {
  mediaType: string;
  bytes: number[];
}

export interface SavedSession {
  vaultPath: string | null;
  openTabs: string[];
  activeTabPath: string | null;
  latinFont: string | null;
  cjkFont: string | null;
  packageCachePath: string | null;
  packageDataPath: string | null;
}

export interface OutlineHeading {
  level: number;
  title: string;
  line: number;
  from: number;
}

export type DocumentFormat = "typst" | "markdown" | "bibliography";

export function fileName(path: string) {
  return path.split(/[\\/]/).pop() ?? path;
}

export function fileStem(path: string) {
  return fileName(path).replace(/\.(?:typ|md|bib)$/i, "");
}

export function documentFormat(path: string): DocumentFormat {
  const lowerPath = path.toLowerCase();
  if (lowerPath.endsWith(".md")) return "markdown";
  if (lowerPath.endsWith(".bib")) return "bibliography";
  return "typst";
}

export function relativePath(path: string, vaultPath: string) {
  const normalizedPath = path.replaceAll("\\", "/");
  const normalizedVault = vaultPath.replaceAll("\\", "/").replace(/\/$/, "");
  return normalizedPath.startsWith(`${normalizedVault}/`)
    ? normalizedPath.slice(normalizedVault.length + 1)
    : fileName(path);
}

export function parseOutline(source: string): OutlineHeading[] {
  const headings: OutlineHeading[] = [];
  let offset = 0;

  source.split("\n").forEach((line, index) => {
    const match = /^(=+)\s+(.+?)\s*$/.exec(line) ?? /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (match && match[1].length <= 6) {
      const title = match[2]
        .replace(/<[^>]*>\s*$/, "")
        .replace(/#label\([^)]*\)\s*$/, "")
        .trim();

      if (title) {
        headings.push({
          level: match[1].length,
          title,
          line: index + 1,
          from: offset + match[0].indexOf(match[2]),
        });
      }
    }
    offset += line.length + 1;
  });

  return headings;
}

export function flattenFiles(nodes: TreeNode[]): TreeNode[] {
  return nodes.flatMap((node) => (node.isDir ? flattenFiles(node.children) : [node]));
}

function normalizeRelativeDocumentPath(path: string) {
  const segments: string[] = [];
  for (const segment of path.replaceAll("\\", "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
}

function decodeDocumentTarget(target: string) {
  const path = target.split(/[?#]/, 1)[0].trim();
  if (!path || path.includes("\0")) return "";
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

export function resolveDocumentTarget(
  nodes: TreeNode[],
  target: string,
  activePath: string,
  vaultPath: string,
) {
  const decodedTarget = decodeDocumentTarget(target);
  if (!decodedTarget) return null;

  const unrootedTarget = decodedTarget.replace(/^[/\\]+/, "");
  const targetPath = normalizeRelativeDocumentPath(unrootedTarget);
  if (!targetPath) return null;

  const activeRelative = normalizeRelativeDocumentPath(relativePath(activePath, vaultPath));
  const activeDirectory = activeRelative.includes("/")
    ? activeRelative.slice(0, activeRelative.lastIndexOf("/"))
    : "";
  const candidates = /^[/\\]/.test(decodedTarget)
    ? [targetPath]
    : [normalizeRelativeDocumentPath(`${activeDirectory}/${unrootedTarget}`), targetPath];
  const hasKnownExtension = /\.(?:typ|md|bib)$/i.test(targetPath);
  const candidatePaths = new Set(
    candidates.flatMap((candidate) =>
      hasKnownExtension
        ? [candidate]
        : [candidate, `${candidate}.typ`, `${candidate}.md`, `${candidate}.bib`],
    ),
  );
  const files = flattenFiles(nodes);
  const caseInsensitive = vaultPath.includes("\\");
  const comparable = (value: string) => (caseInsensitive ? value.toLowerCase() : value);
  const indexedFiles = files.map((node) => ({
    node,
    relative: comparable(normalizeRelativeDocumentPath(relativePath(node.path, vaultPath))),
  }));
  for (const candidate of candidatePaths) {
    const exact = indexedFiles.find((file) => file.relative === comparable(candidate));
    if (exact) return exact.node.path;
  }

  const targetStem = fileStem(targetPath);
  const stemMatches = files.filter((node) => comparable(fileStem(node.path)) === comparable(targetStem));
  return stemMatches.length === 1 ? stemMatches[0].path : null;
}

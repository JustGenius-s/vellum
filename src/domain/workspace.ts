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
  svg: string | null;
  diagnostics: CompileDiagnostic[];
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

export interface SavedSession {
  vaultPath: string | null;
  openTabs: string[];
  activeTabPath: string | null;
}

export interface OutlineHeading {
  level: number;
  title: string;
  line: number;
  from: number;
}

export function fileName(path: string) {
  return path.split(/[\\/]/).pop() ?? path;
}

export function fileStem(path: string) {
  return fileName(path).replace(/\.typ$/i, "");
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
    const match = /^(=+)\s+(.+?)\s*$/.exec(line);
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

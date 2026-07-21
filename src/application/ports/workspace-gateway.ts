import type {
  BacklinkIndex,
  CompileSvgResult,
  FontCatalog,
  PackageCatalog,
  RuntimeMode,
  SavedSession,
  SearchMatch,
  TreeNode,
} from "@/domain/workspace";

export interface CompileRequest {
  source: string;
  vaultPath: string;
  mainFile: string;
  latinFont: string;
  cjkFont: string;
}

export interface WorkspaceGateway {
  readonly mode: RuntimeMode;
  chooseVault(): Promise<string | null>;
  listTree(vaultPath: string): Promise<TreeNode[]>;
  readFile(path: string, vaultPath: string): Promise<string>;
  writeFile(path: string, content: string, vaultPath: string): Promise<void>;
  createEntry(path: string, vaultPath: string, isDir: boolean): Promise<void>;
  renameEntry(oldPath: string, newPath: string, vaultPath: string): Promise<void>;
  deleteEntry(path: string, vaultPath: string): Promise<void>;
  search(vaultPath: string, query: string): Promise<SearchMatch[]>;
  indexBacklinks(vaultPath: string): Promise<BacklinkIndex>;
  listFontFamilies(): Promise<FontCatalog>;
  listPackages(): Promise<PackageCatalog>;
  installPackage(spec: string): Promise<PackageCatalog>;
  removePackage(spec: string): Promise<PackageCatalog>;
  clearPackageCache(): Promise<PackageCatalog>;
  compileSvg(request: CompileRequest): Promise<CompileSvgResult>;
  exportPdf(request: CompileRequest, defaultName: string): Promise<void>;
  loadSession(): Promise<SavedSession>;
  saveSession(session: SavedSession): Promise<void>;
}

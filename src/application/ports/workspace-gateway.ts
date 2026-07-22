import type {
  BacklinkIndex,
  CompileProgress,
  CompileSvgResult,
  FontCatalog,
  PackageCatalog,
  PackageDirectories,
  PackageLocation,
  RuntimeMode,
  SavedSession,
  SearchMatch,
  TemplateProjectPlan,
  TemplateProjectResult,
  TemplateThumbnail,
  TreeNode,
} from "@/domain/workspace";
import type {
  DataCatalog,
  DataPreview,
  DataQuery,
  PreparedDataFigure,
} from "@/domain/data";
import type { AiTaskRepository } from "@/application/ports/ai-task-repository";

export interface CompileRequest {
  source: string;
  vaultPath: string;
  mainFile: string;
  latinFont: string;
  cjkFont: string;
  packageCachePath: string | null;
  packageDataPath: string | null;
}

export interface TemplateProjectRequest extends PackageDirectories {
  spec: string;
  location: PackageLocation;
  parentPath: string;
  projectName: string;
}

export interface DataFileRequest {
  path: string;
  vaultPath: string;
}

export interface DataPreviewRequest extends DataFileRequest {
  query: DataQuery;
}

export interface PrepareDataFigureRequest extends DataPreviewRequest {
  title: string | null;
  model: string;
  prompt: string;
  typstSource: string;
}

export interface WorkspaceGateway extends AiTaskRepository {
  readonly mode: RuntimeMode;
  aiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  chooseVault(): Promise<string | null>;
  listTree(vaultPath: string): Promise<TreeNode[]>;
  readFile(path: string, vaultPath: string): Promise<string>;
  writeFile(path: string, content: string, vaultPath: string): Promise<void>;
  createEntry(path: string, vaultPath: string, isDir: boolean): Promise<void>;
  renameEntry(oldPath: string, newPath: string, vaultPath: string): Promise<void>;
  deleteEntry(path: string, vaultPath: string): Promise<void>;
  search(vaultPath: string, query: string): Promise<SearchMatch[]>;
  indexBacklinks(vaultPath: string): Promise<BacklinkIndex>;
  inspectData(request: DataFileRequest): Promise<DataCatalog>;
  previewData(request: DataPreviewRequest): Promise<DataPreview>;
  prepareDataFigure(request: PrepareDataFigureRequest): Promise<PreparedDataFigure>;
  listFontFamilies(): Promise<FontCatalog>;
  choosePackageDirectory(location: PackageLocation): Promise<string | null>;
  listPackages(directories: PackageDirectories): Promise<PackageCatalog>;
  installPackage(spec: string, directories: PackageDirectories): Promise<PackageCatalog>;
  removePackage(
    spec: string,
    location: PackageLocation,
    directories: PackageDirectories,
  ): Promise<PackageCatalog>;
  clearPackageCache(directories: PackageDirectories): Promise<PackageCatalog>;
  chooseTemplateParent(): Promise<string | null>;
  preflightTemplateProject(request: TemplateProjectRequest): Promise<TemplateProjectPlan>;
  createTemplateProject(
    request: TemplateProjectRequest,
    merge: boolean,
  ): Promise<TemplateProjectResult>;
  readTemplateThumbnail(
    spec: string,
    location: PackageLocation,
    directories: PackageDirectories,
  ): Promise<TemplateThumbnail | null>;
  compileSvg(
    request: CompileRequest,
    onProgress: (progress: CompileProgress) => void,
  ): Promise<CompileSvgResult>;
  openExternalUrl(url: string): Promise<void>;
  copyPreviewImage(source: string): Promise<void>;
  downloadPreviewImage(source: string, defaultStem: string): Promise<boolean>;
  exportPdf(request: CompileRequest, defaultName: string): Promise<void>;
  loadSession(): Promise<SavedSession>;
  saveSession(session: SavedSession): Promise<void>;
}

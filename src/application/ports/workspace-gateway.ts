import type { AiTaskRepository } from "@/application/ports/ai-task-repository";
import type {
  DataCatalog,
  DataPreview,
  DataQuery,
  PreparedDataFigure,
} from "@/domain/data";
import type {
  BacklinkIndex,
  CompileIntent,
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

export interface CompileOverlay {
  path: string;
  revision: number;
  content: string;
}

export interface CompileRequest {
  requestId: string;
  intent: CompileIntent;
  vaultPath: string;
  mainFile: string;
  latinFont: string;
  cjkFont: string;
  packageCachePath: string | null;
  packageDataPath: string | null;
  cachedPageIds: string[];
  overlays: CompileOverlay[];
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

export interface RuntimePort {
  readonly mode: RuntimeMode;
}

export interface FilePort {
  chooseVault(): Promise<string | null>;
  listTree(vaultPath: string): Promise<TreeNode[]>;
  readFile(path: string, vaultPath: string): Promise<string>;
  writeFile(path: string, content: string, vaultPath: string): Promise<void>;
  createEntry(path: string, vaultPath: string, isDir: boolean): Promise<void>;
  renameEntry(oldPath: string, newPath: string, vaultPath: string): Promise<void>;
  deleteEntry(path: string, vaultPath: string): Promise<void>;
  search(vaultPath: string, query: string): Promise<SearchMatch[]>;
  indexBacklinks(vaultPath: string): Promise<BacklinkIndex>;
}

export interface CompilePort {
  listFontFamilies(): Promise<FontCatalog>;
  compileSvg(
    request: CompileRequest,
    onProgress: (progress: CompileProgress) => void,
  ): Promise<CompileSvgResult>;
  exportPdf(request: CompileRequest, defaultName: string): Promise<void>;
}

export interface DataPort {
  inspectData(request: DataFileRequest): Promise<DataCatalog>;
  previewData(request: DataPreviewRequest): Promise<DataPreview>;
  prepareDataFigure(request: PrepareDataFigureRequest): Promise<PreparedDataFigure>;
}

export interface PackagePort {
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
}

export interface SessionPort {
  loadSession(): Promise<SavedSession>;
  saveSession(session: SavedSession): Promise<void>;
}

export interface PreviewPort {
  openExternalUrl(url: string): Promise<void>;
  copyPreviewImage(source: string): Promise<void>;
  downloadPreviewImage(source: string, defaultStem: string): Promise<boolean>;
}

export interface AiPort extends AiTaskRepository {
  aiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export type WorkspaceGateway = RuntimePort &
  FilePort &
  CompilePort &
  DataPort &
  PackagePort &
  SessionPort &
  PreviewPort &
  AiPort;

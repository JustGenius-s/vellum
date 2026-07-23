import { emptyDataQuery, type DataCatalog, type DataPreview, type DataQuery } from "@/domain/data";
import type { AiTask } from "@/domain/ai-task";
import type {
  BacklinkIndex,
  CompileDiagnostic,
  DocumentTab,
  FontCatalog,
  PackageCatalog,
  PreviewPage,
  RuntimeMode,
  SearchMatch,
  TreeNode,
} from "@/domain/workspace";

export type SidebarView = string;
export type CompactSurface = "editor" | "preview";
export type CompilePhase = "idle" | "queued" | "compiling" | "ready" | "failed";
export type WorkspacePhase = "booting" | "ready" | "error";

export interface WorkspaceLifecycleState {
  mode: RuntimeMode;
  phase: WorkspacePhase;
  vaultPath: string;
  statusText: string;
  revision: number;
}

export interface DocumentWorkspaceState {
  tree: TreeNode[];
  tabs: DocumentTab[];
  activePath: string;
  backlinks: BacklinkIndex["links"];
  revealLine: number | null;
}

export interface PreviewWorkspaceState {
  previewPages: PreviewPage[];
  diagnostics: CompileDiagnostic[];
  compilePhase: CompilePhase;
  problemsOpen: boolean;
}

export interface WorkbenchState {
  sidebarView: SidebarView;
  compactSurface: CompactSurface;
}

export interface SearchWorkspaceState {
  searchQuery: string;
  searchResults: SearchMatch[];
  searchPending: boolean;
}

export interface SettingsWorkspaceState {
  fontCatalog: FontCatalog;
  latinFont: string;
  cjkFont: string;
  fontsPending: boolean;
  aiBaseUrl: string;
  aiModel: string;
  aiApiKey: string;
}

export interface PackageWorkspaceState {
  packageCatalog: PackageCatalog;
  packagesLoaded: boolean;
  packagesPending: boolean;
  packageMutationPending: boolean;
  packageError: string;
  packageCachePath: string | null;
  packageDataPath: string | null;
}

export interface DataWorkspaceState {
  dataCatalog: DataCatalog | null;
  dataPreview: DataPreview | null;
  dataQuery: DataQuery;
  dataPending: boolean;
  dataError: string;
}

export interface AiWorkspaceState {
  aiTaskPopoverOpen: boolean;
  aiTasks: AiTask[];
  selectedAiTaskId: string | null;
}

export type WorkspaceState = WorkspaceLifecycleState &
  DocumentWorkspaceState &
  PreviewWorkspaceState &
  WorkbenchState &
  SearchWorkspaceState &
  SettingsWorkspaceState &
  PackageWorkspaceState &
  DataWorkspaceState &
  AiWorkspaceState;

export function createWorkspaceState(mode: RuntimeMode): WorkspaceState {
  return {
    mode,
    phase: "booting",
    vaultPath: "",
    tree: [],
    tabs: [],
    activePath: "",
    previewPages: [],
    diagnostics: [],
    backlinks: {},
    compilePhase: "idle",
    statusText: "Starting workspace",
    sidebarView: "files",
    compactSurface: "editor",
    problemsOpen: false,
    searchQuery: "",
    searchResults: [],
    searchPending: false,
    fontCatalog: { latin: [], cjk: [] },
    latinFont: "",
    cjkFont: "",
    fontsPending: true,
    packageCatalog: {
      packages: [],
      cachePath: null,
      dataPath: null,
      cacheSizeBytes: 0,
      dataSizeBytes: 0,
      cacheCount: 0,
      dataCount: 0,
      templateCount: 0,
    },
    packagesLoaded: false,
    packagesPending: false,
    packageMutationPending: false,
    packageError: "",
    packageCachePath: null,
    packageDataPath: null,
    dataCatalog: null,
    dataPreview: null,
    dataQuery: emptyDataQuery(),
    dataPending: false,
    dataError: "",
    aiTaskPopoverOpen: false,
    aiTasks: [],
    selectedAiTaskId: null,
    aiBaseUrl: "https://api.openai.com/v1",
    aiModel: "",
    aiApiKey: "",
    revealLine: null,
    revision: 0,
  };
}

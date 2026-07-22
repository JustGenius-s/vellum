import { emptyDataQuery, type DataCatalog, type DataPreview, type DataQuery } from "@/domain/data";
import type { AiTask } from "@/domain/ai-task";
import type {
  BacklinkIndex,
  CompileDiagnostic,
  CompileProgress,
  DocumentTab,
  FontCatalog,
  PackageCatalog,
  RuntimeMode,
  SearchMatch,
  TreeNode,
} from "@/domain/workspace";

export type SidebarView = "files" | "search" | "outline" | "tasks" | "packages" | "settings";
export type CompactSurface = "editor" | "preview";
export type CompilePhase = "idle" | "queued" | "compiling" | "ready" | "failed";
export type WorkspacePhase = "booting" | "ready" | "error";

export interface WorkspaceState {
  mode: RuntimeMode;
  phase: WorkspacePhase;
  vaultPath: string;
  tree: TreeNode[];
  tabs: DocumentTab[];
  activePath: string;
  previewPages: string[];
  diagnostics: CompileDiagnostic[];
  backlinks: BacklinkIndex["links"];
  compilePhase: CompilePhase;
  compileProgress: CompileProgress | null;
  statusText: string;
  sidebarView: SidebarView;
  compactSurface: CompactSurface;
  problemsOpen: boolean;
  searchQuery: string;
  searchResults: SearchMatch[];
  searchPending: boolean;
  fontCatalog: FontCatalog;
  latinFont: string;
  cjkFont: string;
  fontsPending: boolean;
  packageCatalog: PackageCatalog;
  packagesLoaded: boolean;
  packagesPending: boolean;
  packageMutationPending: boolean;
  packageError: string;
  packageCachePath: string | null;
  packageDataPath: string | null;
  dataCatalog: DataCatalog | null;
  dataPreview: DataPreview | null;
  dataQuery: DataQuery;
  dataPending: boolean;
  dataError: string;
  aiTaskPopoverOpen: boolean;
  aiTasks: AiTask[];
  selectedAiTaskId: string | null;
  aiBaseUrl: string;
  aiModel: string;
  aiApiKey: string;
  revealLine: number | null;
  revision: number;
}

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
    compileProgress: null,
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

import type { WorkspaceGateway } from "@/application/ports/workspace-gateway";
import {
  AiTaskManager,
  type AiTaskExecutionContext,
} from "@/application/ai/ai-task-manager";
import { WorkspaceMutationCoordinator } from "@/application/ai/workspace-mutation-coordinator";
import type {
  AiMessageContentPart,
  AiToolActivity,
  WorkspaceChartToolHandlers,
} from "@/application/ai/typst-chart-generator";
import {
  emptyDataQuery,
  isDataFile,
  type DataCatalog,
  type DataPreview,
  type DataQuery,
  type DatasetDescriptor,
  type PreparedDataFigure,
} from "@/domain/data";
import {
  aiTaskText,
  type AiTask,
  type AiTaskStage,
} from "@/domain/ai-task";
import {
  figureReference,
  insertFigureReference,
  type FigurePlacement,
} from "@/domain/figure";
import {
  documentFormat,
  fileName,
  fileStem,
  flattenFiles,
  parseOutline,
  relativePath,
  resolveDocumentTarget,
  resolveWorkspacePath,
  type BacklinkIndex,
  type CompileDiagnostic,
  type CompileProgress,
  type DocumentTab,
  type FontCatalog,
  type OutlineHeading,
  type PackageCatalog,
  type PackageDirectories,
  type PackageLocation,
  type RuntimeMode,
  type SearchMatch,
  type TemplateProjectPlan,
  type TemplateProjectResult,
  type TemplateThumbnail,
  type TreeNode,
} from "@/domain/workspace";

export type SidebarView = "files" | "search" | "outline" | "tasks" | "packages" | "settings";
export type CompactSurface = "editor" | "preview";
export type CompilePhase = "idle" | "queued" | "compiling" | "ready" | "failed";
export type WorkspacePhase = "booting" | "ready" | "error";
export type AiChartStage =
  | "idle"
  | "analyzing"
  | "generating"
  | "writing"
  | "compiling"
  | "repairing"
  | "inserting"
  | "complete"
  | "cancelled"
  | "failed";

export interface GenerateAiChartOptions {
  request: string;
  contextPaths: string[];
}

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
  dataChartOpen: boolean;
  dataChartTaskId: string | null;
  dataChartSourcePath: string;
  dataChartPending: boolean;
  dataChartStage: AiChartStage;
  dataChartProgress: number;
  dataChartOutput: string;
  dataChartResponse: string;
  dataChartReasoning: string;
  dataChartTools: AiToolActivity[];
  dataChartContent: AiMessageContentPart[];
  dataChartRepairs: number;
  dataChartResult: PreparedDataFigure | null;
  dataError: string;
  aiTasks: AiTask[];
  selectedAiTaskId: string | null;
  aiBaseUrl: string;
  aiModel: string;
  aiApiKey: string;
  revealLine: number | null;
  revision: number;
}

const initialState = (mode: RuntimeMode): WorkspaceState => ({
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
  dataChartOpen: false,
  dataChartTaskId: null,
  dataChartSourcePath: "",
  dataChartPending: false,
  dataChartStage: "idle",
  dataChartProgress: 0,
  dataChartOutput: "",
  dataChartResponse: "",
  dataChartReasoning: "",
  dataChartTools: [],
  dataChartContent: [],
  dataChartRepairs: 0,
  dataChartResult: null,
  dataError: "",
  aiTasks: [],
  selectedAiTaskId: null,
  aiBaseUrl: "https://api.openai.com/v1",
  aiModel: "",
  aiApiKey: "",
  revealLine: null,
  revision: 0,
});

function isSameOrDescendant(candidate: string, parent: string) {
  return (
    candidate === parent ||
    candidate.startsWith(`${parent}/`) ||
    candidate.startsWith(`${parent}\\`)
  );
}

function replacePathPrefix(path: string, oldPath: string, newPath: string) {
  return isSameOrDescendant(path, oldPath) ? `${newPath}${path.slice(oldPath.length)}` : path;
}

function joinPath(parent: string, name: string) {
  const separator = parent.includes("\\") ? "\\" : "/";
  return `${parent.replace(/[\\/]$/, "")}${separator}${name}`;
}

function parentPath(path: string) {
  const normalized = path.replaceAll("\\", "/");
  return normalized.slice(0, normalized.lastIndexOf("/")) || normalized;
}

function isFigureTarget(path: string) {
  return /\.(?:typ|md)$/i.test(path) && !isDataFile(path);
}

function isWorkspaceTextFile(path: string) {
  return /\.(?:typ|md|bib|txt|toml|ya?ml|csv|tsv|jsonl?|ndjson)$/i.test(path);
}

function isBinaryDataFile(path: string) {
  return /\.(?:xlsx|parquet|h5|hdf5|mat|nc|cdf|netcdf)$/i.test(path);
}

function preferredFont(saved: string | null | undefined, available: string[], defaults: string[]) {
  if (saved && (available.length === 0 || available.includes(saved))) return saved;
  return defaults.find((family) => available.includes(family)) ?? available[0] ?? saved ?? "";
}

export class WorkspaceController {
  private readonly gateway: WorkspaceGateway;
  private state: WorkspaceState;
  private readonly listeners = new Set<() => void>();
  private readonly aiTaskManager: AiTaskManager;
  private readonly mutations: WorkspaceMutationCoordinator;
  private compileTimer: number | null = null;
  private sessionTimer: number | null = null;
  private compileToken = 0;
  private aiAbortController: AbortController | null = null;
  private dataChartSourceContext: {
    path: string;
    catalog: DataCatalog;
    preview: DataPreview;
    query: DataQuery;
  } | null = null;
  private readonly cursorOffsets = new Map<string, number>();
  private lastDocumentPath = "";
  private initialized = false;

  constructor(gateway: WorkspaceGateway) {
    this.gateway = gateway;
    this.state = initialState(gateway.mode);
    this.aiTaskManager = new AiTaskManager(gateway, (context) =>
      this.runAiTaskExecution(context),
    );
    this.mutations = new WorkspaceMutationCoordinator({
      read: async (path) => {
        const tab = this.state.tabs.find((candidate) => candidate.path === path);
        if (tab) {
          return {
            content: tab.content,
            exists: true,
            buffered: true,
            dirty: tab.dirty,
          };
        }
        try {
          return {
            content: await this.gateway.readFile(path, this.state.vaultPath),
            exists: true,
            buffered: false,
            dirty: false,
          };
        } catch {
          return { content: "", exists: false, buffered: false, dirty: false };
        }
      },
      write: async (path, content, current) => {
        const tab = this.state.tabs.find((candidate) => candidate.path === path);
        if (tab?.dirty || (current.buffered && current.dirty)) {
          this.update({
            tabs: this.state.tabs.map((candidate) =>
              candidate.path === path ? { ...candidate, content, dirty: true } : candidate,
            ),
          });
          return { saved: false };
        }
        await this.gateway.writeFile(path, content, this.state.vaultPath);
        if (tab) {
          this.update({
            tabs: this.state.tabs.map((candidate) =>
              candidate.path === path ? { ...candidate, content, dirty: false } : candidate,
            ),
          });
        }
        return { saved: true };
      },
    });
    this.aiTaskManager.subscribe(() => this.syncAiTaskState());
  }

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = () => this.state;

  private update(patch: Partial<WorkspaceState>) {
    this.state = { ...this.state, ...patch, revision: this.state.revision + 1 };
    this.listeners.forEach((listener) => listener());
  }

  private setStatus(statusText: string) {
    this.update({ statusText });
  }

  private syncAiTaskState() {
    const tasks = this.aiTaskManager.getSnapshot();
    const task = this.aiTaskManager.selectedTask;
    const assistantMessages = task?.messages.filter((message) => message.role === "assistant") ?? [];
    const lastAssistant = assistantMessages.at(-1);
    const content = lastAssistant?.parts.filter(
      (part): part is AiMessageContentPart =>
        part.type === "text" || part.type === "reasoning" || part.type === "tool",
    ) ?? [];
    const tools = content.flatMap((part) => (part.type === "tool" ? [part.activity] : []));
    this.update({
      aiTasks: tasks,
      selectedAiTaskId: task?.id ?? null,
      dataChartTaskId: task?.id ?? null,
      dataChartSourcePath: task?.source.path ?? "",
      dataChartPending: task?.status === "running" || task?.status === "queued",
      dataChartStage: (task?.stage ?? "idle") as AiChartStage,
      dataChartProgress: task?.progress ?? 0,
      dataChartOutput: task?.generatedSource ?? "",
      dataChartResponse: lastAssistant ? aiTaskText(lastAssistant) : "",
      dataChartReasoning: content
        .flatMap((part) => (part.type === "reasoning" ? [part.text] : []))
        .join("\n"),
      dataChartTools: tools,
      dataChartContent: content,
      dataChartRepairs: task?.repairs ?? 0,
      dataChartResult: task?.result ?? null,
      dataError: task?.error ?? "",
    });
  }

  get activeTab() {
    return this.state.tabs.find((tab) => tab.path === this.state.activePath) ?? null;
  }

  get activeIsData() {
    return Boolean(this.state.activePath && isDataFile(this.state.activePath));
  }

  get preferredFigureTargetPath() {
    return isFigureTarget(this.lastDocumentPath) ? this.lastDocumentPath : "";
  }

  get selectedDataset(): DatasetDescriptor | null {
    return (
      this.state.dataCatalog?.datasets.find(
        (dataset) => dataset.id === this.state.dataQuery.datasetId,
      ) ??
      this.state.dataCatalog?.datasets[0] ??
      null
    );
  }

  get outline(): OutlineHeading[] {
    return parseOutline(this.activeTab?.content ?? "");
  }

  get activeStem() {
    return this.state.activePath ? fileStem(this.state.activePath) : "";
  }

  get activeBacklinks() {
    return this.state.backlinks[this.activeStem] ?? [];
  }

  private get packageDirectories(): PackageDirectories {
    return {
      cachePath: this.state.packageCachePath,
      dataPath: this.state.packageDataPath,
    };
  }

  private rememberActiveDocument() {
    if (isFigureTarget(this.state.activePath)) this.lastDocumentPath = this.state.activePath;
  }

  async initialize() {
    if (this.initialized) return;
    this.initialized = true;

    try {
      const [session, fontCatalog] = await Promise.all([
        this.gateway.loadSession(),
        this.gateway.listFontFamilies().catch(() => ({ latin: [], cjk: [] })),
        this.aiTaskManager.initialize(),
      ]);
      const latinFont = preferredFont(session.latinFont, fontCatalog.latin, [
        "Libertinus Serif",
        "New Computer Modern",
        "Georgia",
      ]);
      const cjkFont = preferredFont(session.cjkFont, fontCatalog.cjk, [
        "Songti SC",
        "Hiragino Sans GB",
        "STHeiti",
        "PingFang SC",
        "Noto Sans CJK SC",
      ]);
      this.update({
        fontCatalog,
        latinFont,
        cjkFont,
        fontsPending: false,
        packageCachePath: session.packageCachePath ?? null,
        packageDataPath: session.packageDataPath ?? null,
        aiBaseUrl: session.aiBaseUrl?.trim() || "https://api.openai.com/v1",
        aiModel: session.aiModel ?? "",
        aiApiKey: session.aiApiKey ?? "",
      });
      if (!session.vaultPath) {
        this.update({ phase: "ready", statusText: "Open a vault to begin" });
        return;
      }
      await this.loadVault(session.vaultPath, session.openTabs, session.activeTabPath);
    } catch (error) {
      this.update({
        phase: "error",
        statusText: `Workspace restore failed: ${String(error)}`,
      });
    }
  }

  async openVault() {
    const selected = await this.gateway.chooseVault();
    if (!selected) return;
    await this.loadVault(selected, [], null);
  }

  private async loadVault(vaultPath: string, openTabs: string[], activeTabPath: string | null) {
    this.aiAbortController?.abort();
    this.dataChartSourceContext = null;
    this.update({
      phase: "booting",
      vaultPath,
      tree: [],
      tabs: [],
      activePath: "",
      previewPages: [],
      diagnostics: [],
      dataCatalog: null,
      dataPreview: null,
      dataQuery: emptyDataQuery(),
      dataPending: false,
      dataChartOpen: false,
      dataChartTaskId: null,
      dataChartSourcePath: "",
      dataChartPending: false,
      dataChartStage: "idle",
      dataChartProgress: 0,
      dataChartOutput: "",
      dataChartResponse: "",
      dataChartReasoning: "",
      dataChartTools: [],
      dataChartContent: [],
      dataChartRepairs: 0,
      dataChartResult: null,
      dataError: "",
      statusText: "Indexing workspace",
    });

    try {
      const [tree, backlinkIndex] = await Promise.all([
        this.gateway.listTree(vaultPath),
        this.gateway.indexBacklinks(vaultPath),
      ]);
      const opened = await Promise.all(
        openTabs.map(async (path) => ({
          path,
          name: fileName(path),
          content: isDataFile(path) ? "" : await this.gateway.readFile(path, vaultPath),
          dirty: false,
        })),
      );
      const activePath =
        opened.find((tab) => tab.path === activeTabPath)?.path ?? opened[0]?.path ?? "";
      this.lastDocumentPath =
        [activePath, ...opened.map((tab) => tab.path)].find((path) => isFigureTarget(path)) ?? "";

      this.update({
        phase: "ready",
        tree,
        backlinks: backlinkIndex.links,
        tabs: opened,
        activePath,
        statusText: opened.length ? "Workspace restored" : "Workspace ready",
      });
      this.scheduleSessionSave();
      if (activePath) await this.compileActive();
    } catch (error) {
      this.update({ phase: "error", statusText: `Could not open workspace: ${String(error)}` });
    }
  }

  async refreshTree() {
    if (!this.state.vaultPath) return;
    try {
      const [tree, backlinkIndex] = await Promise.all([
        this.gateway.listTree(this.state.vaultPath),
        this.gateway.indexBacklinks(this.state.vaultPath),
      ]);
      this.update({ tree, backlinks: backlinkIndex.links });
    } catch (error) {
      this.setStatus(`Refresh failed: ${String(error)}`);
    }
  }

  async openFile(path: string, line?: number) {
    if (path !== this.state.activePath) this.rememberActiveDocument();
    const existing = this.state.tabs.find((tab) => tab.path === path);
    if (existing) {
      this.update({
        activePath: path,
        compactSurface: "editor",
        revealLine: line ?? null,
        statusText: `Opened ${existing.name}`,
      });
      this.scheduleSessionSave();
      await this.compileActive();
      return;
    }

    try {
      const content = isDataFile(path)
        ? ""
        : await this.gateway.readFile(path, this.state.vaultPath);
      const tab: DocumentTab = { path, name: fileName(path), content, dirty: false };
      this.update({
        tabs: [...this.state.tabs, tab],
        activePath: path,
        compactSurface: "editor",
        revealLine: line ?? null,
        statusText: `Opened ${tab.name}`,
      });
      this.scheduleSessionSave();
      await this.compileActive();
    } catch (error) {
      this.setStatus(`Open failed: ${String(error)}`);
    }
  }

  switchTab(path: string) {
    if (path === this.state.activePath) return;
    this.rememberActiveDocument();
    this.update({ activePath: path, revealLine: null });
    this.scheduleSessionSave();
    void this.compileActive();
  }

  closeTab(path: string) {
    const closing = this.state.tabs.find((tab) => tab.path === path);
    if (!closing) return;
    if (closing.dirty && !window.confirm(`Close “${closing.name}” without saving?`)) return;

    const closingIndex = this.state.tabs.findIndex((tab) => tab.path === path);
    const tabs = this.state.tabs.filter((tab) => tab.path !== path);
    const activePath =
      this.state.activePath === path
        ? (tabs[Math.max(0, closingIndex - 1)]?.path ?? tabs[0]?.path ?? "")
        : this.state.activePath;

    this.update({
      tabs,
      activePath,
      previewPages: activePath ? this.state.previewPages : [],
      diagnostics: activePath ? this.state.diagnostics : [],
      statusText: `Closed ${closing.name}`,
    });
    this.scheduleSessionSave();
    if (activePath) void this.compileActive();
  }

  updateSource(content: string) {
    const active = this.activeTab;
    if (!active || isDataFile(active.path) || active.content === content) return;
    const tabs = this.state.tabs.map((tab) =>
      tab.path === active.path ? { ...tab, content, dirty: true } : tab,
    );
    const isBibliography = documentFormat(active.path) === "bibliography";
    this.update({
      tabs,
      compilePhase: isBibliography ? "idle" : "queued",
      compileProgress: isBibliography
        ? null
        : {
            stage: "queued",
            value: 4,
            label: "Waiting to compile",
            detail: fileName(active.path),
          },
      statusText: isBibliography ? "Bibliography changed" : "Draft changed",
    });
    if (!isBibliography) this.scheduleCompile();
  }

  async saveActive() {
    if (!this.state.activePath) return;
    await this.saveFile(this.state.activePath);
  }

  async saveFile(path: string) {
    const tab = this.state.tabs.find((candidate) => candidate.path === path);
    if (!tab) return;
    try {
      await this.gateway.writeFile(path, tab.content, this.state.vaultPath);
      this.update({
        tabs: this.state.tabs.map((candidate) =>
          candidate.path === path ? { ...candidate, dirty: false } : candidate,
        ),
        statusText: `Saved ${tab.name}`,
      });
      await this.refreshBacklinks();
    } catch (error) {
      this.setStatus(`Save failed: ${String(error)}`);
    }
  }

  private scheduleCompile() {
    if (this.compileTimer) window.clearTimeout(this.compileTimer);
    this.compileTimer = window.setTimeout(() => void this.compileActive(), 420);
  }

  private queryForDataset(dataset: DatasetDescriptor): DataQuery {
    const varyingDimensions =
      dataset.kind === "tensor"
        ? dataset.shape.length <= 2
          ? dataset.shape.map((_, index) => index)
          : [dataset.shape.length - 1]
        : [];
    return {
      ...emptyDataQuery(),
      datasetId: dataset.id,
      varyingDimensions,
      fixedDimensions:
        dataset.kind === "tensor"
          ? dataset.shape.flatMap((_, dimension) =>
              varyingDimensions.includes(dimension) ? [] : [{ dimension, index: 0 }],
            )
          : [],
    };
  }

  private async inspectActiveData() {
    const tab = this.activeTab;
    if (!tab || !isDataFile(tab.path) || !this.state.vaultPath) return;
    const token = ++this.compileToken;
    this.update({
      compilePhase: "idle",
      compileProgress: null,
      previewPages: [],
      diagnostics: [],
      problemsOpen: false,
      dataPending: true,
      dataError: "",
      statusText: `Inspecting ${tab.name}`,
    });
    try {
      const catalog = await this.gateway.inspectData({
        path: tab.path,
        vaultPath: this.state.vaultPath,
      });
      if (token !== this.compileToken) return;
      const dataset = catalog.datasets[0];
      if (!dataset) throw new Error("The data file contains no readable datasets");
      const dataQuery = this.queryForDataset(dataset);
      this.update({ dataCatalog: catalog, dataQuery });
      const dataPreview = await this.gateway.previewData({
        path: tab.path,
        vaultPath: this.state.vaultPath,
        query: dataQuery,
      });
      if (token !== this.compileToken) return;
      this.update({
        dataPreview,
        dataPending: false,
        dataError: "",
        statusText: `${catalog.adapter} ready`,
      });
    } catch (error) {
      if (token !== this.compileToken) return;
      this.update({
        dataCatalog: null,
        dataPreview: null,
        dataPending: false,
        dataError: String(error),
        statusText: `Data inspection failed: ${String(error)}`,
      });
    }
  }

  async selectDataset(datasetId: string) {
    const dataset = this.state.dataCatalog?.datasets.find((item) => item.id === datasetId);
    if (!dataset) return;
    await this.loadDataPreview(this.queryForDataset(dataset));
  }

  async setDataVaryingDimension(dimension: number, varying: boolean) {
    const dataset = this.selectedDataset;
    if (!dataset || dataset.kind !== "tensor") return;
    let varyingDimensions = this.state.dataQuery.varyingDimensions.filter(
      (candidate) => candidate !== dimension,
    );
    if (varying) varyingDimensions = [...varyingDimensions, dimension].sort((a, b) => a - b).slice(-2);
    if (varyingDimensions.length === 0) varyingDimensions = [dimension];
    const fixedDimensions = dataset.shape.flatMap((size, candidate) =>
      varyingDimensions.includes(candidate)
        ? []
        : [
            {
              dimension: candidate,
              index: Math.min(
                this.state.dataQuery.fixedDimensions.find(
                  (item) => item.dimension === candidate,
                )?.index ?? 0,
                Math.max(0, size - 1),
              ),
            },
          ],
    );
    await this.loadDataPreview({
      ...this.state.dataQuery,
      offset: 0,
      varyingDimensions,
      fixedDimensions,
    });
  }

  async setDataFixedDimension(dimension: number, index: number) {
    const dataset = this.selectedDataset;
    if (!dataset || dataset.kind !== "tensor") return;
    const size = dataset.shape[dimension] ?? 1;
    const fixedDimensions = [
      ...this.state.dataQuery.fixedDimensions.filter((item) => item.dimension !== dimension),
      { dimension, index: Math.min(Math.max(0, index), Math.max(0, size - 1)) },
    ].sort((left, right) => left.dimension - right.dimension);
    await this.loadDataPreview({ ...this.state.dataQuery, fixedDimensions });
  }

  async setDataPage(offset: number) {
    await this.loadDataPreview({ ...this.state.dataQuery, offset: Math.max(0, offset) });
  }

  async refreshDataPreview() {
    await this.loadDataPreview(this.state.dataQuery);
  }

  openDataChartTask(sourcePath = this.state.activePath) {
    if (
      sourcePath !== this.state.activePath ||
      !isDataFile(sourcePath) ||
      !this.state.dataCatalog ||
      !this.state.dataPreview
    ) {
      return;
    }

    const task = this.aiTaskManager.create({
      kind: "data-figure",
      vaultPath: this.state.vaultPath,
      path: sourcePath,
      query: {
        ...this.state.dataQuery,
        varyingDimensions: [...this.state.dataQuery.varyingDimensions],
        fixedDimensions: this.state.dataQuery.fixedDimensions.map((item) => ({ ...item })),
      },
    });
    this.update({
      dataChartOpen: true,
      dataChartTaskId: task.id,
      dataError: "",
    });
  }

  setDataChartOpen(open: boolean) {
    this.update({ dataChartOpen: open });
  }

  selectAiTask(taskId: string, openPage = false) {
    this.aiTaskManager.select(taskId);
    this.update({ dataChartOpen: !openPage, sidebarView: openPage ? "tasks" : this.state.sidebarView });
  }

  submitAiTask(taskId: string, request: string, contextPaths: string[]) {
    this.aiTaskManager.submit(taskId, request, contextPaths);
  }

  cancelAiTask(taskId: string) {
    this.aiTaskManager.cancel(taskId);
  }

  retryAiTask(taskId: string) {
    this.aiTaskManager.retry(taskId);
  }

  archiveAiTask(taskId: string, archived = true) {
    this.aiTaskManager.archive(taskId, archived);
  }

  private patchAiTask(taskId: string, patch: Partial<AiTask>) {
    this.aiTaskManager.updateTask(taskId, (task) => ({ ...task, ...patch }));
  }

  private async runAiTaskExecution({
    taskId,
    input,
    assistantMessageId,
    signal,
  }: AiTaskExecutionContext) {
    const task = this.aiTaskManager.getTask(taskId);
    if (!task) throw new Error("AI task not found");
    if (!this.state.vaultPath || task.source.vaultPath !== this.state.vaultPath) {
      throw new Error("Open the task's original workspace before resuming it");
    }
    if (!this.state.aiBaseUrl.trim() || !this.state.aiModel.trim()) {
      throw new Error("Configure an OpenAI-compatible model in Settings before running this task");
    }

    const vaultPath = task.source.vaultPath;
    const sourcePath = task.source.path;
    const activeDataPath = relativePath(sourcePath, vaultPath);
    const normalizeForComparison = (path: string) => {
      const normalized = path.replaceAll("\\", "/");
      return vaultPath.includes("\\") ? normalized.toLowerCase() : normalized;
    };
    const resolveExistingToolPath = (requestedPath: string) => {
      const resolved = resolveWorkspacePath(requestedPath, vaultPath);
      const comparable = normalizeForComparison(resolved);
      const file = flattenFiles(this.state.tree).find(
        (candidate) => normalizeForComparison(candidate.path) === comparable,
      );
      if (!file) throw new Error(`Workspace file not found: ${requestedPath}`);
      return file.path;
    };
    const readTextFile = async (path: string) => {
      if (isBinaryDataFile(path)) throw new Error("Use read_data_projection for binary data files");
      if (!isWorkspaceTextFile(path)) {
        throw new Error("Only UTF-8 text project files can be read with this tool");
      }
      return this.mutations.read(path);
    };
    const addFileChange = (
      path: string,
      operation: "created" | "updated" | "inserted",
      saved: boolean,
    ) => {
      this.aiTaskManager.updateTask(taskId, (current) => ({
        ...current,
        fileChanges: [
          ...current.fileChanges,
          {
            id: `change-${crypto.randomUUID()}`,
            path,
            operation,
            saved,
            createdAt: Date.now(),
          },
        ],
      }));
    };

    const sourceCatalog = await this.gateway.inspectData({ path: sourcePath, vaultPath });
    let projectionQuery = structuredClone(task.source.query);
    let preparedFigure = task.result;
    let figureInserted = false;
    const ai = await import("@/application/ai/typst-chart-generator");
    const updateStage = (stage: AiTaskStage, progress: number) =>
      this.patchAiTask(taskId, { stage, progress });
    const handlers: WorkspaceChartToolHandlers = {
      listWorkspaceFiles: async ({ query }) => {
        signal.throwIfAborted();
        const normalizedQuery = query?.trim().toLowerCase() ?? "";
        const files = flattenFiles(this.state.tree)
          .map((file) => relativePath(file.path, vaultPath))
          .filter((path) => !normalizedQuery || path.toLowerCase().includes(normalizedQuery))
          .slice(0, 400);
        updateStage("analyzing", 10);
        return { files, truncated: files.length === 400 };
      },
      readWorkspaceFile: async ({ path }) => {
        signal.throwIfAborted();
        const resolved = resolveExistingToolPath(path);
        const snapshot = await readTextFile(resolved);
        if (snapshot.content.length > 160_000) {
          throw new Error("The requested file is too large for chat context");
        }
        updateStage("analyzing", 18);
        return {
          path: relativePath(resolved, vaultPath),
          content: snapshot.content,
          revision: snapshot.revision,
          buffered: snapshot.buffered,
          dirty: snapshot.dirty,
        };
      },
      readDataProjection: async (request) => {
        signal.throwIfAborted();
        const requested = request.path?.trim() || activeDataPath;
        const path = resolveExistingToolPath(requested);
        if (!isDataFile(path)) throw new Error("Choose a supported data file");
        const sameAsSource = normalizeForComparison(path) === normalizeForComparison(sourcePath);
        const catalog = sameAsSource
          ? sourceCatalog
          : await this.gateway.inspectData({ path, vaultPath });
        const dataset =
          catalog.datasets.find((candidate) => candidate.id === request.datasetId) ??
          (sameAsSource
            ? catalog.datasets.find((candidate) => candidate.id === projectionQuery.datasetId)
            : null) ??
          catalog.datasets[0];
        if (!dataset) throw new Error("The data file contains no readable datasets");
        const baseQuery =
          sameAsSource && dataset.id === projectionQuery.datasetId
            ? projectionQuery
            : this.queryForDataset(dataset);
        const query: DataQuery = {
          ...baseQuery,
          datasetId: dataset.id,
          offset: Math.max(0, Math.floor(request.offset ?? baseQuery.offset)),
          limit: Math.min(400, Math.max(1, Math.floor(request.limit ?? baseQuery.limit))),
          varyingDimensions:
            request.varyingDimensions
              ?.map((value) => Math.max(0, Math.floor(value)))
              .slice(0, 2) ?? baseQuery.varyingDimensions,
          fixedDimensions:
            request.fixedDimensions?.map(({ dimension, index }) => ({
              dimension: Math.max(0, Math.floor(dimension)),
              index: Math.max(0, Math.floor(index)),
            })) ?? baseQuery.fixedDimensions,
          exactStatistics: request.exactStatistics ?? baseQuery.exactStatistics,
        };
        const preview = await this.gateway.previewData({ path, vaultPath, query });
        if (sameAsSource) projectionQuery = query;
        updateStage("analyzing", 26);
        return { path: relativePath(path, vaultPath), catalog, query, preview };
      },
      writeWorkspaceFile: async ({ path, content, expectedRevision }) => {
        signal.throwIfAborted();
        if (content.length > 200_000) throw new Error("The file content is too large");
        const resolved = resolveWorkspacePath(path, vaultPath);
        if (!isWorkspaceTextFile(resolved) || isBinaryDataFile(resolved)) {
          throw new Error("The workspace write tool only supports UTF-8 text files");
        }
        const isFigureRepair =
          preparedFigure &&
          normalizeForComparison(resolved) === normalizeForComparison(preparedFigure.typstPath);
        if (isFigureRepair) ai.validateTypstChartSource(content);
        const result = await this.mutations.write(resolved, content, expectedRevision);
        this.patchAiTask(taskId, {
          stage: isFigureRepair ? "repairing" : "writing",
          progress: isFigureRepair ? 72 : 48,
          generatedSource:
            isFigureRepair ? content : (this.aiTaskManager.getTask(taskId)?.generatedSource ?? ""),
          repairs: isFigureRepair
            ? (this.aiTaskManager.getTask(taskId)?.repairs ?? 0) + 1
            : (this.aiTaskManager.getTask(taskId)?.repairs ?? 0),
        });
        addFileChange(resolved, "updated", result.saved);
        await this.refreshTree();
        return {
          path: relativePath(resolved, vaultPath),
          revision: result.revision,
          characters: result.characters,
          saved: result.saved,
        };
      },
      writeDataFigure: async ({ title, typstSource }) => {
        signal.throwIfAborted();
        const source = ai.extractTypstSource(typstSource);
        ai.validateTypstChartSource(source);
        this.patchAiTask(taskId, { stage: "writing", progress: 44, generatedSource: source });
        preparedFigure = await this.gateway.prepareDataFigure({
          path: sourcePath,
          vaultPath,
          query: projectionQuery,
          model: this.state.aiModel.trim(),
          prompt: input.text,
          title: title?.trim() || fileStem(sourcePath),
          typstSource: source,
        });
        const figure = preparedFigure;
        this.aiTaskManager.updateTask(taskId, (current) => ({
          ...current,
          result: figure,
          artifacts: [
            ...current.artifacts.filter((artifact) => artifact.path !== figure.typstPath),
            {
              id: figure.id,
              kind: "typst-figure",
              label: title?.trim() || fileStem(sourcePath),
              path: figure.typstPath,
              relatedPaths: [figure.dataPath, figure.metadataPath],
              createdAt: Date.now(),
            },
          ],
        }));
        addFileChange(figure.typstPath, "created", true);
        await this.refreshTree();
        return {
          id: figure.id,
          typstPath: relativePath(figure.typstPath, vaultPath),
          dataPath: relativePath(figure.dataPath, vaultPath),
          metadataPath: relativePath(figure.metadataPath, vaultPath),
        };
      },
      compileTypst: async ({ path }) => {
        signal.throwIfAborted();
        const resolved = resolveExistingToolPath(path);
        if (!resolved.toLowerCase().endsWith(".typ")) {
          throw new Error("compile_typst requires a .typ file");
        }
        const source = await readTextFile(resolved);
        updateStage("compiling", 62);
        const result = await this.gateway.compileSvg(
          {
            source: source.content,
            vaultPath,
            mainFile: resolved,
            latinFont: this.state.latinFont,
            cjkFont: this.state.cjkFont,
            packageCachePath: this.state.packageCachePath,
            packageDataPath: this.state.packageDataPath,
          },
          (progress) => {
            if (!signal.aborted) updateStage("compiling", Math.min(84, 62 + Math.round(progress.value * 0.22)));
          },
        );
        const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
        updateStage(errors.length ? "repairing" : "compiling", errors.length ? 70 : 86);
        return { success: errors.length === 0, diagnostics: result.diagnostics };
      },
      insertFigure: async ({ targetPath, placement }) => {
        signal.throwIfAborted();
        if (!preparedFigure) throw new Error("Create the figure bundle before inserting it");
        const resolved = resolveExistingToolPath(targetPath);
        if (!isFigureTarget(resolved)) {
          throw new Error("Figures can only be inserted into Typst or Markdown documents");
        }
        updateStage("inserting", 92);
        await this.mutations.withPaths([resolved], () =>
          this.insertPreparedFigure(preparedFigure!, resolved, placement ?? "cursor", false),
        );
        figureInserted = true;
        addFileChange(resolved, "inserted", false);
        return {
          targetPath: relativePath(resolved, vaultPath),
          placement: placement ?? "cursor",
          saved: false,
        };
      },
    };

    const priorMessages = task.messages
      .filter(
        (message) =>
          message.id !== input.userMessageId &&
          message.id !== assistantMessageId &&
          message.role !== "system",
      )
      .map((message) => ({
        role: message.role as "user" | "assistant",
        text: aiTaskText(message),
      }))
      .filter((message) => message.text);
    const result = await ai.runWorkspaceChartAgent({
      config: {
        baseUrl: this.state.aiBaseUrl,
        model: this.state.aiModel,
        apiKey: this.state.aiApiKey,
      },
      context: {
        activeDataPath,
        contextPaths: input.contextPaths.map((path) => relativePath(path, vaultPath)),
        request: input.text,
        priorMessages,
      },
      handlers,
      abortSignal: signal,
      fetch: (request, init) => this.gateway.aiFetch(request, init),
      onContentUpdate: (content) =>
        this.aiTaskManager.updateAssistant(taskId, assistantMessageId, content),
    });
    signal.throwIfAborted();
    const finalFigure = preparedFigure ?? this.aiTaskManager.getTask(taskId)?.result;
    if (!finalFigure) throw new Error("The AI finished without creating a figure bundle");
    const finalContent: AiMessageContentPart[] = [
      ...result.content,
      {
        id: `artifact-${finalFigure.id}`,
        type: "artifact",
        artifactId: finalFigure.id,
      },
    ];
    this.aiTaskManager.updateAssistant(taskId, assistantMessageId, finalContent);
    this.patchAiTask(taskId, {
      result: finalFigure,
      stage: "complete",
      progress: 100,
      error: "",
    });
    this.setStatus(figureInserted ? "Chart generated and inserted" : "Typst chart generated");
  }

  private async loadDataPreview(query: DataQuery) {
    const tab = this.activeTab;
    if (!tab || !isDataFile(tab.path) || !this.state.vaultPath) return;
    const token = ++this.compileToken;
    this.update({ dataQuery: query, dataPending: true, dataError: "", statusText: "Reading data" });
    try {
      const dataPreview = await this.gateway.previewData({
        path: tab.path,
        vaultPath: this.state.vaultPath,
        query,
      });
      if (token !== this.compileToken) return;
      this.update({ dataPreview, dataPending: false, statusText: "Data preview updated" });
    } catch (error) {
      if (token !== this.compileToken) return;
      this.update({
        dataPending: false,
        dataError: String(error),
        statusText: `Data preview failed: ${String(error)}`,
      });
    }
  }

  async generateDataChart(options: GenerateAiChartOptions): Promise<PreparedDataFigure | null> {
    const selectedTask = this.aiTaskManager.selectedTask;
    if (selectedTask) {
      this.aiTaskManager.submit(selectedTask.id, options.request, options.contextPaths);
      return null;
    }
    const sourceContext = this.dataChartSourceContext;
    const sourcePath = sourceContext?.path ?? "";
    const catalog = sourceContext?.catalog ?? null;
    const preview = sourceContext?.preview ?? null;
    const sourceQuery = sourceContext?.query ?? null;
    if (
      !sourcePath ||
      !isDataFile(sourcePath) ||
      !this.state.vaultPath ||
      !catalog ||
      !preview ||
      !sourceQuery
    ) {
      return null;
    }

    this.aiAbortController?.abort();
    const abortController = new AbortController();
    this.aiAbortController = abortController;
    const activeDataPath = relativePath(sourcePath, this.state.vaultPath);
    const contextPaths = [...new Set(options.contextPaths)]
      .filter((path) => path !== sourcePath)
      .map((path) => relativePath(path, this.state.vaultPath));
    const config = {
      baseUrl: this.state.aiBaseUrl,
      model: this.state.aiModel,
      apiKey: this.state.aiApiKey,
    };
    const aiFetch: typeof globalThis.fetch = (input, init) =>
      this.gateway.aiFetch(input, init);
    let preparedFigure: PreparedDataFigure | null = null;
    let projectionQuery = sourceQuery;
    let figureInserted = false;
    let assistantFrame: number | null = null;
    let reasoningFrame: number | null = null;
    let contentFrame: number | null = null;
    let pendingAssistant = "";
    let pendingReasoning = "";
    let pendingContent: AiMessageContentPart[] = [];

    const publishAssistant = (assistant: string) => {
      pendingAssistant = assistant;
      if (assistantFrame != null) return;
      assistantFrame = window.requestAnimationFrame(() => {
        assistantFrame = null;
        if (this.aiAbortController !== abortController) return;
        this.update({ dataChartResponse: pendingAssistant });
      });
    };

    const publishReasoning = (reasoning: string) => {
      pendingReasoning = reasoning;
      if (reasoningFrame != null) return;
      reasoningFrame = window.requestAnimationFrame(() => {
        reasoningFrame = null;
        if (this.aiAbortController !== abortController) return;
        this.update({ dataChartReasoning: pendingReasoning });
      });
    };

    const publishContent = (content: AiMessageContentPart[]) => {
      pendingContent = content;
      if (contentFrame != null) return;
      contentFrame = window.requestAnimationFrame(() => {
        contentFrame = null;
        if (this.aiAbortController !== abortController) return;
        this.update({ dataChartContent: pendingContent });
      });
    };

    const normalizeForComparison = (path: string) => {
      const normalized = path.replaceAll("\\", "/");
      return this.state.vaultPath.includes("\\") ? normalized.toLowerCase() : normalized;
    };

    const resolveExistingToolPath = (requestedPath: string) => {
      const resolved = resolveWorkspacePath(requestedPath, this.state.vaultPath);
      const comparable = normalizeForComparison(resolved);
      const file = flattenFiles(this.state.tree).find(
        (candidate) => normalizeForComparison(candidate.path) === comparable,
      );
      if (!file) throw new Error(`Workspace file not found: ${requestedPath}`);
      return file.path;
    };

    const readTextFile = async (path: string) => {
      if (isBinaryDataFile(path)) {
        throw new Error("Use read_data_projection for binary data files");
      }
      if (!isWorkspaceTextFile(path)) {
        throw new Error("Only UTF-8 text project files can be read with this tool");
      }
      return (
        this.state.tabs.find((candidate) => candidate.path === path)?.content ??
        (await this.gateway.readFile(path, this.state.vaultPath))
      );
    };

    this.update({
      dataChartPending: true,
      dataChartStage: "analyzing",
      dataChartProgress: 5,
      dataChartOutput: "",
      dataChartResponse: "",
      dataChartReasoning: "",
      dataChartTools: [],
      dataChartContent: [],
      dataChartRepairs: 0,
      dataChartResult: null,
      dataError: "",
      statusText: "AI workspace agent started",
    });

    try {
      const ai = await import("@/application/ai/typst-chart-generator");
      const handlers: WorkspaceChartToolHandlers = {
        listWorkspaceFiles: async ({ query }) => {
          abortController.signal.throwIfAborted();
          const normalizedQuery = query?.trim().toLowerCase() ?? "";
          const files = flattenFiles(this.state.tree)
            .map((file) => relativePath(file.path, this.state.vaultPath))
            .filter((path) => !normalizedQuery || path.toLowerCase().includes(normalizedQuery))
            .slice(0, 400);
          this.update({
            dataChartStage: "analyzing",
            dataChartProgress: 10,
            statusText: "AI listed workspace files",
          });
          return { files, truncated: files.length === 400 };
        },
        readWorkspaceFile: async ({ path }) => {
          abortController.signal.throwIfAborted();
          const resolved = resolveExistingToolPath(path);
          const content = await readTextFile(resolved);
          if (content.length > 160_000) {
            throw new Error("The requested file is too large for chat context");
          }
          this.update({
            dataChartStage: "analyzing",
            dataChartProgress: 18,
            statusText: `AI read ${fileName(resolved)}`,
          });
          return { path: relativePath(resolved, this.state.vaultPath), content };
        },
        readDataProjection: async (input) => {
          abortController.signal.throwIfAborted();
          const requested = input.path?.trim() || activeDataPath;
          const path = resolveExistingToolPath(requested);
          if (!isDataFile(path)) throw new Error("Choose a supported data file");
          const sameAsSource = normalizeForComparison(path) === normalizeForComparison(sourcePath);
          const dataCatalog = sameAsSource
            ? catalog
            : await this.gateway.inspectData({ path, vaultPath: this.state.vaultPath });
          const dataset =
            dataCatalog.datasets.find((candidate) => candidate.id === input.datasetId) ??
            (sameAsSource && !input.datasetId
              ? dataCatalog.datasets.find(
                  (candidate) => candidate.id === sourceQuery.datasetId,
                )
              : null) ??
            dataCatalog.datasets[0];
          if (!dataset) throw new Error("The data file contains no readable datasets");
          const useActiveSlice =
            sameAsSource &&
            !input.datasetId &&
            input.offset == null &&
            input.limit == null &&
            input.varyingDimensions == null &&
            input.fixedDimensions == null &&
            input.exactStatistics == null;
          const baseQuery =
            sameAsSource && dataset.id === sourceQuery.datasetId
              ? sourceQuery
              : this.queryForDataset(dataset);
          const query: DataQuery = {
            ...baseQuery,
            datasetId: dataset.id,
            offset: Math.max(0, Math.floor(input.offset ?? baseQuery.offset)),
            limit: Math.min(400, Math.max(1, Math.floor(input.limit ?? baseQuery.limit))),
            varyingDimensions:
              input.varyingDimensions?.map((value) => Math.max(0, Math.floor(value))).slice(0, 2) ??
              baseQuery.varyingDimensions,
            fixedDimensions:
              input.fixedDimensions?.map(({ dimension, index }) => ({
                dimension: Math.max(0, Math.floor(dimension)),
                index: Math.max(0, Math.floor(index)),
              })) ?? baseQuery.fixedDimensions,
            exactStatistics: input.exactStatistics ?? baseQuery.exactStatistics,
          };
          const dataPreview =
            useActiveSlice && preview
              ? preview
              : await this.gateway.previewData({
                  path,
                  vaultPath: this.state.vaultPath,
                  query,
                });
          if (sameAsSource) projectionQuery = query;
          this.update({
            dataChartStage: "analyzing",
            dataChartProgress: 26,
            statusText: `AI read the ${fileName(path)} projection`,
          });
          return {
            path: relativePath(path, this.state.vaultPath),
            catalog: dataCatalog,
            query,
            preview: dataPreview,
          };
        },
        writeWorkspaceFile: async ({ path, content }) => {
          abortController.signal.throwIfAborted();
          if (content.length > 200_000) throw new Error("The file content is too large");
          const resolved = resolveWorkspacePath(path, this.state.vaultPath);
          if (!isWorkspaceTextFile(resolved) || isBinaryDataFile(resolved)) {
            throw new Error("The workspace write tool only supports UTF-8 text files");
          }
          const isFigureRepair =
            preparedFigure &&
            normalizeForComparison(resolved) === normalizeForComparison(preparedFigure.typstPath);
          if (isFigureRepair) ai.validateTypstChartSource(content);
          await this.gateway.writeFile(resolved, content, this.state.vaultPath);
          const existingTab = this.state.tabs.find((candidate) => candidate.path === resolved);
          if (existingTab) {
            this.update({
              tabs: this.state.tabs.map((candidate) =>
                candidate.path === resolved ? { ...candidate, content, dirty: false } : candidate,
              ),
            });
          }
          if (isFigureRepair) {
            this.update({
              dataChartStage: "repairing",
              dataChartProgress: 72,
              dataChartOutput: content,
              dataChartRepairs: this.state.dataChartRepairs + 1,
              statusText: "AI repaired the Typst figure",
            });
          } else {
            this.update({
              dataChartStage: "writing",
              dataChartProgress: 48,
              statusText: `AI wrote ${fileName(resolved)}`,
            });
          }
          await this.refreshTree();
          return {
            path: relativePath(resolved, this.state.vaultPath),
            characters: content.length,
          };
        },
        writeDataFigure: async ({ title, typstSource }) => {
          abortController.signal.throwIfAborted();
          const source = ai.extractTypstSource(typstSource);
          ai.validateTypstChartSource(source);
          this.update({
            dataChartStage: "writing",
            dataChartProgress: 44,
            dataChartOutput: source,
            statusText: "AI is writing the portable figure bundle",
          });
          preparedFigure = await this.gateway.prepareDataFigure({
            path: sourcePath,
            vaultPath: this.state.vaultPath,
            query: projectionQuery,
            model: this.state.aiModel.trim(),
            prompt: options.request.trim(),
            title: title?.trim() || fileStem(sourcePath),
            typstSource: source,
          });
          await this.refreshTree();
          return {
            id: preparedFigure.id,
            typstPath: relativePath(preparedFigure.typstPath, this.state.vaultPath),
            dataPath: relativePath(preparedFigure.dataPath, this.state.vaultPath),
            metadataPath: relativePath(preparedFigure.metadataPath, this.state.vaultPath),
          };
        },
        compileTypst: async ({ path }) => {
          abortController.signal.throwIfAborted();
          const resolved = resolveExistingToolPath(path);
          if (!resolved.toLowerCase().endsWith(".typ")) {
            throw new Error("compile_typst requires a .typ file");
          }
          const source = await readTextFile(resolved);
          this.update({
            dataChartStage: "compiling",
            dataChartProgress: 62,
            statusText: `Compiling ${fileName(resolved)}`,
          });
          const result = await this.gateway.compileSvg(
            {
              source,
              vaultPath: this.state.vaultPath,
              mainFile: resolved,
              latinFont: this.state.latinFont,
              cjkFont: this.state.cjkFont,
              packageCachePath: this.state.packageCachePath,
              packageDataPath: this.state.packageDataPath,
            },
            (progress) => {
              if (this.aiAbortController !== abortController) return;
              this.update({
                dataChartProgress: Math.min(84, 62 + Math.round(progress.value * 0.22)),
                statusText: progress.label,
              });
            },
          );
          const errors = result.diagnostics.filter(
            (diagnostic) => diagnostic.severity === "error",
          );
          this.update({
            dataChartStage: errors.length ? "repairing" : "compiling",
            dataChartProgress: errors.length ? 70 : 86,
            statusText: errors.length ? "Typst diagnostics returned to the AI" : "Typst compiled",
          });
          return {
            success: errors.length === 0,
            diagnostics: result.diagnostics,
          };
        },
        insertFigure: async ({ targetPath, placement }) => {
          abortController.signal.throwIfAborted();
          if (!preparedFigure) throw new Error("Create the figure bundle before inserting it");
          const resolved = resolveExistingToolPath(targetPath);
          if (!isFigureTarget(resolved)) {
            throw new Error("Figures can only be inserted into Typst or Markdown documents");
          }
          this.update({
            dataChartStage: "inserting",
            dataChartProgress: 92,
            statusText: `Inserting the figure into ${fileName(resolved)}`,
          });
          await this.insertPreparedFigure(preparedFigure, resolved, placement ?? "cursor");
          figureInserted = true;
          return {
            targetPath: relativePath(resolved, this.state.vaultPath),
            placement: placement ?? "cursor",
            saved: false,
          };
        },
      };

      const result = await ai.runWorkspaceChartAgent({
        config,
        context: {
          activeDataPath,
          contextPaths,
          request: options.request,
        },
        handlers,
        abortSignal: abortController.signal,
        fetch: aiFetch,
        onAssistantUpdate: publishAssistant,
        onReasoningUpdate: publishReasoning,
        onToolUpdate: (tools) => this.update({ dataChartTools: tools }),
        onContentUpdate: publishContent,
      });
      abortController.signal.throwIfAborted();
      const finalFigure = preparedFigure as PreparedDataFigure | null;
      if (!finalFigure) {
        throw new Error("The AI finished without creating a figure bundle");
      }
      if (assistantFrame != null) window.cancelAnimationFrame(assistantFrame);
      if (reasoningFrame != null) window.cancelAnimationFrame(reasoningFrame);
      if (contentFrame != null) window.cancelAnimationFrame(contentFrame);
      assistantFrame = null;
      reasoningFrame = null;
      contentFrame = null;
      pendingAssistant = result.assistant;
      pendingReasoning = result.reasoning;
      pendingContent = result.content;
      if (!figureInserted) await this.openFile(finalFigure.typstPath);
      this.update({
        dataChartPending: false,
        dataChartStage: "complete",
        dataChartProgress: 100,
        dataChartResponse: result.assistant,
        dataChartReasoning: result.reasoning,
        dataChartTools: result.tools,
        dataChartContent: result.content,
        dataChartResult: finalFigure,
        statusText: figureInserted ? "Chart generated and inserted" : "Typst chart generated",
      });
      return finalFigure;
    } catch (error) {
      const cancelled = abortController.signal.aborted;
      const draftFigure = preparedFigure as PreparedDataFigure | null;
      this.update({
        dataChartPending: false,
        dataChartStage: cancelled ? "cancelled" : "failed",
        dataError: cancelled
          ? ""
          : `${String(error)}${
              draftFigure ? `\n\nThe editable draft remains at ${draftFigure.typstPath}.` : ""
            }`,
        statusText: cancelled ? "Chart generation cancelled" : `Chart generation failed: ${String(error)}`,
      });
      return null;
    } finally {
      if (assistantFrame != null) window.cancelAnimationFrame(assistantFrame);
      if (reasoningFrame != null) window.cancelAnimationFrame(reasoningFrame);
      if (contentFrame != null) window.cancelAnimationFrame(contentFrame);
      if (this.aiAbortController === abortController) this.aiAbortController = null;
    }
  }

  cancelDataChart() {
    const selectedTask = this.aiTaskManager.selectedTask;
    if (selectedTask) {
      this.aiTaskManager.cancel(selectedTask.id);
      return;
    }
    if (!this.aiAbortController) return;
    this.setStatus("Cancelling chart generation");
    this.aiAbortController.abort();
  }

  recordCursor(path: string, offset: number) {
    if (!isFigureTarget(path)) return;
    this.cursorOffsets.set(path, Math.max(0, offset));
  }

  private async insertPreparedFigure(
    figure: PreparedDataFigure,
    targetPath: string,
    placement: FigurePlacement,
    activate = true,
  ) {
    if (!isFigureTarget(targetPath)) throw new Error("Choose a Typst or Markdown document");
    const existing = this.state.tabs.find((tab) => tab.path === targetPath);
    const content =
      existing?.content ?? (await this.gateway.readFile(targetPath, this.state.vaultPath));
    const reference = figureReference(
      targetPath,
      figure.typstPath,
      figure.id,
    );
    const nextContent = insertFigureReference(
      content,
      reference,
      placement,
      this.cursorOffsets.get(targetPath),
    );
    const nextTab: DocumentTab = {
      path: targetPath,
      name: fileName(targetPath),
      content: nextContent,
      dirty: true,
    };
    const tabs = existing
      ? this.state.tabs.map((candidate) =>
          candidate.path === targetPath ? nextTab : candidate,
        )
      : [...this.state.tabs, nextTab];
    if (activate) this.lastDocumentPath = targetPath;
    this.update({
      tabs,
      activePath: activate ? targetPath : this.state.activePath,
      compactSurface: activate ? "editor" : this.state.compactSurface,
      revealLine: activate ? null : this.state.revealLine,
    });
    this.scheduleSessionSave();
    if (activate) await this.compileActive();
  }

  async compileActive() {
    if (this.compileTimer) {
      window.clearTimeout(this.compileTimer);
      this.compileTimer = null;
    }
    const tab = this.activeTab;
    if (!tab || !this.state.vaultPath) {
      this.update({
        compilePhase: "idle",
        compileProgress: null,
        previewPages: [],
        diagnostics: [],
      });
      return;
    }

    if (isDataFile(tab.path)) {
      await this.inspectActiveData();
      return;
    }

    if (this.state.dataCatalog || this.state.dataPreview || this.state.dataError) {
      this.update({
        dataCatalog: null,
        dataPreview: null,
        dataQuery: emptyDataQuery(),
        dataPending: false,
        dataError: "",
      });
    }

    if (documentFormat(tab.path) === "bibliography") {
      ++this.compileToken;
      this.update({
        compilePhase: "idle",
        compileProgress: null,
        previewPages: [],
        diagnostics: [],
        problemsOpen: false,
        statusText: "Bibliography ready",
      });
      return;
    }

    const token = ++this.compileToken;
    this.update({
      compilePhase: "compiling",
      compileProgress: {
        stage: "preparing",
        value: 8,
        label: "Preparing source",
        detail: fileName(tab.path),
      },
      statusText: "Compiling Typst",
    });
    try {
      const result = await this.gateway.compileSvg(
        {
          source: tab.content,
          vaultPath: this.state.vaultPath,
          mainFile: tab.path,
          latinFont: this.state.latinFont,
          cjkFont: this.state.cjkFont,
          packageCachePath: this.state.packageCachePath,
          packageDataPath: this.state.packageDataPath,
        },
        (compileProgress) => {
          if (token === this.compileToken) this.update({ compileProgress });
        },
      );
      if (token !== this.compileToken) return;

      const errorCount = result.diagnostics.filter((item) => item.severity === "error").length;
      const warningCount = result.diagnostics.length - errorCount;
      const pageCount = result.pages?.length ?? 0;
      this.update({
        previewPages: result.pages ?? this.state.previewPages,
        diagnostics: result.diagnostics,
        compilePhase: errorCount ? "failed" : "ready",
        compileProgress: {
          stage: "complete",
          value: 100,
          label: errorCount
            ? "Compile failed"
            : warningCount
              ? "Preview updated with warnings"
              : "Preview updated",
          detail: errorCount
            ? `${errorCount} error${errorCount === 1 ? "" : "s"}`
            : warningCount
              ? `${warningCount} warning${warningCount === 1 ? "" : "s"}`
              : `${pageCount} page${pageCount === 1 ? "" : "s"}`,
        },
        problemsOpen: errorCount > 0 ? true : this.state.problemsOpen,
        statusText: errorCount
          ? `${errorCount} compile error${errorCount === 1 ? "" : "s"}`
          : warningCount
            ? `${warningCount} compile warning${warningCount === 1 ? "" : "s"}`
            : "Preview is current",
      });
    } catch (error) {
      if (token !== this.compileToken) return;
      this.update({
        compilePhase: "failed",
        compileProgress: {
          stage: "complete",
          value: 100,
          label: "Compile failed",
          detail: String(error),
        },
        problemsOpen: true,
        diagnostics: [
          {
            severity: "error",
            message: String(error),
            line: null,
            column: null,
            path: null,
            hints: [],
          },
        ],
        statusText: `Compile failed: ${String(error)}`,
      });
    }
  }

  async exportPdf() {
    const tab = this.activeTab;
    if (!tab) return;
    if (isDataFile(tab.path)) {
      this.setStatus("Generate or open a Typst chart before exporting PDF");
      return;
    }
    if (documentFormat(tab.path) === "bibliography") {
      this.setStatus("Open a Typst or Markdown document to export PDF");
      return;
    }
    this.setStatus("Preparing PDF");
    try {
      await this.gateway.exportPdf(
        {
          source: tab.content,
          vaultPath: this.state.vaultPath,
          mainFile: tab.path,
          latinFont: this.state.latinFont,
          cjkFont: this.state.cjkFont,
          packageCachePath: this.state.packageCachePath,
          packageDataPath: this.state.packageDataPath,
        },
        `${fileStem(tab.name)}.pdf`,
      );
      this.setStatus("PDF exported");
    } catch (error) {
      this.setStatus(`Export failed: ${String(error)}`);
    }
  }

  async createEntry(parent: string, name: string, isDir: boolean) {
    const lowerName = name.toLowerCase();
    const safeName =
      isDir ||
      /\.(?:typ|md|bib|csv|tsv|json|jsonl|ndjson)$/i.test(lowerName)
        ? name
        : `${name}.typ`;
    const path = joinPath(parent || this.state.vaultPath, safeName);
    try {
      await this.gateway.createEntry(path, this.state.vaultPath, isDir);
      await this.refreshTree();
      this.setStatus(`${isDir ? "Folder" : "Document"} created`);
      if (!isDir) await this.openFile(path);
    } catch (error) {
      this.setStatus(`Create failed: ${String(error)}`);
      throw error;
    }
  }

  async renameEntry(path: string, name: string) {
    const pathMatch = /\.([^.]+)$/i.exec(path);
    const suffix = pathMatch && !/\.[^.]+$/i.test(name) ? `.${pathMatch[1]}` : "";
    const nextPath = joinPath(parentPath(path), `${name}${suffix}`);
    try {
      await this.gateway.renameEntry(path, nextPath, this.state.vaultPath);
      const tabs = this.state.tabs.map((tab) => {
        const nextTabPath = replacePathPrefix(tab.path, path, nextPath);
        return nextTabPath === tab.path
          ? tab
          : { ...tab, path: nextTabPath, name: fileName(nextTabPath) };
      });
      this.update({
        tabs,
        activePath: replacePathPrefix(this.state.activePath, path, nextPath),
        statusText: "Entry renamed",
      });
      await this.refreshTree();
      this.scheduleSessionSave();
      await this.compileActive();
    } catch (error) {
      this.setStatus(`Rename failed: ${String(error)}`);
      throw error;
    }
  }

  async deleteEntry(path: string) {
    if (!window.confirm(`Delete “${fileName(path)}”? This cannot be undone.`)) return;
    try {
      await this.gateway.deleteEntry(path, this.state.vaultPath);
      const tabs = this.state.tabs.filter((tab) => !isSameOrDescendant(tab.path, path));
      const activePath = isSameOrDescendant(this.state.activePath, path)
        ? (tabs[0]?.path ?? "")
        : this.state.activePath;
      this.update({ tabs, activePath, statusText: "Entry deleted" });
      await this.refreshTree();
      this.scheduleSessionSave();
      if (activePath) await this.compileActive();
    } catch (error) {
      this.setStatus(`Delete failed: ${String(error)}`);
    }
  }

  async search(query: string) {
    this.update({ searchQuery: query });
    if (!query.trim() || !this.state.vaultPath) {
      this.update({ searchResults: [], searchPending: false });
      return;
    }
    this.update({ searchPending: true });
    try {
      const searchResults = await this.gateway.search(this.state.vaultPath, query);
      this.update({
        searchResults,
        searchPending: false,
        statusText: `${searchResults.length} matches`,
      });
    } catch (error) {
      this.update({ searchPending: false, statusText: `Search failed: ${String(error)}` });
    }
  }

  async openSearchMatch(match: SearchMatch) {
    await this.openFile(match.path, match.line);
  }

  async openByStem(stem: string) {
    const find = (nodes: TreeNode[]): string | null => {
      for (const node of nodes) {
        if (node.isDir) {
          const nested = find(node.children);
          if (nested) return nested;
        } else if (fileStem(node.path) === stem) return node.path;
      }
      return null;
    };
    const path = find(this.state.tree);
    if (path) await this.openFile(path);
  }

  async openPreviewDocument(target: string) {
    const path = resolveDocumentTarget(
      this.state.tree,
      target,
      this.state.activePath,
      this.state.vaultPath,
    );
    if (!path) {
      this.setStatus(`Preview link target not found: ${target}`);
      return;
    }
    await this.openFile(path);
  }

  async openExternalLink(url: string) {
    const protocol = /^([a-z][a-z\d+.-]*):/i.exec(url.trim())?.[1]?.toLowerCase();
    if (!protocol || !["http", "https", "mailto", "tel"].includes(protocol)) {
      this.rejectPreviewLink(url);
      return;
    }

    try {
      await this.gateway.openExternalUrl(url);
      this.setStatus("Opened external link");
    } catch (error) {
      this.setStatus(`Could not open external link: ${String(error)}`);
    }
  }

  async copyPreviewImage(source: string) {
    try {
      await this.gateway.copyPreviewImage(source);
      this.setStatus("Image copied");
    } catch (error) {
      this.setStatus(`Could not copy image: ${String(error)}`);
    }
  }

  async downloadPreviewImage(source: string) {
    try {
      const defaultStem = `${this.activeStem || "vellum"}-image`;
      const saved = await this.gateway.downloadPreviewImage(source, defaultStem);
      if (saved) this.setStatus("Image downloaded");
    } catch (error) {
      this.setStatus(`Could not download image: ${String(error)}`);
    }
  }

  rejectPreviewLink(url: string) {
    this.setStatus(`Unsupported preview link: ${url}`);
  }

  async openDiagnostic(diagnostic: CompileDiagnostic) {
    if (!diagnostic.path) {
      if (diagnostic.line) this.revealLine(diagnostic.line);
      return;
    }
    const separator = this.state.vaultPath.includes("\\") ? "\\" : "/";
    const normalized = diagnostic.path.replace(/^[/\\]+/, "").replaceAll(/[\\/]/g, separator);
    const path = joinPath(this.state.vaultPath, normalized);
    await this.openFile(path, diagnostic.line ?? undefined);
  }

  revealLine(line: number) {
    this.update({ revealLine: line, compactSurface: "editor" });
  }

  clearRevealLine() {
    if (this.state.revealLine != null) this.update({ revealLine: null });
  }

  async refreshPackages() {
    if (this.state.packagesPending) return;
    this.update({ packagesPending: true, packageError: "" });
    try {
      const packageCatalog = await this.gateway.listPackages(this.packageDirectories);
      this.update({
        packageCatalog,
        packagesLoaded: true,
        packagesPending: false,
        statusText: `${packageCatalog.packages.length} Typst packages available locally`,
      });
    } catch (error) {
      this.update({
        packagesPending: false,
        packageError: String(error),
        statusText: `Package refresh failed: ${String(error)}`,
      });
    }
  }

  async installPackage(spec: string) {
    if (this.state.packageMutationPending) return;
    this.update({ packageMutationPending: true, packageError: "" });
    try {
      const packageCatalog = await this.gateway.installPackage(spec, this.packageDirectories);
      this.update({
        packageCatalog,
        packagesLoaded: true,
        statusText: `Installed ${spec.trim()}`,
      });
    } catch (error) {
      this.update({
        packageError: String(error),
        statusText: `Package install failed: ${String(error)}`,
      });
      throw error;
    } finally {
      this.update({ packageMutationPending: false });
    }
  }

  async removePackage(spec: string, location: PackageLocation) {
    if (this.state.packageMutationPending) return;
    this.update({ packageMutationPending: true, packageError: "" });
    try {
      const packageCatalog = await this.gateway.removePackage(
        spec,
        location,
        this.packageDirectories,
      );
      this.update({ packageCatalog, statusText: `Removed ${spec}` });
    } catch (error) {
      this.update({
        packageError: String(error),
        statusText: `Package removal failed: ${String(error)}`,
      });
      throw error;
    } finally {
      this.update({ packageMutationPending: false });
    }
  }

  async clearPackageCache() {
    if (this.state.packageMutationPending) return;
    this.update({ packageMutationPending: true, packageError: "" });
    try {
      const packageCatalog = await this.gateway.clearPackageCache(this.packageDirectories);
      this.update({ packageCatalog, statusText: "Downloaded packages cleared" });
    } catch (error) {
      this.update({
        packageError: String(error),
        statusText: `Downloaded package clear failed: ${String(error)}`,
      });
      throw error;
    } finally {
      this.update({ packageMutationPending: false });
    }
  }

  async chooseTemplateParent() {
    try {
      return await this.gateway.chooseTemplateParent();
    } catch (error) {
      this.update({
        packageError: String(error),
        statusText: `Could not choose project location: ${String(error)}`,
      });
      return null;
    }
  }

  async preflightTemplateProject(
    spec: string,
    location: PackageLocation,
    parentPath: string,
    projectName: string,
  ): Promise<TemplateProjectPlan> {
    if (this.state.packageMutationPending) throw new Error("Another package operation is running");
    this.update({ packageMutationPending: true, packageError: "" });
    try {
      return await this.gateway.preflightTemplateProject({
        spec,
        location,
        parentPath,
        projectName,
        ...this.packageDirectories,
      });
    } catch (error) {
      this.update({
        packageError: String(error),
        statusText: `Template validation failed: ${String(error)}`,
      });
      throw error;
    } finally {
      this.update({ packageMutationPending: false });
    }
  }

  async createTemplateProject(
    spec: string,
    location: PackageLocation,
    parentPath: string,
    projectName: string,
    merge: boolean,
  ): Promise<TemplateProjectResult> {
    if (this.state.packageMutationPending) throw new Error("Another package operation is running");
    this.update({ packageMutationPending: true, packageError: "" });
    try {
      const result = await this.gateway.createTemplateProject(
        {
          spec,
          location,
          parentPath,
          projectName,
          ...this.packageDirectories,
        },
        merge,
      );
      await this.loadVault(result.destination, [result.entrypoint], result.entrypoint);
      if (this.state.phase !== "ready") {
        throw new Error("The project was created, but Vellum could not open it");
      }
      this.update({
        sidebarView: "files",
        statusText: `Created ${projectName} from ${spec}`,
      });
      return result;
    } catch (error) {
      this.update({
        packageError: String(error),
        statusText: `Template creation failed: ${String(error)}`,
      });
      throw error;
    } finally {
      this.update({ packageMutationPending: false });
    }
  }

  async loadTemplateThumbnail(
    spec: string,
    location: PackageLocation,
  ): Promise<TemplateThumbnail | null> {
    try {
      return await this.gateway.readTemplateThumbnail(spec, location, this.packageDirectories);
    } catch {
      return null;
    }
  }

  clearPackageError() {
    if (this.state.packageError) this.update({ packageError: "" });
  }

  async choosePackageDirectory(location: PackageLocation) {
    try {
      const path = await this.gateway.choosePackageDirectory(location);
      if (path) await this.applyPackageDirectory(location, path);
    } catch (error) {
      this.update({
        packageError: String(error),
        statusText: `Could not choose package directory: ${String(error)}`,
      });
    }
  }

  async resetPackageDirectory(location: PackageLocation) {
    await this.applyPackageDirectory(location, null);
  }

  private async applyPackageDirectory(location: PackageLocation, path: string | null) {
    if (this.state.packageMutationPending) return;
    const directories: PackageDirectories = {
      cachePath: location === "cache" ? path : this.state.packageCachePath,
      dataPath: location === "data" ? path : this.state.packageDataPath,
    };
    this.update({ packageMutationPending: true, packageError: "" });
    try {
      const packageCatalog = await this.gateway.listPackages(directories);
      this.update({
        packageCatalog,
        packagesLoaded: true,
        packageCachePath: directories.cachePath,
        packageDataPath: directories.dataPath,
        statusText: `${location === "cache" ? "Downloaded" : "Local"} package directory updated`,
      });
      this.scheduleSessionSave();
      if (this.activeTab) await this.compileActive();
    } catch (error) {
      this.update({
        packageError: String(error),
        statusText: `Package directory update failed: ${String(error)}`,
      });
    } finally {
      this.update({ packageMutationPending: false });
    }
  }

  setSidebarView(sidebarView: SidebarView) {
    const shouldLoadPackages =
      sidebarView === "packages" && !this.state.packagesLoaded && !this.state.packagesPending;
    this.update({ sidebarView });
    if (shouldLoadPackages) void this.refreshPackages();
  }

  setCompactSurface(compactSurface: CompactSurface) {
    this.update({ compactSurface });
  }

  setProblemsOpen(problemsOpen: boolean) {
    this.update({ problemsOpen });
  }

  setFontPreference(kind: "latin" | "cjk", family: string) {
    const key = kind === "latin" ? "latinFont" : "cjkFont";
    if (this.state[key] === family) return;
    this.update({ [key]: family });
    this.scheduleSessionSave();
    void this.compileActive();
  }

  setAiBaseUrl(aiBaseUrl: string) {
    if (this.state.aiBaseUrl === aiBaseUrl) return;
    this.update({ aiBaseUrl });
    this.scheduleSessionSave();
  }

  setAiModel(aiModel: string) {
    if (this.state.aiModel === aiModel) return;
    this.update({ aiModel });
    this.scheduleSessionSave();
  }

  setAiApiKey(aiApiKey: string) {
    if (this.state.aiApiKey === aiApiKey) return;
    this.update({ aiApiKey });
    this.scheduleSessionSave();
  }

  private async refreshBacklinks() {
    if (!this.state.vaultPath) return;
    try {
      const result = await this.gateway.indexBacklinks(this.state.vaultPath);
      this.update({ backlinks: result.links });
    } catch {
      // Saving should remain successful even if the backlink refresh fails.
    }
  }

  private scheduleSessionSave() {
    if (this.sessionTimer) window.clearTimeout(this.sessionTimer);
    this.sessionTimer = window.setTimeout(() => {
      void this.gateway.saveSession({
        vaultPath: this.state.vaultPath || null,
        openTabs: this.state.tabs.map((tab) => tab.path),
        activeTabPath: this.state.activePath || null,
        latinFont: this.state.latinFont || null,
        cjkFont: this.state.cjkFont || null,
        packageCachePath: this.state.packageCachePath,
        packageDataPath: this.state.packageDataPath,
        aiBaseUrl: this.state.aiBaseUrl.trim() || null,
        aiModel: this.state.aiModel.trim() || null,
        aiApiKey: this.state.aiApiKey || null,
      });
    }, 500);
  }

  activeRelativePath() {
    return this.state.activePath ? relativePath(this.state.activePath, this.state.vaultPath) : "";
  }
}

import type { WorkspaceGateway } from "@/application/ports/workspace-gateway";
import type { Text } from "@codemirror/state";
import { CompileProgressStore } from "@/application/compile-progress-store";
import {
  collectCompileOverlays,
  DocumentBufferStore,
} from "@/application/document-buffer-store";
import { PreviewPageCache } from "@/application/preview-page-cache";
import { WorkspaceContentService } from "@/application/workspace-content-service";
import { WorkspaceFileService } from "@/application/workspace-file-service";
import { WorkspacePackageService } from "@/application/workspace-package-service";
import { WorkspaceAiCoordinator } from "@/application/ai/workspace-ai-coordinator";
import { WorkspaceMutationCoordinator } from "@/application/ai/workspace-mutation-coordinator";
import {
  isFigureTarget,
  isWorkspaceTextFile,
} from "@/application/workspace-file-policy";
import {
  emptyDataQuery,
  isDataFile,
  type DatasetDescriptor,
  type PreparedDataFigure,
} from "@/domain/data";
import {
  figureReference,
  insertFigureReference,
  type FigurePlacement,
} from "@/domain/figure";
import {
  documentFormat,
  fileName,
  fileStem,
  parseOutline,
  relativePath,
  type CompileDiagnostic,
  type DocumentTab,
  type OutlineHeading,
  type PackageLocation,
  type SearchMatch,
  type TemplateProjectPlan,
  type TemplateProjectResult,
  type TemplateThumbnail,
} from "@/domain/workspace";
import {
  createWorkspaceState,
  type CompactSurface,
  type SidebarView,
  type WorkspaceState,
} from "@/application/workspace-state";

export type { CompactSurface, SidebarView, WorkspaceState } from "@/application/workspace-state";

function preferredFont(saved: string | null | undefined, available: string[], defaults: string[]) {
  if (saved && (available.length === 0 || available.includes(saved))) return saved;
  return defaults.find((family) => available.includes(family)) ?? available[0] ?? saved ?? "";
}

export class WorkspaceController {
  private readonly gateway: WorkspaceGateway;
  private state: WorkspaceState;
  private readonly listeners = new Set<() => void>();
  private readonly aiTasks: WorkspaceAiCoordinator;
  private readonly mutations: WorkspaceMutationCoordinator;
  private readonly content: WorkspaceContentService;
  private readonly files: WorkspaceFileService;
  private readonly packages: WorkspacePackageService;
  private sessionTimer: number | null = null;
  private readonly cursorOffsets = new Map<string, number>();
  private lastDocumentPath = "";
  private initialized = false;
  readonly documentBuffers = new DocumentBufferStore();
  readonly compileProgress = new CompileProgressStore();
  private readonly previewPageCache = new PreviewPageCache();

  constructor(gateway: WorkspaceGateway) {
    this.gateway = gateway;
    this.state = createWorkspaceState(gateway.mode);
    this.mutations = new WorkspaceMutationCoordinator({
      read: async (path) => {
        const tab = this.state.tabs.find((candidate) => candidate.path === path);
        if (tab) {
          return {
            content: this.documentBuffers.getString(path),
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
          const revision = this.documentBuffers.replace(path, content);
          this.update({
            tabs: this.state.tabs.map((candidate) =>
              candidate.path === path ? { ...candidate, revision, dirty: true } : candidate,
            ),
          });
          return { saved: false };
        }
        await this.gateway.writeFile(path, content, this.state.vaultPath);
        if (tab) {
          const revision = this.documentBuffers.replace(path, content);
          this.update({
            tabs: this.state.tabs.map((candidate) =>
              candidate.path === path ? { ...candidate, revision, dirty: false } : candidate,
            ),
          });
        }
        return { saved: true };
      },
    });
    this.content = new WorkspaceContentService({
      gateway: this.gateway,
      getState: () => this.state,
      getActiveTab: () => this.activeTab,
      getCompileOverlays: (mainPath) => this.createCompileOverlays(mainPath),
      getCachedPageIds: () => this.previewPageCache.ids(),
      mergePreviewPages: (result) => this.previewPageCache.merge(result.pageOrder, result.changedPages),
      compileProgress: this.compileProgress,
      update: (patch) => this.update(patch),
    });
    this.aiTasks = new WorkspaceAiCoordinator(this.gateway, {
      gateway: this.gateway,
      mutations: this.mutations,
      getState: () => this.state,
      queryForDataset: (dataset) => this.content.queryForDataset(dataset),
      refreshTree: () => this.refreshTree(),
      compileOverlays: (mainPath, mainContent) =>
        this.createCompileOverlays(mainPath, mainContent),
      insertFigure: (figure, path, placement) =>
        this.insertPreparedFigure(figure, path, placement, false),
      setStatus: (status) => this.setStatus(status),
    });
    this.packages = new WorkspacePackageService({
      gateway: this.gateway,
      getState: () => this.state,
      update: (patch) => this.update(patch),
      loadVault: (vaultPath, openTabs, activeTabPath) =>
        this.loadVault(vaultPath, openTabs, activeTabPath),
      scheduleSessionSave: () => this.scheduleSessionSave(),
      compileActive: () => this.compileActive(),
      hasActiveTab: () => Boolean(this.activeTab),
    });
    this.files = new WorkspaceFileService({
      gateway: this.gateway,
      getState: () => this.state,
      update: (patch) => this.update(patch),
      refreshTree: () => this.refreshTree(),
      openFile: (path, line) => this.openFile(path, line),
      scheduleSessionSave: () => this.scheduleSessionSave(),
      compileActive: () => this.compileActive(),
      revealLine: (line) => this.revealLine(line),
      getActiveStem: () => this.activeStem,
      renameBuffers: (path, nextPath) => this.renameBuffers(path, nextPath),
      closeBuffers: (paths) => paths.forEach((path) => this.documentBuffers.close(path)),
    });
    this.aiTasks.subscribe(() => this.syncAiTaskState());
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
    const tasks = this.aiTasks.getSnapshot();
    const task = this.aiTasks.selectedTask;
    this.update({
      aiTasks: tasks,
      selectedAiTaskId: task?.id ?? null,
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
    return parseOutline(this.state.activePath ? this.documentBuffers.getString(this.state.activePath) : "");
  }

  get activeStem() {
    return this.state.activePath ? fileStem(this.state.activePath) : "";
  }

  get activeBacklinks() {
    return this.state.backlinks[this.activeStem] ?? [];
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
        this.aiTasks.initialize(),
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
    this.documentBuffers.clear();
    this.compileProgress.reset();
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
      aiTaskPopoverOpen: false,
      dataError: "",
      statusText: "Indexing workspace",
    });

    try {
      const [tree, backlinkIndex] = await Promise.all([
        this.gateway.listTree(vaultPath),
        this.gateway.indexBacklinks(vaultPath),
      ]);
      const opened = await Promise.all(
        openTabs.map(async (path) => {
          const content = isDataFile(path) ? "" : await this.gateway.readFile(path, vaultPath);
          this.documentBuffers.open(path, content);
          return { path, name: fileName(path), dirty: false, revision: 0 };
        }),
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
      this.documentBuffers.open(path, content);
      const tab: DocumentTab = { path, name: fileName(path), dirty: false, revision: 0 };
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
    this.closeTabs([path]);
  }

  closeTabs(paths: string[]) {
    const requested = new Set(paths);
    const closingTabs = this.state.tabs.filter((tab) => requested.has(tab.path));
    if (!closingTabs.length) return;

    const confirmedTabs = closingTabs.filter(
      (tab) => !tab.dirty || window.confirm(`Close “${tab.name}” without saving?`),
    );
    if (!confirmedTabs.length) return;

    const confirmedPaths = new Set(confirmedTabs.map((tab) => tab.path));
    const activeIndex = this.state.tabs.findIndex((tab) => tab.path === this.state.activePath);
    const activeWasClosed = confirmedPaths.has(this.state.activePath);
    const tabs = this.state.tabs.filter((tab) => !confirmedPaths.has(tab.path));
    const previousTab = this.state.tabs
      .slice(0, Math.max(0, activeIndex))
      .reverse()
      .find((tab) => !confirmedPaths.has(tab.path));
    const activePath = activeWasClosed
      ? (previousTab?.path ?? tabs[0]?.path ?? "")
      : this.state.activePath;
    const statusText =
      confirmedTabs.length === 1
        ? `Closed ${confirmedTabs[0].name}`
        : `Closed ${confirmedTabs.length} tabs`;

    this.update({
      tabs,
      activePath,
      previewPages: activePath ? this.state.previewPages : [],
      diagnostics: activePath ? this.state.diagnostics : [],
      statusText,
    });
    confirmedPaths.forEach((path) => this.documentBuffers.close(path));
    this.scheduleSessionSave();
    if (activeWasClosed && activePath) void this.compileActive();
  }

  updateSource(content: Text | string) {
    const active = this.activeTab;
    if (!active || isDataFile(active.path)) return;
    const revision = this.documentBuffers.replace(active.path, content);
    if (revision === active.revision) return;
    const tabs = this.state.tabs.map((tab) =>
      tab.path === active.path ? { ...tab, revision, dirty: true } : tab,
    );
    const isBibliography = documentFormat(active.path) === "bibliography";
    this.update({
      tabs,
      compilePhase: isBibliography ? "idle" : "queued",
      statusText: isBibliography ? "Bibliography changed" : "Draft changed",
    });
    this.compileProgress.publish(
      isBibliography
        ? { phase: "idle", progress: null }
        : {
            phase: "queued",
            progress: {
              stage: "queued",
              value: 4,
              label: "Waiting to compile",
              detail: fileName(active.path),
            },
          },
      true,
    );
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
      const content = this.documentBuffers.getString(path);
      await this.gateway.writeFile(path, content, this.state.vaultPath);
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
    this.content.scheduleCompile();
  }

  selectDataset(datasetId: string) {
    return this.content.selectDataset(datasetId);
  }

  setDataVaryingDimension(dimension: number, varying: boolean) {
    return this.content.setDataVaryingDimension(dimension, varying);
  }

  setDataFixedDimension(dimension: number, index: number) {
    return this.content.setDataFixedDimension(dimension, index);
  }

  setDataPage(offset: number) {
    return this.content.setDataPage(offset);
  }

  refreshDataPreview() {
    return this.content.refreshDataPreview();
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

    this.aiTasks.create({
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
      aiTaskPopoverOpen: true,
    });
  }

  openWorkspaceAiTask(sourcePath = this.state.activePath, request = "") {
    if (
      !sourcePath ||
      !this.state.vaultPath ||
      isDataFile(sourcePath) ||
      !isWorkspaceTextFile(sourcePath)
    ) {
      return;
    }
    const task = this.aiTasks.create({
      kind: "workspace",
      vaultPath: this.state.vaultPath,
      path: sourcePath,
      diagnostics:
        sourcePath === this.state.activePath ? structuredClone(this.state.diagnostics) : [],
    });
    this.update({ aiTaskPopoverOpen: true });
    if (request.trim()) this.aiTasks.submit(task.id, request, []);
  }

  setAiTaskPopoverOpen(open: boolean) {
    this.update({ aiTaskPopoverOpen: open });
  }

  selectAiTask(taskId: string, openPage = false) {
    this.aiTasks.select(taskId);
    this.update({
      aiTaskPopoverOpen: !openPage,
      sidebarView: openPage ? "tasks" : this.state.sidebarView,
    });
  }

  submitAiTask(taskId: string, request: string, contextPaths: string[]) {
    this.aiTasks.submit(taskId, request, contextPaths);
  }

  cancelAiTask(taskId: string) {
    this.aiTasks.cancel(taskId);
  }

  retryAiTask(taskId: string) {
    this.aiTasks.retry(taskId);
  }

  archiveAiTask(taskId: string, archived = true) {
    this.aiTasks.archive(taskId, archived);
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
    const content = existing
      ? this.documentBuffers.getString(targetPath)
      : await this.gateway.readFile(targetPath, this.state.vaultPath);
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
    if (!existing) this.documentBuffers.open(targetPath, content);
    const revision = this.documentBuffers.replace(targetPath, nextContent);
    const nextTab: DocumentTab = {
      path: targetPath,
      name: fileName(targetPath),
      dirty: true,
      revision,
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

  compileActive() {
    return this.content.compileActive();
  }

  exportPdf() {
    return this.content.exportPdf();
  }

  createEntry(parent: string, name: string, isDir: boolean) {
    return this.files.createEntry(parent, name, isDir);
  }

  renameEntry(path: string, name: string) {
    return this.files.renameEntry(path, name);
  }

  deleteEntry(path: string) {
    return this.files.deleteEntry(path);
  }

  search(query: string) {
    return this.files.search(query);
  }

  openSearchMatch(match: SearchMatch) {
    return this.files.openSearchMatch(match);
  }

  openByStem(stem: string) {
    return this.files.openByStem(stem);
  }

  openPreviewDocument(target: string) {
    return this.files.openPreviewDocument(target);
  }

  openExternalLink(url: string) {
    return this.files.openExternalLink(url);
  }

  copyPreviewImage(source: string) {
    return this.files.copyPreviewImage(source);
  }

  downloadPreviewImage(source: string) {
    return this.files.downloadPreviewImage(source);
  }

  rejectPreviewLink(url: string) {
    this.files.rejectPreviewLink(url);
  }

  openDiagnostic(diagnostic: CompileDiagnostic) {
    return this.files.openDiagnostic(diagnostic);
  }

  revealLine(line: number) {
    this.update({ revealLine: line, compactSurface: "editor" });
  }

  clearRevealLine() {
    if (this.state.revealLine != null) this.update({ revealLine: null });
  }

  refreshPackages() {
    return this.packages.refresh();
  }

  installPackage(spec: string) {
    return this.packages.install(spec);
  }

  removePackage(spec: string, location: PackageLocation) {
    return this.packages.remove(spec, location);
  }

  clearPackageCache() {
    return this.packages.clearCache();
  }

  chooseTemplateParent() {
    return this.packages.chooseTemplateParent();
  }

  preflightTemplateProject(
    spec: string,
    location: PackageLocation,
    parentPath: string,
    projectName: string,
  ): Promise<TemplateProjectPlan> {
    return this.packages.preflightTemplateProject(spec, location, parentPath, projectName);
  }

  createTemplateProject(
    spec: string,
    location: PackageLocation,
    parentPath: string,
    projectName: string,
    merge: boolean,
  ): Promise<TemplateProjectResult> {
    return this.packages.createTemplateProject(spec, location, parentPath, projectName, merge);
  }

  loadTemplateThumbnail(
    spec: string,
    location: PackageLocation,
  ): Promise<TemplateThumbnail | null> {
    return this.packages.loadTemplateThumbnail(spec, location);
  }

  clearPackageError() {
    this.packages.clearError();
  }

  choosePackageDirectory(location: PackageLocation) {
    return this.packages.chooseDirectory(location);
  }

  resetPackageDirectory(location: PackageLocation) {
    return this.packages.resetDirectory(location);
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

  private renameBuffers(path: string, nextPath: string) {
    for (const tab of this.state.tabs) {
      if (tab.path === path || tab.path.startsWith(`${path}/`) || tab.path.startsWith(`${path}\\`)) {
        this.documentBuffers.rename(tab.path, `${nextPath}${tab.path.slice(path.length)}`);
      }
    }
  }

  private createCompileOverlays(mainPath: string, mainContent?: string) {
    return collectCompileOverlays(
      this.state.tabs,
      this.documentBuffers,
      mainPath,
      mainContent,
    );
  }
}

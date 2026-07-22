import type { WorkspaceGateway } from "@/application/ports/workspace-gateway";
import {
  documentFormat,
  fileName,
  fileStem,
  parseOutline,
  relativePath,
  resolveDocumentTarget,
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

export type SidebarView = "files" | "search" | "outline" | "packages" | "settings";
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

function preferredFont(saved: string | null | undefined, available: string[], defaults: string[]) {
  if (saved && (available.length === 0 || available.includes(saved))) return saved;
  return defaults.find((family) => available.includes(family)) ?? available[0] ?? saved ?? "";
}

export class WorkspaceController {
  private readonly gateway: WorkspaceGateway;
  private state: WorkspaceState;
  private readonly listeners = new Set<() => void>();
  private compileTimer: number | null = null;
  private sessionTimer: number | null = null;
  private compileToken = 0;
  private initialized = false;

  constructor(gateway: WorkspaceGateway) {
    this.gateway = gateway;
    this.state = initialState(gateway.mode);
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

  get activeTab() {
    return this.state.tabs.find((tab) => tab.path === this.state.activePath) ?? null;
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

  async initialize() {
    if (this.initialized) return;
    this.initialized = true;

    try {
      const [session, fontCatalog] = await Promise.all([
        this.gateway.loadSession(),
        this.gateway.listFontFamilies().catch(() => ({ latin: [], cjk: [] })),
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
    this.update({
      phase: "booting",
      vaultPath,
      tree: [],
      tabs: [],
      activePath: "",
      previewPages: [],
      diagnostics: [],
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
          content: await this.gateway.readFile(path, vaultPath),
          dirty: false,
        })),
      );
      const activePath =
        opened.find((tab) => tab.path === activeTabPath)?.path ?? opened[0]?.path ?? "";

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
      const content = await this.gateway.readFile(path, this.state.vaultPath);
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
    if (!active || active.content === content) return;
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
      lowerName.endsWith(".typ") ||
      lowerName.endsWith(".md") ||
      lowerName.endsWith(".bib")
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
    const pathMatch = /\.(typ|md|bib)$/i.exec(path);
    const suffix = pathMatch && !/\.(?:typ|md|bib)$/i.test(name) ? `.${pathMatch[1]}` : "";
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
      });
    }, 500);
  }

  activeRelativePath() {
    return this.state.activePath ? relativePath(this.state.activePath, this.state.vaultPath) : "";
  }
}

import type { WorkspaceGateway } from "@/application/ports/workspace-gateway";
import {
  fileName,
  fileStem,
  parseOutline,
  relativePath,
  type BacklinkIndex,
  type CompileDiagnostic,
  type DocumentTab,
  type FontCatalog,
  type OutlineHeading,
  type RuntimeMode,
  type SearchMatch,
  type TreeNode,
} from "@/domain/workspace";

export type SidebarView = "files" | "search" | "outline" | "settings";
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
      this.update({ fontCatalog, latinFont, cjkFont, fontsPending: false });
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
    this.update({ tabs, compilePhase: "queued", statusText: "Draft changed" });
    this.scheduleCompile();
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
      this.update({ compilePhase: "idle", previewPages: [], diagnostics: [] });
      return;
    }

    const token = ++this.compileToken;
    this.update({ compilePhase: "compiling", statusText: "Compiling Typst" });
    try {
      const result = await this.gateway.compileSvg({
        source: tab.content,
        vaultPath: this.state.vaultPath,
        mainFile: tab.path,
        latinFont: this.state.latinFont,
        cjkFont: this.state.cjkFont,
      });
      if (token !== this.compileToken) return;

      const errorCount = result.diagnostics.filter((item) => item.severity === "error").length;
      const warningCount = result.diagnostics.length - errorCount;
      this.update({
        previewPages: result.pages ?? this.state.previewPages,
        diagnostics: result.diagnostics,
        compilePhase: errorCount ? "failed" : "ready",
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
    this.setStatus("Preparing PDF");
    try {
      await this.gateway.exportPdf(
        {
          source: tab.content,
          vaultPath: this.state.vaultPath,
          mainFile: tab.path,
          latinFont: this.state.latinFont,
          cjkFont: this.state.cjkFont,
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
      isDir || lowerName.endsWith(".typ") || lowerName.endsWith(".md") ? name : `${name}.typ`;
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
    const pathMatch = /\.(typ|md)$/i.exec(path);
    const suffix = pathMatch && !/\.(?:typ|md)$/i.test(name) ? `.${pathMatch[1]}` : "";
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

  setSidebarView(sidebarView: SidebarView) {
    this.update({ sidebarView });
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
      });
    }, 500);
  }

  activeRelativePath() {
    return this.state.activePath ? relativePath(this.state.activePath, this.state.vaultPath) : "";
  }
}

import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

export interface TreeNode { name: string; path: string; is_dir: boolean; children: TreeNode[]; }
interface BacklinkIndex { links: Record<string, string[]>; }

export interface CompileDiagnostic {
  severity: "error" | "warning" | string;
  message: string;
  line: number | null;
  column: number | null;
  path: string | null;
  hints: string[];
}

interface CompileSvgResult {
  svg: string | null;
  diagnostics: CompileDiagnostic[];
}

export interface Tab {
  path: string;
  name: string;
  content: string;
  dirty: boolean;
}

interface SavedState {
  vaultPath: string | null;
  openTabs: string[];
  activeTabPath: string | null;
}

export function createVault() {
  let vaultPath = $state("");
  let files = $state<TreeNode[]>([]);
  let tabs = $state<Tab[]>([]);
  let activeTabPath = $state("");
  let svg = $state("");
  let status = $state("");
  let diagnostics = $state<CompileDiagnostic[]>([]);
  let backlinkIndex = $state<Record<string, string[]>>({});

  let compileTimer: ReturnType<typeof setTimeout> | null = null;
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let saveStateTimer: ReturnType<typeof setTimeout> | null = null;
  let skipSave = $state(true);
  let compileToken = 0;

  let source = $derived(tabs.find((t) => t.path === activeTabPath)?.content ?? "");
  let currentFile = $derived(activeTabPath);
  let activeTab = $derived(tabs.find((t) => t.path === activeTabPath));
  let activeTabName = $derived(activeTab?.name || "Vellum");
  let currentStem = $derived(fileStem(activeTabPath));
  let fileNames = $derived(flattenTree(files));

  function fileName(path: string): string {
    return path.split(/[/\\]/).pop() || path;
  }

  function fileStem(path: string): string {
    return fileName(path).replace(/\.typ$/, "");
  }

  function isSameOrDescendant(path: string, parent: string): boolean {
    return path === parent ||
      path.startsWith(`${parent}/`) ||
      path.startsWith(`${parent}\\`);
  }

  function flattenTree(nodes: TreeNode[]): string[] {
    const names: string[] = [];
    function walk(ns: TreeNode[]) {
      for (const n of ns) {
        if (n.is_dir) walk(n.children);
        else if (n.name.endsWith(".typ")) names.push(n.name.replace(/\.typ$/, ""));
      }
    }
    walk(nodes);
    return names;
  }

  function getAppState() {
    return { vaultPath, openTabs: tabs.map((t) => t.path), activeTabPath };
  }

  $effect(() => {
    const state = getAppState();
    if (skipSave) return;
    if (saveStateTimer) clearTimeout(saveStateTimer);
    saveStateTimer = setTimeout(() => {
      void invoke("save_state", { state }).catch((error) => {
        status = `Session save error: ${error}`;
      });
    }, 1500);
  });

  async function loadSavedState(): Promise<void> {
    try {
      const saved = await invoke<SavedState>("load_state");
      if (!saved.vaultPath) return;
      vaultPath = saved.vaultPath;
      await refreshFiles();
      await refreshBacklinkIndex();

      if (saved.openTabs.length > 0) {
        const active = saved.activeTabPath || saved.openTabs[0];
        for (const p of saved.openTabs) {
          if (p !== active) await openFileSilent(p);
        }
        await openFile(active);
      }
    } catch (e) {
      console.error("loadSavedState failed:", e);
      status = `Session restore error: ${e}`;
    } finally {
      skipSave = false;
    }
  }

  async function openFileSilent(path: string) {
    const existing = tabs.find((t) => t.path === path);
    if (existing) return;
    try {
      const content = await invoke<string>("read_file", { path, vaultPath });
      const name = fileName(path);
      tabs = [...tabs, { path, name, content, dirty: false }];
    } catch (e) {
      console.error("openFileSilent failed:", path, e);
    }
  }

  async function openVault() {
    const selected = await open({ directory: true });
    if (selected) {
      vaultPath = selected as string;
      await refreshFiles();
      await refreshBacklinkIndex();
    }
  }

  async function refreshFiles() {
    if (!vaultPath) return;
    try {
      files = await invoke("list_vault_tree", { path: vaultPath });
    } catch (e) {
      console.error("refreshFiles failed:", e);
    }
  }

  async function refreshBacklinkIndex() {
    if (!vaultPath) return;
    try {
      const idx: BacklinkIndex = await invoke("index_backlinks", { vaultPath });
      backlinkIndex = idx.links;
    } catch (e) {
      console.error("refreshBacklinkIndex failed:", e);
    }
  }

  async function openFile(path: string) {
    const existing = tabs.find((t) => t.path === path);
    if (existing) {
      activeTabPath = path;
      await compilePreview();
      return;
    }
    try {
      const content = await invoke<string>("read_file", { path, vaultPath });
      const name = fileName(path);
      tabs = [...tabs, { path, name, content, dirty: false }];
      activeTabPath = path;
      await compilePreview();
    } catch (e) {
      status = `Error: ${e}`;
    }
  }

  async function openByStem(stem: string) {
    const target = findFileByStem(files, stem);
    if (target) await openFile(target);
  }

  function findFileByStem(nodes: TreeNode[], stem: string): string | null {
    for (const n of nodes) {
      if (n.is_dir) {
        const found = findFileByStem(n.children, stem);
        if (found) return found;
      } else if (fileStem(n.path) === stem) {
        return n.path;
      }
    }
    return null;
  }

  function closeTab(path: string) {
    const tab = tabs.find((t) => t.path === path);
    if (tab?.dirty) {
      if (!confirm(`"${tab.name}" has unsaved changes. Close anyway?`)) return;
    }
    const idx = tabs.findIndex((t) => t.path === path);
    tabs = tabs.filter((t) => t.path !== path);
    if (activeTabPath === path) {
      if (tabs.length === 0) {
        activeTabPath = "";
        svg = "";
        diagnostics = [];
      } else {
        const newIdx = Math.max(0, idx - 1);
        activeTabPath = tabs[newIdx].path;
      }
      compilePreview();
    }
  }

  function switchTab(path: string) {
    activeTabPath = path;
    compilePreview();
  }

  async function renamePath(oldPath: string, newPath: string) {
    const affectedTabs = tabs.filter((tab) =>
      isSameOrDescendant(tab.path, oldPath)
    );
    for (const tab of affectedTabs) {
      if (tab.dirty) await saveFile(tab.path);
    }

    await invoke("rename_path", { oldPath, newPath, vaultPath });

    tabs = tabs.map((tab) => {
      if (!isSameOrDescendant(tab.path, oldPath)) return tab;
      const path = `${newPath}${tab.path.slice(oldPath.length)}`;
      return { ...tab, path, name: fileName(path) };
    });
    if (isSameOrDescendant(activeTabPath, oldPath)) {
      activeTabPath = `${newPath}${activeTabPath.slice(oldPath.length)}`;
    }

    await refreshFiles();
    await refreshBacklinkIndex();
    await compilePreview();
    status = "Renamed";
  }

  async function deletePath(path: string) {
    const activeIndex = tabs.findIndex((tab) => tab.path === activeTabPath);
    await invoke("delete_path", { path, vaultPath });

    tabs = tabs.filter((tab) => !isSameOrDescendant(tab.path, path));
    if (isSameOrDescendant(activeTabPath, path)) {
      const nextIndex = Math.min(Math.max(0, activeIndex - 1), tabs.length - 1);
      activeTabPath = tabs[nextIndex]?.path ?? "";
    }
    if (!activeTabPath) {
      svg = "";
      diagnostics = [];
    } else {
      await compilePreview();
    }

    await refreshFiles();
    await refreshBacklinkIndex();
    status = "Deleted";
  }

  async function saveFile(path: string) {
    const tab = tabs.find((t) => t.path === path);
    if (!tab) return;
    try {
      await invoke("write_file", { path, content: tab.content, vaultPath });
      tab.dirty = false;
      tabs = [...tabs];
      status = "Saved";
      await refreshBacklinkIndex();
    } catch (e) {
      status = `Save error: ${e}`;
    }
  }

  function onSourceChange(newValue: string) {
    const tab = tabs.find((t) => t.path === activeTabPath);
    if (!tab) return;
    tab.content = newValue;
    tab.dirty = true;
    tabs = [...tabs];
    status = "Editing...";

    if (compileTimer) clearTimeout(compileTimer);
    compileTimer = setTimeout(compilePreview, 500);

    const pathToSave = activeTabPath;
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(async () => {
      if (pathToSave) await saveFile(pathToSave);
    }, 2000);
  }

  async function compilePreview() {
    if (!source) {
      svg = "";
      diagnostics = [];
      return;
    }
    const token = ++compileToken;
    const src = source;
    const mainFile = currentFile;
    const vp = vaultPath;
    try {
      const result = await invoke<CompileSvgResult>("compile_typst_svg", {
        source: src,
        vaultPath: vp,
        mainFile,
      });
      if (token !== compileToken) return;
      diagnostics = result.diagnostics ?? [];
      if (result.svg) {
        svg = result.svg;
      }
      const errors = diagnostics.filter((d) => d.severity === "error");
      if (errors.length > 0) {
        status = `${errors.length} error${errors.length > 1 ? "s" : ""}`;
      } else if (diagnostics.length > 0) {
        status = `${diagnostics.length} warning${diagnostics.length > 1 ? "s" : ""}`;
      } else {
        status = "OK";
      }
    } catch (e) {
      if (token !== compileToken) return;
      diagnostics = [{
        severity: "error",
        message: String(e),
        line: null,
        column: null,
        path: null,
        hints: [],
      }];
      status = `Error: ${e}`;
    }
  }

  async function exportPDF() {
    if (!source) return;
    try {
      const pdfBytes: number[] = await invoke("compile_typst_pdf", { source, vaultPath, mainFile: currentFile });
      const defaultName = currentStem ? `${currentStem}.pdf` : "output.pdf";
      const filePath = await save({
        defaultPath: defaultName,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (filePath) {
        await writeFile(filePath, new Uint8Array(pdfBytes));
        status = "PDF exported";
      }
    } catch (e) {
      status = `Export error: ${e}`;
    }
  }

  return {
    get vaultPath() { return vaultPath; },
    get files() { return files; },
    get tabs() { return tabs; },
    get activeTabPath() { return activeTabPath; },
    get activeTabName() { return activeTabName; },
    get svg() { return svg; },
    get status() { return status; },
    get diagnostics() { return diagnostics; },
    get source() { return source; },
    get fileNames() { return fileNames; },
    get backlinkIndex() { return backlinkIndex; },
    get hasActiveFile() { return !!activeTabPath; },
    loadSavedState,
    openVault,
    refreshFiles,
    openFile,
    openByStem,
    closeTab,
    switchTab,
    renamePath,
    deletePath,
    saveFile,
    onSourceChange,
    compilePreview,
    exportPDF,
  };
}

export type Vault = ReturnType<typeof createVault>;
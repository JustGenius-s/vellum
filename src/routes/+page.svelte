<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { open, save } from "@tauri-apps/plugin-dialog";
  import { writeFile } from "@tauri-apps/plugin-fs";

  import Platform from "$lib/components/Platform.svelte";
  import EditorPanel from "$lib/components/EditorPanel.svelte";
  import PreviewPanel from "$lib/components/PreviewPanel.svelte";
  import BacklinksPanel from "$lib/components/BacklinksPanel.svelte";

  interface TreeNode { name: string; path: string; is_dir: boolean; children: TreeNode[]; }
  interface BacklinkIndex { links: Record<string, string[]>; }
  interface ZoteroEntry { citekey: string; title: string; authors: string; year: string; }
  interface SearchResult { path: string; stem: string; line: number; snippet: string; }
  interface Tab { path: string; name: string; content: string; dirty: boolean; }
  interface SavedState { vault_path: string | null; open_tabs: string[]; active_tab_path: string | null; }

  let vaultPath = $state("");
  let files = $state<TreeNode[]>([]);
  let tabs = $state<Tab[]>([]);
  let activeTabPath = $state("");
  let currentStem = $state("");
  let svg = $state("");
  let status = $state("");
  let backlinks = $state<string[]>([]);
  let backlinkIndex = $state<Record<string, string[]>>({});
  let searchQuery = $state("");
  let searchResults = $state<SearchResult[]>([]);
  let fileNames = $state<string[]>([]);

  let compileTimer: ReturnType<typeof setTimeout> | null = null;
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let saveStateTimer: ReturnType<typeof setTimeout> | null = null;
  let skipSave = $state(true);

  let source = $derived(tabs.find((t) => t.path === activeTabPath)?.content ?? "");
  let currentFile = $derived(activeTabPath);
  let activeTab = $derived(tabs.find((t) => t.path === activeTabPath));
  let activeTabName = $derived(activeTab?.name || "Vellum");
  let appState = $derived({ vaultPath, openTabs: tabs.map((t) => t.path), activeTabPath });

  async function loadSavedState() {
    const saved = await invoke<SavedState>("load_state");
    if (!saved.vault_path) {
      skipSave = false;
      return;
    }
    vaultPath = saved.vault_path;
    await refreshFiles();
    await refreshBacklinkIndex();

    if (saved.open_tabs && saved.open_tabs.length > 0) {
      const active = saved.active_tab_path || saved.open_tabs[0];
      for (const path of saved.open_tabs) {
        if (path !== active) {
          await openFileSilent(path);
        }
      }
      await openFile(active);
    }
    skipSave = false;
  }

  async function openFileSilent(path: string) {
    const existing = tabs.find((t) => t.path === path);
    if (existing) return;
    try {
      const content = await invoke<string>("read_file", { path });
      const name = path.split("/").pop() || path;
      tabs = [...tabs, { path, name, content, dirty: false }];
    } catch (_) {
      // file may have been deleted since last session
    }
  }

  $effect(() => {
    loadSavedState();
  });

  $effect(() => {
    const state = appState;
    if (skipSave) return;
    if (saveStateTimer) clearTimeout(saveStateTimer);
    saveStateTimer = setTimeout(() => {
      invoke("save_state", { state });
    }, 1500);
  });

  function fileStem(path: string): string {
    return (path.split("/").pop() || path).replace(/\.typ$/, "");
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

  $effect(() => {
    fileNames = flattenTree(files);
  });

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
    files = await invoke("list_vault_tree", { path: vaultPath });
  }

  async function refreshBacklinkIndex() {
    if (!vaultPath) return;
    const idx: BacklinkIndex = await invoke("index_backlinks", { vaultPath });
    backlinkIndex = idx.links;
    updateCurrentBacklinks();
  }

  function updateCurrentBacklinks() {
    backlinks = backlinkIndex[currentStem] || [];
  }

  async function openFile(path: string) {
    const existing = tabs.find((t) => t.path === path);
    if (existing) {
      activeTabPath = path;
      currentStem = fileStem(path);
      updateCurrentBacklinks();
      await compilePreview();
      return;
    }
    const content = await invoke<string>("read_file", { path });
    const name = path.split("/").pop() || path;
    tabs = [...tabs, { path, name, content, dirty: false }];
    activeTabPath = path;
    currentStem = fileStem(path);
    updateCurrentBacklinks();
    await compilePreview();
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

  function closeTab(path: string, e: MouseEvent) {
    e.stopPropagation();
    const tab = tabs.find((t) => t.path === path);
    if (tab?.dirty) {
      if (!confirm(`"${tab.name}" has unsaved changes. Close anyway?`)) return;
    }
    const idx = tabs.findIndex((t) => t.path === path);
    tabs = tabs.filter((t) => t.path !== path);
    if (activeTabPath === path) {
      if (tabs.length === 0) {
        activeTabPath = "";
        currentStem = "";
        svg = "";
      } else {
        const newIdx = Math.max(0, idx - 1);
        activeTabPath = tabs[newIdx].path;
        currentStem = fileStem(activeTabPath);
      }
      updateCurrentBacklinks();
      compilePreview();
    }
  }

  function switchTab(path: string) {
    activeTabPath = path;
    currentStem = fileStem(path);
    updateCurrentBacklinks();
    compilePreview();
  }

  async function saveFile(path: string) {
    const tab = tabs.find((t) => t.path === path);
    if (!tab) return;
    await invoke("write_file", { path, content: tab.content });
    tab.dirty = false;
    tabs = [...tabs];
    status = "Saved";
    await refreshBacklinkIndex();
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

    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(async () => {
      if (activeTabPath) {
        await saveFile(activeTabPath);
      }
    }, 2000);
  }

  async function compilePreview() {
    if (!source) {
      svg = "";
      return;
    }
    try {
      svg = await invoke("compile_typst_svg", { source, vaultPath, mainFile: currentFile });
      status = "OK";
    } catch (e) {
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

  function onSearchInput() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(doSearch, 200);
  }

  async function doSearch() {
    if (!vaultPath || !searchQuery.trim()) { searchResults = []; return; }
    searchResults = await invoke("search_vault", { vaultPath, query: searchQuery });
  }
</script>

<Platform
  {files}
  {vaultPath}
  {tabs}
  {activeTabPath}
  {activeTabName}
  onOpenVault={openVault}
  onOpenFile={openFile}
  onVaultChanged={refreshFiles}
  onSwitchTab={switchTab}
  onCloseTab={closeTab}
  onExportPDF={exportPDF}
>
  {#snippet editorSlot()}
    {#if activeTab}
    <EditorPanel {source} {fileNames} onSourceChange={onSourceChange} />
  {:else}
    <div class="flex items-center justify-center h-full text-base-content/40 text-sm">
      Open a file to start editing
    </div>
  {/if}
{/snippet}

{#snippet previewSlot()}
  <PreviewPanel {svg} />
  {/snippet}

  {#snippet backlinksSlot()}
    <BacklinksPanel {backlinks} {searchQuery} {searchResults} onOpenByStem={openByStem} onOpenFile={openFile} onSearchInput={onSearchInput} />
  {/snippet}
</Platform>

<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { open, save } from "@tauri-apps/plugin-dialog";
  import { writeFile } from "@tauri-apps/plugin-fs";
  import { Menu, FileText, Eye, Link2, Download, X, Circle } from "lucide-svelte";

  import Sidebar from "$lib/components/Sidebar.svelte";
  import EditorPanel from "$lib/components/EditorPanel.svelte";
  import PreviewPanel from "$lib/components/PreviewPanel.svelte";
  import BacklinksPanel from "$lib/components/BacklinksPanel.svelte";

  interface TreeNode { name: string; path: string; is_dir: boolean; children: TreeNode[]; }
  interface BacklinkIndex { links: Record<string, string[]>; }
  interface ZoteroEntry { citekey: string; title: string; authors: string; year: string; }
  interface SearchResult { path: string; stem: string; line: number; snippet: string; }
  interface Tab { path: string; name: string; content: string; dirty: boolean; }

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
  let zoteroOnline = $state(false);
  let zoteroQuery = $state("");
  let zoteroResults = $state<ZoteroEntry[]>([]);
  let zoteroPanelOpen = $state(false);
  let mobileTab = $state<"editor" | "preview" | "links">("editor");
  let fileNames = $state<string[]>([]);

  let compileTimer: ReturnType<typeof setTimeout> | null = null;
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  let zoteroTimer: ReturnType<typeof setTimeout> | null = null;
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

  let source = $derived(tabs.find((t) => t.path === activeTabPath)?.content ?? "");
  let currentFile = $derived(activeTabPath);
  let activeTab = $derived(tabs.find((t) => t.path === activeTabPath));

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
      const drawer = document.getElementById("mobile-drawer") as HTMLInputElement | null;
      if (drawer) drawer.checked = false;
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
      const drawer = document.getElementById("mobile-drawer") as HTMLInputElement | null;
      if (drawer) drawer.checked = false;
      return;
    }
    const content = await invoke<string>("read_file", { path });
    const name = path.split("/").pop() || path;
    tabs = [...tabs, { path, name, content, dirty: false }];
    activeTabPath = path;
    currentStem = fileStem(path);
    updateCurrentBacklinks();
    await compilePreview();
    const drawer = document.getElementById("mobile-drawer") as HTMLInputElement | null;
    if (drawer) drawer.checked = false;
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

  async function saveCurrent() {
    if (activeTabPath) await saveFile(activeTabPath);
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
      svg = await invoke("compile_typst_svg", { source });
      status = "OK";
    } catch (e) {
      status = `Error: ${e}`;
    }
  }

  async function exportPDF() {
    if (!source) return;
    try {
      const pdfBytes: number[] = await invoke("compile_typst_pdf", { source });
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

  async function toggleZotero() {
    zoteroOnline = await invoke("zotero_status");
    zoteroPanelOpen = !zoteroPanelOpen;
  }

  function onZoteroInput() {
    if (zoteroTimer) clearTimeout(zoteroTimer);
    zoteroTimer = setTimeout(doZoteroSearch, 300);
  }

  async function doZoteroSearch() {
    if (!zoteroOnline) return;
    zoteroResults = await invoke("zotero_search", { query: zoteroQuery });
  }

  function insertCitekey(citekey: string) {
    const tab = tabs.find((t) => t.path === activeTabPath);
    if (!tab) return;
    tab.content = tab.content + `@${citekey}`;
    tab.dirty = true;
    tabs = [...tabs];
    zoteroPanelOpen = false;
    if (compileTimer) clearTimeout(compileTimer);
    compileTimer = setTimeout(compilePreview, 500);
  }
</script>

<div class="drawer lg:drawer-open h-screen w-screen bg-base-100 text-base-content">
  <input id="mobile-drawer" type="checkbox" class="drawer-toggle" />

  <div class="drawer-side z-40">
    <label for="mobile-drawer" class="drawer-overlay"></label>
    <div class="w-72 lg:w-56 h-full border-r border-base-300">
      <Sidebar {files} {vaultPath} onOpenVault={openVault} onOpenFile={openFile} onVaultChanged={refreshFiles} />
    </div>
  </div>

  <div class="drawer-content flex flex-col overflow-hidden">
    <!-- Mobile top bar -->
    <div class="lg:hidden flex items-center gap-2 border-b border-base-300 px-2 py-2 shrink-0">
      <label for="mobile-drawer" class="btn btn-ghost btn-sm btn-square">
        <Menu size={18} />
      </label>
      <span class="flex-1 truncate text-sm font-medium">{activeTab?.name || "Vellum"}</span>
      <button class="btn btn-ghost btn-sm btn-square" onclick={exportPDF} title="Export PDF">
        <Download size={16} />
      </button>
    </div>

    <!-- Tab bar (desktop) -->
    {#if tabs.length > 0}
      <div class="hidden lg:flex items-center border-b border-base-300 bg-base-200 shrink-0 overflow-x-auto">
        {#each tabs as tab}
          <div
            class="flex items-center gap-1.5 px-3 py-1.5 text-sm border-r border-base-300 transition-colors cursor-pointer {tab.path === activeTabPath ? 'bg-base-100' : 'hover:bg-base-300'}"
            role="tab"
            tabindex="0"
            onclick={() => switchTab(tab.path)}
            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') switchTab(tab.path); }}
          >
            {#if tab.dirty}
              <Circle size={8} class="fill-current text-warning" />
            {/if}
            <span class="truncate max-w-32">{tab.name}</span>
            <button type="button" class="btn btn-ghost btn-xs btn-circle" onclick={(e) => closeTab(tab.path, e)} aria-label="Close tab">
              <X size={12} />
            </button>
          </div>
        {/each}
        <div class="flex-1"></div>
        <button class="btn btn-ghost btn-sm gap-1 mr-2" onclick={exportPDF} title="Export PDF">
          <Download size={14} />
          PDF
        </button>
      </div>
    {/if}

    <!-- Desktop: 3-column grid -->
    <div class="hidden lg:grid flex-1 grid-cols-[1fr_1fr_220px] overflow-hidden">
      <section class="border-r border-base-300 overflow-hidden">
        {#if activeTab}
          <EditorPanel
            {source} {currentFile} {status} {zoteroOnline} {zoteroPanelOpen} {zoteroQuery} {zoteroResults} {fileNames}
            onSourceChange={onSourceChange} onSave={saveCurrent} onToggleZotero={toggleZotero}
            onZoteroInput={onZoteroInput} onInsertCitekey={insertCitekey}
          />
        {:else}
          <div class="flex items-center justify-center h-full text-base-content/40 text-sm">
            Open a file to start editing
          </div>
        {/if}
      </section>
      <section class="overflow-hidden">
        <PreviewPanel {svg} />
      </section>
      <aside class="border-l border-base-300 overflow-hidden">
        <BacklinksPanel {backlinks} {searchQuery} {searchResults} onOpenByStem={openByStem} onOpenFile={openFile} onSearchInput={onSearchInput} />
      </aside>
    </div>

    <!-- Mobile: tabs -->
    <div class="lg:hidden flex flex-col flex-1 overflow-hidden">
      <div role="tablist" class="tabs tabs-boxed mx-2 mt-2 shrink-0">
        <button role="tab" class="tab {mobileTab === 'editor' ? 'tab-active' : ''}" onclick={() => (mobileTab = 'editor')}>
          <span class="flex items-center gap-1"><FileText size={14} /> Editor</span>
        </button>
        <button role="tab" class="tab {mobileTab === 'preview' ? 'tab-active' : ''}" onclick={() => (mobileTab = 'preview')}>
          <span class="flex items-center gap-1"><Eye size={14} /> Preview</span>
        </button>
        <button role="tab" class="tab {mobileTab === 'links' ? 'tab-active' : ''}" onclick={() => (mobileTab = 'links')}>
          <span class="flex items-center gap-1"><Link2 size={14} /> Links</span>
        </button>
      </div>
      <div class="flex-1 overflow-hidden mt-2">
        {#if mobileTab === 'editor'}
          {#if activeTab}
            <EditorPanel
              {source} {currentFile} {status} {zoteroOnline} {zoteroPanelOpen} {zoteroQuery} {zoteroResults} {fileNames}
              onSourceChange={onSourceChange} onSave={saveCurrent} onToggleZotero={toggleZotero}
              onZoteroInput={onZoteroInput} onInsertCitekey={insertCitekey}
            />
          {:else}
            <div class="flex items-center justify-center h-full text-base-content/40 text-sm">
              Open a file to start editing
            </div>
          {/if}
        {:else if mobileTab === 'preview'}
          <PreviewPanel {svg} />
        {:else}
          <BacklinksPanel {backlinks} {searchQuery} {searchResults} onOpenByStem={openByStem} onOpenFile={openFile} onSearchInput={onSearchInput} />
        {/if}
      </div>
    </div>
  </div>
</div>
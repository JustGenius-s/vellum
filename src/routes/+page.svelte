<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { open } from "@tauri-apps/plugin-dialog";
  import { Menu, FileText, Eye, Link2 } from "lucide-svelte";

  import Sidebar from "$lib/components/Sidebar.svelte";
  import EditorPanel from "$lib/components/EditorPanel.svelte";
  import PreviewPanel from "$lib/components/PreviewPanel.svelte";
  import BacklinksPanel from "$lib/components/BacklinksPanel.svelte";

  interface FileEntry { name: string; path: string; is_dir: boolean; }
  interface TreeNode { name: string; path: string; is_dir: boolean; children: TreeNode[]; }
  interface BacklinkIndex { links: Record<string, string[]>; }
  interface ZoteroEntry { citekey: string; title: string; authors: string; year: string; }
  interface SearchResult { path: string; stem: string; line: number; snippet: string; }

  let vaultPath = $state("");
  let files = $state<TreeNode[]>([]);
  let currentFile = $state("");
  let currentStem = $state("");
  let source = $state("#set page(width: 400pt, margin: 1.5em)\n#set text(size: 12pt)\n\n= Hello Typst\n\nThis is a test.\n\n$E = m c^2$");
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

  function flattenTree(nodes: TreeNode[]): string[] {
    const names: string[] = [];
    function walk(ns: TreeNode[]) {
      for (const n of ns) {
        if (n.is_dir) {
          walk(n.children);
        } else if (n.name.endsWith(".typ")) {
          names.push(n.name.replace(/\.typ$/, ""));
        }
      }
    }
    walk(nodes);
    return names;
  }

  $effect(() => {
    fileNames = flattenTree(files);
  });

  let compileTimer: ReturnType<typeof setTimeout> | null = null;
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  let zoteroTimer: ReturnType<typeof setTimeout> | null = null;

  function fileStem(path: string): string {
    return (path.split("/").pop() || path).replace(/\.typ$/, "");
  }

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
    currentFile = path;
    currentStem = fileStem(path);
    source = await invoke("read_file", { path });
    updateCurrentBacklinks();
    await compilePreview();
    const drawer = document.getElementById("mobile-drawer") as HTMLInputElement | null;
    if (drawer) drawer.checked = false;
  }

  async function openByStem(stem: string) {
    const target = files.find((f) => !f.is_dir && fileStem(f.path) === stem);
    if (target) await openFile(target.path);
  }

  async function saveCurrent() {
    if (!currentFile) return;
    await invoke("write_file", { path: currentFile, content: source });
    status = "Saved";
    await refreshBacklinkIndex();
  }

  async function compilePreview() {
    try {
      svg = await invoke("compile_typst_svg", { source });
      status = "OK";
    } catch (e) {
      status = `Error: ${e}`;
    }
  }

  function onSourceChange(newValue: string) {
    source = newValue;
    if (compileTimer) clearTimeout(compileTimer);
    compileTimer = setTimeout(compilePreview, 500);
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
    source = source + `@${citekey}`;
    zoteroPanelOpen = false;
    if (compileTimer) clearTimeout(compileTimer);
    compileTimer = setTimeout(compilePreview, 500);
  }
</script>

<!-- DaisyUI drawer: mobile sidebar + content -->
<div class="drawer lg:drawer-open h-screen w-screen bg-base-100 text-base-content">
  <input id="mobile-drawer" type="checkbox" class="drawer-toggle" />

  <!-- Sidebar (drawer side) -->
  <div class="drawer-side z-40">
    <label for="mobile-drawer" class="drawer-overlay"></label>
    <div class="w-72 lg:w-56 h-full border-r border-base-300">
      <Sidebar {files} {vaultPath} onOpenVault={openVault} onOpenFile={openFile} onVaultChanged={refreshFiles} />
    </div>
  </div>

  <!-- Main content -->
  <div class="drawer-content flex flex-col overflow-hidden">
    <!-- Mobile top bar -->
    <div class="lg:hidden flex items-center gap-2 border-b border-base-300 px-2 py-2 shrink-0">
      <label for="mobile-drawer" class="btn btn-ghost btn-sm btn-square">
        <Menu size={18} />
      </label>
      <span class="flex-1 truncate text-sm font-medium">{currentFile || "Vellum"}</span>
    </div>

    <!-- Desktop: 3-column grid (editor | preview | backlinks) -->
    <div class="hidden lg:grid flex-1 grid-cols-[1fr_1fr_220px] overflow-hidden">
      <section class="border-r border-base-300 overflow-hidden">
        <EditorPanel
          {source} {currentFile} {status} {zoteroOnline} {zoteroPanelOpen} {zoteroQuery} {zoteroResults} {fileNames}
          onSourceChange={onSourceChange} onSave={saveCurrent} onToggleZotero={toggleZotero}
          onZoteroInput={onZoteroInput} onInsertCitekey={insertCitekey}
        />
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
          <EditorPanel
            {source} {currentFile} {status} {zoteroOnline} {zoteroPanelOpen} {zoteroQuery} {zoteroResults} {fileNames}
            onSourceChange={onSourceChange} onSave={saveCurrent} onToggleZotero={toggleZotero}
            onZoteroInput={onZoteroInput} onInsertCitekey={insertCitekey}
          />
        {:else if mobileTab === 'preview'}
          <PreviewPanel {svg} />
        {:else}
          <BacklinksPanel {backlinks} {searchQuery} {searchResults} onOpenByStem={openByStem} onOpenFile={openFile} onSearchInput={onSearchInput} />
        {/if}
      </div>
    </div>
  </div>
</div>
<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { open } from "@tauri-apps/plugin-dialog";
  import CodeMirror from "./CodeMirror.svelte";

  interface FileEntry {
    name: string;
    path: string;
    is_dir: boolean;
  }

  interface BacklinkIndex {
    links: Record<string, string[]>;
  }

  interface ZoteroEntry {
    citekey: string;
    title: string;
    authors: string;
    year: string;
  }

  interface SearchResult {
    path: string;
    stem: string;
    line: number;
    snippet: string;
  }

  let vaultPath = $state("");
  let files = $state<FileEntry[]>([]);
  let currentFile = $state("");
  let currentStem = $state("");
  let source = $state(
    "#set page(width: 400pt, margin: 1.5em)\n#set text(size: 12pt)\n\n= Hello Typst\n\nThis is a test.\n\n$E = m c^2$"
  );
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

  let compileTimer: ReturnType<typeof setTimeout> | null = null;
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  let zoteroTimer: ReturnType<typeof setTimeout> | null = null;

  function fileStem(path: string): string {
    const parts = path.split("/").pop() || path;
    return parts.replace(/\.typ$/, "");
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
    files = await invoke("list_vault", { path: vaultPath });
  }

  async function refreshBacklinkIndex() {
    if (!vaultPath) return;
    const idx: BacklinkIndex = await invoke("index_backlinks", {
      vaultPath,
    });
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
  }

  async function openByStem(stem: string) {
    const target = files.find(
      (f) => !f.is_dir && fileStem(f.path) === stem
    );
    if (target) {
      await openFile(target.path);
    }
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
    if (!vaultPath || !searchQuery.trim()) {
      searchResults = [];
      return;
    }
    searchResults = await invoke("search_vault", {
      vaultPath,
      query: searchQuery,
    });
  }

  async function checkZotero() {
    zoteroOnline = await invoke("zotero_status");
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

<main class="layout">
  <aside class="sidebar">
    <button onclick={openVault}>Open Vault</button>
    <div class="vault-path">{vaultPath}</div>
    <ul class="file-list">
      {#each files as f}
        <li>
          <button
            class="file-item"
            class:dir={f.is_dir}
            onclick={() => !f.is_dir && openFile(f.path)}
          >
            {f.is_dir ? "📁" : "📄"} {f.name}
          </button>
        </li>
      {/each}
    </ul>
  </aside>

  <section class="editor">
    <div class="toolbar">
      <span class="filename">{currentFile || "untitled"}</span>
      <button onclick={saveCurrent}>Save</button>
      <button onclick={() => { checkZotero(); zoteroPanelOpen = !zoteroPanelOpen; }}>
        {zoteroOnline ? "📚 Zotero" : "📚 Zotero (offline)"}
      </button>
      <span class="status">{status}</span>
    </div>
    {#if zoteroPanelOpen}
      <div class="zotero-panel">
        <input
          class="zotero-search"
          placeholder="Search Zotero library..."
          bind:value={zoteroQuery}
          oninput={onZoteroInput}
        />
        <ul class="zotero-list">
          {#each zoteroResults.slice(0, 20) as z}
            <li>
              <button class="zotero-item" onclick={() => insertCitekey(z.citekey)}>
                <span class="citekey">@{z.citekey}</span>
                <span class="zotero-title">{z.title}</span>
                <span class="zotero-meta">{z.authors} ({z.year})</span>
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
    <CodeMirror value={source} onchange={onSourceChange} />
  </section>

  <section class="preview">
    <div class="toolbar"><span>Preview</span></div>
    <div class="svg-container">
      {#if svg}
        {@html svg}
      {:else}
        <p class="empty">No preview</p>
      {/if}
    </div>
  </section>

  <aside class="backlinks-panel">
    <div class="toolbar"><span>Backlinks</span></div>
    <div class="backlinks-content">
      {#if backlinks.length === 0}
        <p class="empty">No backlinks</p>
      {:else}
        <ul class="backlink-list">
          {#each backlinks as bl}
            <li>
              <button class="backlink-item" onclick={() => openByStem(bl)}>
                {bl}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
    <div class="search-section">
      <input
        class="search-input"
        placeholder="Search vault..."
        bind:value={searchQuery}
        oninput={onSearchInput}
      />
      <ul class="search-list">
        {#each searchResults.slice(0, 30) as r}
          <li>
            <button class="search-item" onclick={() => openFile(r.path)}>
              <span class="search-stem">{r.stem}:{r.line}</span>
              <span class="search-snippet">{r.snippet}</span>
            </button>
          </li>
        {/each}
      </ul>
    </div>
  </aside>
</main>

<style>
  .layout {
    display: grid;
    grid-template-columns: 220px 1fr 1fr 200px;
    height: 100vh;
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .sidebar,
  .backlinks-panel {
    overflow-y: auto;
    background: #fafafa;
  }
  .sidebar {
    border-right: 1px solid #ddd;
    padding: 0.5rem;
  }
  .backlinks-panel {
    border-left: 1px solid #ddd;
    display: flex;
    flex-direction: column;
  }
  .backlinks-content {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }
  .search-section {
    border-top: 1px solid #ddd;
    padding: 0.5rem;
    max-height: 40%;
    display: flex;
    flex-direction: column;
  }
  .search-input {
    width: 100%;
    padding: 0.3rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 0.8rem;
    margin-bottom: 0.5rem;
    box-sizing: border-box;
  }
  .search-list {
    list-style: none;
    padding: 0;
    margin: 0;
    overflow-y: auto;
    flex: 1;
  }
  .search-item {
    display: flex;
    flex-direction: column;
    width: 100%;
    text-align: left;
    border: none;
    background: none;
    padding: 0.25rem 0.5rem;
    cursor: pointer;
    border-radius: 4px;
    gap: 2px;
  }
  .search-item:hover {
    background: #e8e8e8;
  }
  .search-stem {
    font-size: 0.75rem;
    color: #396cd8;
    font-weight: 600;
  }
  .search-snippet {
    font-size: 0.75rem;
    color: #555;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .zotero-panel {
    border-bottom: 1px solid #ddd;
    padding: 0.5rem;
    background: #f9f9f9;
    max-height: 300px;
    overflow-y: auto;
  }
  .zotero-search {
    width: 100%;
    padding: 0.3rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 0.8rem;
    margin-bottom: 0.5rem;
    box-sizing: border-box;
  }
  .zotero-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .zotero-item {
    display: flex;
    flex-direction: column;
    width: 100%;
    text-align: left;
    border: none;
    background: none;
    padding: 0.3rem;
    cursor: pointer;
    border-radius: 4px;
    gap: 2px;
  }
  .zotero-item:hover {
    background: #e8e8e8;
  }
  .citekey {
    font-family: monospace;
    font-size: 0.8rem;
    color: #c0392b;
    font-weight: 600;
  }
  .zotero-title {
    font-size: 0.8rem;
    color: #333;
  }
  .zotero-meta {
    font-size: 0.7rem;
    color: #888;
  }
  .backlink-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .backlink-item {
    display: block;
    width: 100%;
    text-align: left;
    border: none;
    background: none;
    padding: 0.25rem 0.5rem;
    cursor: pointer;
    border-radius: 4px;
    font-size: 0.85rem;
    color: #396cd8;
  }
  .backlink-item:hover {
    background: #e8e8e8;
    text-decoration: underline;
  }
  .vault-path {
    font-size: 0.75rem;
    color: #666;
    margin: 0.5rem 0;
    word-break: break-all;
  }
  .file-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .file-item {
    display: block;
    width: 100%;
    text-align: left;
    border: none;
    background: none;
    padding: 0.25rem 0.5rem;
    cursor: pointer;
    border-radius: 4px;
    font-size: 0.85rem;
  }
  .file-item:hover {
    background: #e8e8e8;
  }
  .editor,
  .preview {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .editor {
    border-right: 1px solid #ddd;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    border-bottom: 1px solid #ddd;
    background: #f5f5f5;
    font-size: 0.85rem;
    flex-shrink: 0;
  }
  .filename {
    flex: 1;
    color: #333;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .status {
    color: #666;
    font-size: 0.75rem;
  }
  .svg-container {
    flex: 1;
    overflow: auto;
    padding: 1rem;
    background: #fff;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .svg-container :global(svg) {
    width: 100%;
    max-width: 800px;
    height: auto;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
  .empty {
    color: #999;
    text-align: center;
    padding: 2rem;
    font-size: 0.85rem;
  }
  button {
    padding: 0.3em 0.8em;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
    font-size: 0.85rem;
  }
  button:hover {
    border-color: #396cd8;
  }
  @media (prefers-color-scheme: dark) {
    .layout {
      background: #1e1e1e;
      color: #ddd;
    }
    .sidebar,
    .backlinks-panel {
      background: #252526;
      border-color: #3c3c3c;
    }
    .file-item:hover,
    .backlink-item:hover {
      background: #2a2a2a;
    }
    .toolbar {
      background: #2d2d2d;
      border-color: #3c3c3c;
    }
    .editor {
      border-color: #3c3c3c;
    }
    .svg-container {
      background: #1e1e1e;
    }
    button {
      background: #3c3c3c;
      color: #ddd;
      border-color: #555;
    }
    .backlink-item {
      color: #6ba4e8;
    }
    .search-input,
    .zotero-search {
      background: #1a1a1a;
      color: #ddd;
      border-color: #555;
    }
    .search-item:hover,
    .zotero-item:hover {
      background: #2a2a2a;
    }
    .search-stem {
      color: #6ba4e8;
    }
    .search-snippet {
      color: #aaa;
    }
    .citekey {
      color: #e74c3c;
    }
    .zotero-title {
      color: #ddd;
    }
    .zotero-meta {
      color: #888;
    }
    .zotero-panel {
      background: #252526;
      border-color: #3c3c3c;
    }
    .search-section {
      border-color: #3c3c3c;
    }
  }
</style>
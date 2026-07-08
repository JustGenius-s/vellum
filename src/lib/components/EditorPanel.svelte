<script lang="ts">
  import CodeMirror from "$lib/components/CodeMirror.svelte";
  import { Save, BookOpen } from "lucide-svelte";

  let {
    source = "",
    currentFile = "",
    status = "",
    zoteroOnline = false,
    zoteroPanelOpen = false,
    zoteroQuery = "",
    zoteroResults = [],
    fileNames = [],
    onSourceChange = () => {},
    onSave = () => {},
    onToggleZotero = () => {},
    onZoteroInput = () => {},
    onInsertCitekey = () => {},
  }: {
    source: string;
    currentFile: string;
    status: string;
    zoteroOnline: boolean;
    zoteroPanelOpen: boolean;
    zoteroQuery: string;
    zoteroResults: { citekey: string; title: string; authors: string; year: string }[];
    fileNames: string[];
    onSourceChange: (v: string) => void;
    onSave: () => void;
    onToggleZotero: () => void;
    onZoteroInput: () => void;
    onInsertCitekey: (k: string) => void;
  } = $props();
</script>

<div class="flex flex-col h-full overflow-hidden">
  <div class="flex items-center gap-2 border-b border-base-300 bg-base-200/50 px-3 py-2">
    <span class="flex-1 truncate text-sm text-base-content/60">
      {currentFile || "untitled"}
    </span>
    <button class="btn btn-outline btn-sm" onclick={onSave}>
      <Save size={14} />
      <span class="hidden sm:inline">Save</span>
    </button>
    <button
      class="btn btn-sm {zoteroOnline ? 'btn-secondary' : 'btn-outline'}"
      onclick={onToggleZotero}
    >
      <BookOpen size={14} />
      <span class="hidden sm:inline">Zotero</span>
    </button>
    <span class="text-xs text-base-content/50 hidden md:inline">{status}</span>
  </div>

  {#if zoteroPanelOpen}
    <div class="border-b border-base-300 bg-base-200/30 p-2 max-h-72 overflow-auto">
      <input
        type="text"
        placeholder="Search Zotero library..."
        bind:value={zoteroQuery}
        oninput={onZoteroInput}
        class="input input-bordered input-sm w-full mb-2"
      />
      {#if zoteroResults.length > 0}
        <div class="space-y-1">
          {#each zoteroResults.slice(0, 20) as z}
            <button
              class="flex flex-col w-full text-left rounded px-2 py-1.5 hover:bg-base-300 transition-colors gap-0.5"
              onclick={() => onInsertCitekey(z.citekey)}
            >
              <span class="font-mono text-xs font-semibold text-error">@{z.citekey}</span>
              <span class="text-xs truncate">{z.title}</span>
              <span class="text-[11px] text-base-content/50">{z.authors} ({z.year})</span>
            </button>
          {/each}
        </div>
      {:else}
        <p class="text-xs text-base-content/50 text-center py-2">
          {zoteroOnline ? "No results" : "Zotero offline — install Better BibTeX"}
        </p>
      {/if}
    </div>
  {/if}

  <div class="flex-1 overflow-hidden">
    <CodeMirror {source} {fileNames} onchange={onSourceChange} />
  </div>
</div>
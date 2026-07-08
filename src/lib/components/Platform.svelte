<script lang="ts">
  import { Menu, FileText, Eye, Link2, Download, X, Circle } from "lucide-svelte";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import type { Snippet } from "svelte";

  interface TreeNode { name: string; path: string; is_dir: boolean; children: TreeNode[]; }
  interface TabInfo { path: string; name: string; dirty: boolean; }

  let {
    files = [],
    vaultPath = "",
    onOpenVault = () => {},
    onOpenFile = (_path: string) => {},
    onVaultChanged = () => {},
    tabs = [],
    activeTabPath = "",
    activeTabName = "Vellum",
    onSwitchTab = (_path: string) => {},
    onCloseTab = (_path: string, _e: MouseEvent) => {},
    onExportPDF = () => {},
    editorSlot,
    previewSlot,
    backlinksSlot,
  }: {
    files: TreeNode[];
    vaultPath: string;
    onOpenVault: () => void;
    onOpenFile: (path: string) => void;
    onVaultChanged: () => void;
    tabs: TabInfo[];
    activeTabPath: string;
    activeTabName: string;
    onSwitchTab: (path: string) => void;
    onCloseTab: (path: string, e: MouseEvent) => void;
    onExportPDF: () => void;
    editorSlot: Snippet;
    previewSlot: Snippet;
    backlinksSlot: Snippet;
  } = $props();

  let mobileTab = $state<"editor" | "preview" | "links">("editor");
  let drawerRef = $state<HTMLInputElement>();

  $effect(() => {
    activeTabPath; vaultPath;
    if (drawerRef) drawerRef.checked = false;
  });
</script>

<div class="drawer lg:drawer-open h-screen w-screen bg-base-100 text-base-content">
  <input bind:this={drawerRef} id="mobile-drawer" type="checkbox" class="drawer-toggle" />

  <div class="drawer-side z-40">
    <label for="mobile-drawer" class="drawer-overlay"></label>
    <div class="w-72 lg:w-56 h-full border-r border-base-300">
      <Sidebar {files} {vaultPath} {onOpenVault} {onOpenFile} {onVaultChanged} />
    </div>
  </div>

  <div class="drawer-content flex flex-col overflow-hidden">
    <div class="lg:hidden flex items-center gap-2 border-b border-base-300 px-2 py-2 shrink-0">
      <label for="mobile-drawer" class="btn btn-ghost btn-sm btn-square">
        <Menu size={18} />
      </label>
      <span class="flex-1 truncate text-sm font-medium">{activeTabName}</span>
      <button class="btn btn-ghost btn-sm btn-square" onclick={onExportPDF} title="Export PDF">
        <Download size={16} />
      </button>
    </div>

    {#if tabs.length > 0}
      <div class="hidden lg:flex items-center border-b border-base-300 bg-base-200 shrink-0 overflow-x-auto">
        {#each tabs as tab}
          <div
            class="flex items-center gap-1.5 px-3 py-1.5 text-sm border-r border-base-300 transition-colors cursor-pointer {tab.path === activeTabPath ? 'bg-base-100' : 'hover:bg-base-300'}"
            role="tab"
            tabindex="0"
            onclick={() => onSwitchTab(tab.path)}
            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSwitchTab(tab.path); }}
          >
            {#if tab.dirty}
              <Circle size={8} class="fill-current text-warning" />
            {/if}
            <span class="truncate max-w-32">{tab.name}</span>
            <button type="button" class="btn btn-ghost btn-xs btn-circle" onclick={(e) => onCloseTab(tab.path, e)} aria-label="Close tab">
              <X size={12} />
            </button>
          </div>
        {/each}
        <div class="flex-1"></div>
        <button class="btn btn-ghost btn-sm gap-1 mr-2" onclick={onExportPDF} title="Export PDF">
          <Download size={14} />
          PDF
        </button>
      </div>
    {/if}

    <div class="hidden lg:grid flex-1 grid-cols-[1fr_1fr_220px] overflow-hidden">
      <section class="border-r border-base-300 overflow-hidden">
        {@render editorSlot()}
      </section>
      <section class="overflow-hidden">
        {@render previewSlot()}
      </section>
      <aside class="border-l border-base-300 overflow-hidden">
        {@render backlinksSlot()}
      </aside>
    </div>

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
          {@render editorSlot()}
        {:else if mobileTab === 'preview'}
          {@render previewSlot()}
        {:else}
          {@render backlinksSlot()}
        {/if}
      </div>
    </div>
  </div>
</div>

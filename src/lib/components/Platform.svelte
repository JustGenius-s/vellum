<script lang="ts">
  import { Menu, FileText, Eye, Download, X, Circle, Settings, GitGraph } from "lucide-svelte";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import SettingsPage from "$lib/components/SettingsPage.svelte";
  import EditorPanel from "$lib/components/EditorPanel.svelte";
  import PreviewPanel from "$lib/components/PreviewPanel.svelte";
  import GraphView from "$lib/components/GraphView.svelte";
  import { getVault, getUI, getRegistry } from "$lib/stores.svelte";

  const vault = getVault();
  const ui = getUI();
  const registry = getRegistry();

  let mobileTab = $state<"editor" | "preview">("editor");
  let drawerRef = $state<HTMLInputElement>();

  $effect(() => {
    vault.activeTabPath; vault.vaultPath;
    if (drawerRef) drawerRef.checked = false;
  });
</script>

<div class="drawer lg:drawer-open h-screen w-screen bg-base-100 text-base-content">
  <input bind:this={drawerRef} id="mobile-drawer" type="checkbox" class="drawer-toggle" />

  <div class="drawer-side z-40">
    <label for="mobile-drawer" class="drawer-overlay"></label>
    <div class="w-72 lg:w-56 h-full border-r border-base-300 flex flex-col">
      <Sidebar />
      <div class="border-t border-base-300 p-2 flex flex-col gap-1">
        <button
          class="btn btn-ghost btn-sm w-full justify-start gap-2 {ui.currentView === 'graph' ? 'btn-active' : ''}"
          onclick={() => (ui.currentView = "graph")}
        >
          <GitGraph size={16} />
          Graph
        </button>
        <button
          class="btn btn-ghost btn-sm w-full justify-start gap-2 {ui.currentView === 'settings' ? 'btn-active' : ''}"
          onclick={() => (ui.currentView = "settings")}
        >
          <Settings size={16} />
          Settings
        </button>
      </div>
    </div>
  </div>

  <div class="drawer-content flex flex-col overflow-hidden">
    {#if ui.currentView === "settings"}
      <SettingsPage />
    {:else if ui.currentView === "graph"}
      <GraphView />
    {:else}
      <div class="lg:hidden flex items-center gap-2 border-b border-base-300 px-2 py-2 shrink-0">
        <label for="mobile-drawer" class="btn btn-ghost btn-sm btn-square">
          <Menu size={18} />
        </label>
        <span class="flex-1 truncate text-sm font-medium">{vault.activeTabName}</span>
        <button class="btn btn-ghost btn-sm btn-square" onclick={() => registry.executeCommand("file.export-pdf")} title="Export PDF">
          <Download size={16} />
        </button>
      </div>

      {#if vault.tabs.length > 0}
        <div class="hidden lg:flex items-center border-b border-base-300 bg-base-200 shrink-0 overflow-x-auto">
          {#each vault.tabs as tab}
            <div
              class="flex items-center gap-1.5 px-3 py-1.5 text-sm border-r border-base-300 transition-colors cursor-pointer {tab.path === vault.activeTabPath ? 'bg-base-100' : 'hover:bg-base-300'}"
              role="tab"
              tabindex="0"
              onclick={() => vault.switchTab(tab.path)}
              onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') vault.switchTab(tab.path); }}
            >
              {#if tab.dirty}
                <Circle size={8} class="fill-current text-warning" />
              {/if}
              <span class="truncate max-w-32">{tab.name}</span>
              <button type="button" class="btn btn-ghost btn-xs btn-circle" onclick={(e) => { e.stopPropagation(); vault.closeTab(tab.path); }} aria-label="Close tab">
                <X size={12} />
              </button>
            </div>
          {/each}
          <div class="flex-1"></div>
          <button class="btn btn-ghost btn-sm gap-1 mr-2" onclick={() => registry.executeCommand("file.export-pdf")} title="Export PDF">
            <Download size={14} />
            PDF
          </button>
        </div>
      {/if}

      <div class="hidden lg:grid flex-1 grid-cols-[1fr_1fr] overflow-hidden">
        <section class="border-r border-base-300 overflow-hidden">
          {#if vault.activeTabPath}
            <EditorPanel />
          {:else}
            <div class="flex items-center justify-center h-full text-base-content/40 text-sm">
              Open a file to start editing
            </div>
          {/if}
        </section>
        <section class="overflow-hidden">
          <PreviewPanel />
        </section>
      </div>

      <div class="lg:hidden flex flex-col flex-1 overflow-hidden">
        <div role="tablist" class="tabs tabs-boxed mx-2 mt-2 shrink-0">
          <button role="tab" class="tab {mobileTab === 'editor' ? 'tab-active' : ''}" onclick={() => (mobileTab = 'editor')}>
            <span class="flex items-center gap-1"><FileText size={14} /> Editor</span>
          </button>
          <button role="tab" class="tab {mobileTab === 'preview' ? 'tab-active' : ''}" onclick={() => (mobileTab = 'preview')}>
            <span class="flex items-center gap-1"><Eye size={14} /> Preview</span>
          </button>
        </div>
        <div class="flex-1 overflow-hidden mt-2">
          {#if mobileTab === 'editor'}
            {#if vault.activeTabPath}
              <EditorPanel />
            {:else}
              <div class="flex items-center justify-center h-full text-base-content/40 text-sm">
                Open a file to start editing
              </div>
            {/if}
          {:else}
            <PreviewPanel />
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>
<script lang="ts">
  import { Menu, FileText, Eye, Download, X, Circle, Settings, GitGraph } from "lucide-svelte";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import SettingsPage from "$lib/components/SettingsPage.svelte";
  import type { Snippet } from "svelte";
  import type { CommandRegistry } from "$lib/commands/registry";
  import type { Vault } from "$lib/vault.svelte";
  import type { Theme } from "$lib/theme.svelte";

  let {
    vault,
    registry,
    currentView = "editor" as "editor" | "settings" | "graph",
    onNavigate = (_view: "editor" | "settings" | "graph") => {},
    theme,
    editorSlot,
    previewSlot,
    graphSlot,
  }: {
    vault: Vault;
    registry: CommandRegistry;
    currentView: "editor" | "settings" | "graph";
    onNavigate: (view: "editor" | "settings" | "graph") => void;
    theme: Theme;
    editorSlot: Snippet;
    previewSlot: Snippet;
    graphSlot: Snippet;
  } = $props();

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
      <Sidebar
        files={vault.files}
        vaultPath={vault.vaultPath}
        onOpenVault={() => vault.openVault()}
        onOpenFile={(p) => vault.openFile(p)}
        onVaultChanged={() => vault.refreshFiles()}
      />
      <div class="border-t border-base-300 p-2 flex flex-col gap-1">
        <button
          class="btn btn-ghost btn-sm w-full justify-start gap-2 {currentView === 'graph' ? 'btn-active' : ''}"
          onclick={() => onNavigate("graph")}
        >
          <GitGraph size={16} />
          Graph
        </button>
        <button
          class="btn btn-ghost btn-sm w-full justify-start gap-2 {currentView === 'settings' ? 'btn-active' : ''}"
          onclick={() => onNavigate("settings")}
        >
          <Settings size={16} />
          Settings
        </button>
      </div>
    </div>
  </div>

  <div class="drawer-content flex flex-col overflow-hidden">
    {#if currentView === "settings"}
      <SettingsPage
        theme={theme.theme}
        onThemeChange={(t) => theme.applyTheme(t)}
        onBack={() => onNavigate("editor")}
      />
    {:else if currentView === "graph"}
      {@render graphSlot()}
    {:else}
      <div class="lg:hidden flex items-center gap-2 border-b border-base-300 px-2 py-2 shrink-0">
        <label for="mobile-drawer" class="btn btn-ghost btn-sm btn-square">
          <Menu size={18} />
        </label>
        <span class="flex-1 truncate text-sm font-medium">{vault.activeTabName}</span>
        <button class="btn btn-ghost btn-sm btn-square" onclick={() => registry.executeCommand("export-pdf")} title="Export PDF">
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
              <button type="button" class="btn btn-ghost btn-xs btn-circle" onclick={(e) => vault.closeTab(tab.path, e)} aria-label="Close tab">
                <X size={12} />
              </button>
            </div>
          {/each}
          <div class="flex-1"></div>
          <button class="btn btn-ghost btn-sm gap-1 mr-2" onclick={() => registry.executeCommand("export-pdf")} title="Export PDF">
            <Download size={14} />
            PDF
          </button>
        </div>
      {/if}

      <div class="hidden lg:grid flex-1 grid-cols-[1fr_1fr] overflow-hidden">
        <section class="border-r border-base-300 overflow-hidden">
          {@render editorSlot()}
        </section>
        <section class="overflow-hidden">
          {@render previewSlot()}
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
            {@render editorSlot()}
          {:else}
            {@render previewSlot()}
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>

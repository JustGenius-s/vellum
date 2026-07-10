<script lang="ts">
  import { fly } from "svelte/transition";
  import {
    Circle,
    Command,
    Download,
    Eye,
    FileText,
    Files,
    GitGraph,
    ListTree,
    Menu,
    PanelLeftClose,
    PanelLeftOpen,
    Settings,
    X,
  } from "lucide-svelte";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import OutlinePanel from "$lib/components/OutlinePanel.svelte";
  import SettingsPage from "$lib/components/SettingsPage.svelte";
  import EditorPanel from "$lib/components/EditorPanel.svelte";
  import PreviewPanel from "$lib/components/PreviewPanel.svelte";
  import GraphView from "$lib/components/GraphView.svelte";
  import { getVault, getUI, getRegistry } from "$lib/stores.svelte";

  const vault = getVault();
  const ui = getUI();
  const registry = getRegistry();

  let mobileTab = $state<"editor" | "preview">("editor");
  let mobileSidebarOpen = $state(false);

  $effect(() => {
    vault.activeTabPath;
    vault.vaultPath;
    mobileSidebarOpen = false;
  });

  function setSidebarCollapsed(collapsed: boolean) {
    ui.sidebarCollapsed = collapsed;
    localStorage.setItem("vellum-sidebar-collapsed", String(collapsed));
  }

  function setSidebarView(view: "files" | "outline") {
    ui.sidebarView = view;
    localStorage.setItem("vellum-sidebar-view", view);
  }

  function openSidebar(view: "files" | "outline") {
    ui.currentView = "editor";
    setSidebarView(view);
    setSidebarCollapsed(false);
  }

  function openView(view: "graph" | "settings") {
    ui.currentView = view;
    mobileSidebarOpen = false;
  }
</script>

<div class="flex h-dvh min-h-dvh w-screen overflow-hidden bg-base-100 text-base-content">
  <aside class="hidden shrink-0 border-r border-base-300 bg-base-200/70 lg:flex">
    <nav class="flex w-12 flex-col border-r border-base-300 bg-base-200/60" aria-label="Workspace">
      <ul class="menu menu-sm w-full gap-1 p-1.5">
        <li class="tooltip tooltip-right" data-tip="Explorer">
          <button
            class="btn btn-ghost ui-icon-button ui-interactive"
            class:btn-active={ui.currentView === "editor" && !ui.sidebarCollapsed && ui.sidebarView === "files"}
            onclick={() => openSidebar("files")}
            aria-label="Explorer"
          >
            <Files class="ui-icon ui-icon--lg" />
          </button>
        </li>
        <li class="tooltip tooltip-right" data-tip="Outline">
          <button
            class="btn btn-ghost ui-icon-button ui-interactive"
            class:btn-active={ui.currentView === "editor" && !ui.sidebarCollapsed && ui.sidebarView === "outline"}
            onclick={() => openSidebar("outline")}
            aria-label="Document outline"
          >
            <ListTree class="ui-icon ui-icon--lg" />
          </button>
        </li>
        <li class="tooltip tooltip-right" data-tip="Command palette (⌘P)">
          <button
            class="btn btn-ghost ui-icon-button ui-interactive"
            onclick={() => registry.executeCommand("palette.open")}
            aria-label="Open command palette"
          >
            <Command class="ui-icon ui-icon--lg" />
          </button>
        </li>
      </ul>

      <div class="flex-1"></div>

      <ul class="menu menu-sm w-full gap-1 p-1.5">
        <li class="tooltip tooltip-right" data-tip="Graph">
          <button
            class="btn btn-ghost ui-icon-button ui-interactive"
            class:btn-active={ui.currentView === "graph"}
            onclick={() => openView("graph")}
            aria-label="Graph"
          >
            <GitGraph class="ui-icon ui-icon--lg" />
          </button>
        </li>
        <li class="tooltip tooltip-right" data-tip="Settings">
          <button
            class="btn btn-ghost ui-icon-button ui-interactive"
            class:btn-active={ui.currentView === "settings"}
            onclick={() => openView("settings")}
            aria-label="Settings"
          >
            <Settings class="ui-icon ui-icon--lg" />
          </button>
        </li>
        <li
          class="tooltip tooltip-right"
          data-tip={ui.sidebarCollapsed ? "Expand sidebar (⌘B)" : "Collapse sidebar (⌘B)"}
        >
          <button
            class="btn btn-ghost ui-icon-button ui-interactive"
            onclick={() => setSidebarCollapsed(!ui.sidebarCollapsed)}
            aria-label={ui.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {#if ui.sidebarCollapsed}
              <PanelLeftOpen class="ui-icon ui-icon--lg" />
            {:else}
              <PanelLeftClose class="ui-icon ui-icon--lg" />
            {/if}
          </button>
        </li>
      </ul>
    </nav>

    {#if ui.currentView === "editor" && !ui.sidebarCollapsed}
      <div
        class="flex w-60 flex-col"
        transition:fly={{ x: -12, duration: 180 }}
      >
        <header class="ui-panel-header">
          <span class="ui-panel-title">
            {ui.sidebarView === "files" ? "Explorer" : "Outline"}
          </span>
          <button
            class="btn btn-ghost ui-icon-button ui-icon-button--compact ui-interactive"
            onclick={() => setSidebarCollapsed(true)}
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose class="ui-icon ui-icon--sm" />
          </button>
        </header>
        <div class="min-h-0 flex-1">
          {#if ui.sidebarView === "files"}
            <Sidebar />
          {:else}
            <OutlinePanel />
          {/if}
        </div>
      </div>
    {/if}
  </aside>

  <div class="drawer min-w-0 flex-1">
    <input
      id="mobile-drawer"
      type="checkbox"
      class="drawer-toggle"
      bind:checked={mobileSidebarOpen}
    />

    <main class="drawer-content flex min-w-0 flex-col overflow-hidden">
      {#if ui.currentView === "settings"}
        <SettingsPage />
      {:else if ui.currentView === "graph"}
        <GraphView />
      {:else}
        <header class="ui-panel-header h-12! shrink-0 px-2 lg:hidden">
          <label
            for="mobile-drawer"
            class="btn btn-ghost ui-icon-button ui-touch-target ui-interactive"
            aria-label="Open explorer"
          >
            <Menu class="ui-icon ui-icon--lg" />
          </label>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium leading-tight">{vault.activeTabName}</p>
            <p class="ui-caption mt-0.5 truncate text-base-content/45">
              {vault.vaultPath || "No vault selected"}
            </p>
          </div>
          <button
            class="btn btn-ghost ui-icon-button ui-touch-target ui-interactive"
            onclick={() => registry.executeCommand("palette.open")}
            aria-label="Open command palette"
          >
            <Command class="ui-icon ui-icon--lg" />
          </button>
          <button
            class="btn btn-ghost ui-icon-button ui-touch-target ui-interactive"
            onclick={() => registry.executeCommand("file.export-pdf")}
            aria-label="Export PDF"
          >
            <Download class="ui-icon ui-icon--lg" />
          </button>
        </header>

        {#if vault.tabs.length > 0}
          <div class="hidden h-10 shrink-0 items-center border-b border-base-300 bg-base-200/45 lg:flex">
            <div role="tablist" class="tabs tabs-border min-w-0 flex-1 flex-nowrap overflow-x-auto">
              {#each vault.tabs as tab}
                <div
                  class="tab h-10! gap-1.5 px-3 text-xs"
                  class:tab-active={tab.path === vault.activeTabPath}
                  role="tab"
                  tabindex="0"
                  aria-selected={tab.path === vault.activeTabPath}
                  onclick={() => vault.switchTab(tab.path)}
                  onkeydown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      vault.switchTab(tab.path);
                    }
                  }}
                >
                  {#if tab.dirty}
                    <Circle class="size-2 shrink-0 fill-current text-warning" />
                  {/if}
                  <span class="max-w-36 truncate">{tab.name}</span>
                  <button
                    type="button"
                    class="btn btn-ghost ui-icon-button ui-icon-button--compact ui-interactive rounded-full"
                    onclick={(event) => {
                      event.stopPropagation();
                      vault.closeTab(tab.path);
                    }}
                    aria-label="Close tab"
                  >
                    <X class="ui-icon ui-icon--sm" />
                  </button>
                </div>
              {/each}
            </div>
            <button
              class="btn btn-ghost btn-sm mr-2 h-8 min-h-8 gap-1.5 px-2 text-xs"
              onclick={() => registry.executeCommand("file.export-pdf")}
              title="Export PDF"
            >
              <Download class="ui-icon ui-icon--sm" />
              PDF
            </button>
          </div>
        {/if}

        <div class="hidden min-h-0 flex-1 grid-cols-[minmax(22rem,1fr)_minmax(22rem,1fr)] overflow-hidden lg:grid">
          <section class="overflow-hidden border-r border-base-300">
            {#if vault.activeTabPath}
              <EditorPanel />
            {:else}
              {@render emptyEditor()}
            {/if}
          </section>
          <section class="overflow-hidden">
            <PreviewPanel />
          </section>
        </div>

        <div class="flex min-h-0 flex-1 flex-col overflow-hidden lg:hidden">
          <div role="tablist" class="tabs tabs-box tabs-sm mx-3 mt-3 grid shrink-0 grid-cols-2">
            <button
              role="tab"
              aria-selected={mobileTab === "editor"}
              class="tab gap-1.5"
              class:tab-active={mobileTab === "editor"}
              onclick={() => (mobileTab = "editor")}
            >
              <FileText class="ui-icon ui-icon--sm" />
              Editor
            </button>
            <button
              role="tab"
              aria-selected={mobileTab === "preview"}
              class="tab gap-1.5"
              class:tab-active={mobileTab === "preview"}
              onclick={() => (mobileTab = "preview")}
            >
              <Eye class="ui-icon ui-icon--sm" />
              Preview
            </button>
          </div>
          <div class="mt-2 min-h-0 flex-1 overflow-hidden">
            {#if mobileTab === "editor"}
              {#if vault.activeTabPath}
                <EditorPanel />
              {:else}
                {@render emptyEditor()}
              {/if}
            {:else}
              <PreviewPanel />
            {/if}
          </div>
        </div>

        <footer class="ui-statusbar shrink-0 bg-base-200/55">
          <span class="min-w-0 flex-1 truncate">
            {vault.activeTabPath || "No file open"}
          </span>
          <span class:text-error={vault.diagnostics.length > 0}>
            {vault.status || "Ready"}
          </span>
        </footer>
      {/if}
    </main>

    <div class="drawer-side z-30 lg:hidden">
      <label
        for="mobile-drawer"
        class="drawer-overlay"
        aria-label="Close explorer"
      ></label>
      <aside class="flex min-h-full w-[min(84vw,20rem)] flex-col border-r border-base-300 bg-base-100">
        <header class="ui-panel-header h-12!">
          <span class="ui-panel-title">
            {ui.sidebarView === "files" ? "Explorer" : "Outline"}
          </span>
          <button
            class="btn btn-ghost ui-icon-button ui-touch-target ui-interactive"
            class:btn-active={ui.sidebarView === "files"}
            onclick={() => setSidebarView("files")}
            aria-label="Show explorer"
          >
            <Files class="ui-icon" />
          </button>
          <button
            class="btn btn-ghost ui-icon-button ui-touch-target ui-interactive"
            class:btn-active={ui.sidebarView === "outline"}
            onclick={() => setSidebarView("outline")}
            aria-label="Show document outline"
          >
            <ListTree class="ui-icon" />
          </button>
          <label
            for="mobile-drawer"
            class="btn btn-ghost ui-icon-button ui-touch-target ui-interactive"
            aria-label="Close explorer"
          >
            <X class="ui-icon ui-icon--lg" />
          </label>
        </header>
        <div class="min-h-0 flex-1">
          {#if ui.sidebarView === "files"}
            <Sidebar />
          {:else}
            <OutlinePanel onnavigate={() => (mobileSidebarOpen = false)} />
          {/if}
        </div>
        <ul class="menu menu-horizontal grid grid-cols-2 border-t border-base-300 p-2">
          <li>
            <button
              class:menu-active={ui.currentView === "graph"}
              onclick={() => openView("graph")}
            >
              <GitGraph class="ui-icon" />
              Graph
            </button>
          </li>
          <li>
            <button
              class:menu-active={ui.currentView === "settings"}
              onclick={() => openView("settings")}
            >
              <Settings class="ui-icon" />
              Settings
            </button>
          </li>
        </ul>
      </aside>
    </div>
  </div>
</div>

{#snippet emptyEditor()}
  <div class="flex h-full items-center justify-center p-8">
    <div class="max-w-xs text-center">
      <div class="mx-auto mb-4 flex size-11 items-center justify-center rounded-xl border border-base-300 bg-base-200/60 text-base-content/45">
        <FileText class="ui-icon ui-icon--lg" />
      </div>
      <h2 class="text-sm font-semibold">Start with a document</h2>
      <p class="mt-1.5 text-xs leading-5 text-base-content/45">
        Open a vault, then select a Typst file from the explorer.
      </p>
      <button class="btn btn-primary btn-sm mt-4" onclick={() => vault.openVault()}>
        Open vault
      </button>
    </div>
  </div>
{/snippet}
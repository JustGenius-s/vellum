<script lang="ts">
  import {
    CircleAlert,
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
    Search,
    Settings,
    X,
  } from "lucide-svelte";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import SearchPanel from "$lib/components/SearchPanel.svelte";
  import OutlinePanel from "$lib/components/OutlinePanel.svelte";
  import SettingsPage from "$lib/components/SettingsPage.svelte";
  import EditorPanel from "$lib/components/EditorPanel.svelte";
  import PreviewPanel from "$lib/components/PreviewPanel.svelte";
  import DiagnosticsPanel from "$lib/components/DiagnosticsPanel.svelte";
  import GraphView from "$lib/components/GraphView.svelte";
  import DocumentTabs from "$lib/components/ui/DocumentTabs.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Drawer from "$lib/components/ui/Drawer.svelte";
  import EmptyState from "$lib/components/ui/EmptyState.svelte";
  import IconButton from "$lib/components/ui/IconButton.svelte";
  import SegmentedControl, {
    type SegmentOption,
  } from "$lib/components/ui/SegmentedControl.svelte";
  import SharedHighlight from "$lib/components/ui/SharedHighlight.svelte";
  import StatusDot from "$lib/components/ui/StatusDot.svelte";
  import Tooltip from "$lib/components/ui/Tooltip.svelte";
  import { getVault, getUI, getRegistry } from "$lib/stores.svelte";
  import { crossfadeEnter, surfaceEnter } from "$lib/motion/actions";

  const vault = getVault();
  const ui = getUI();
  const registry = getRegistry();

  let mobileTab = $state<"editor" | "preview">("editor");
  let mobileSidebarOpen = $state(false);
  let dock = $state<HTMLElement>();
  const mobileViewOptions: SegmentOption[] = [
    { value: "editor", label: "Editor", icon: FileText },
    { value: "preview", label: "Preview", icon: Eye },
  ];
  let sidebarTitle = $derived(
    ui.sidebarView === "files"
      ? "Explorer"
      : ui.sidebarView === "search"
        ? "Search"
        : "Outline",
  );
  let activeDirty = $derived(
    vault.tabs.find((tab) => tab.path === vault.activeTabPath)?.dirty ?? false,
  );

  $effect(() => {
    vault.activeTabPath;
    vault.vaultPath;
    mobileSidebarOpen = false;
  });

  function setSidebarCollapsed(collapsed: boolean) {
    ui.sidebarCollapsed = collapsed;
    localStorage.setItem("vellum-sidebar-collapsed", String(collapsed));
  }

  function setSidebarView(view: "files" | "search" | "outline") {
    ui.sidebarView = view;
    localStorage.setItem("vellum-sidebar-view", view);
  }

  function openSidebar(view: "files" | "search" | "outline") {
    ui.currentView = "editor";
    setSidebarView(view);
    setSidebarCollapsed(false);
  }

  function openView(view: "graph" | "settings") {
    ui.currentView = view;
    mobileSidebarOpen = false;
  }
</script>

<div class="flex h-dvh min-h-dvh w-screen gap-2 overflow-hidden p-2 text-base-content">
  <aside class="hidden shrink-0 lg:flex">
    <nav
      bind:this={dock}
      class="ui-orbital-rail ui-glass-floating fixed bottom-10 left-1/2 z-30 flex h-14 -translate-x-1/2 items-center gap-1 px-2"
      aria-label="Workspace"
    >
      <SharedHighlight
        container={dock}
        selector='[aria-pressed="true"]'
        dependency={`${ui.currentView}:${ui.sidebarView}:${ui.sidebarCollapsed}`}
        inset={1}
      />
      <div class="mr-1 flex items-center justify-center pr-1" aria-hidden="true">
        <span class="flex size-7 items-center justify-center rounded-lg bg-primary/12 text-xs font-black tracking-tighter text-primary">
          V
        </span>
      </div>
      <ul class="flex gap-1">
        <li>
          <Tooltip text="Explorer">
          <IconButton
            label="Explorer"
            active={ui.currentView === "editor" && !ui.sidebarCollapsed && ui.sidebarView === "files"}
            onclick={() => openSidebar("files")}
          >
            <Files class="ui-icon ui-icon--lg" />
          </IconButton>
          </Tooltip>
        </li>
        <li>
          <Tooltip text="Outline">
          <IconButton
            label="Document outline"
            active={ui.currentView === "editor" && !ui.sidebarCollapsed && ui.sidebarView === "outline"}
            onclick={() => openSidebar("outline")}
          >
            <ListTree class="ui-icon ui-icon--lg" />
          </IconButton>
          </Tooltip>
        </li>
        <li>
          <Tooltip text="Search (⌘⇧F)">
          <IconButton
            label="Search in vault"
            active={ui.currentView === "editor" && !ui.sidebarCollapsed && ui.sidebarView === "search"}
            onclick={() => openSidebar("search")}
          >
            <Search class="ui-icon ui-icon--lg" />
          </IconButton>
          </Tooltip>
        </li>
        <li>
          <Tooltip text="Command palette (⌘P)">
          <IconButton
            label="Open command palette"
            onclick={() => registry.executeCommand("palette.open-commands")}
          >
            <Command class="ui-icon ui-icon--lg" />
          </IconButton>
          </Tooltip>
        </li>
      </ul>

      <div class="mx-1 size-1 rounded-full bg-base-content/20"></div>

      <ul class="flex gap-1">
        <li>
          <Tooltip text="Graph">
          <IconButton
            label="Graph"
            active={ui.currentView === "graph"}
            onclick={() => openView("graph")}
          >
            <GitGraph class="ui-icon ui-icon--lg" />
          </IconButton>
          </Tooltip>
        </li>
        <li>
          <Tooltip text="Settings">
          <IconButton
            label="Settings"
            active={ui.currentView === "settings"}
            onclick={() => openView("settings")}
          >
            <Settings class="ui-icon ui-icon--lg" />
          </IconButton>
          </Tooltip>
        </li>
        <li>
          <Tooltip text={ui.sidebarCollapsed ? "Expand sidebar (⌘B)" : "Collapse sidebar (⌘B)"}>
          <IconButton
            label={ui.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            onclick={() => setSidebarCollapsed(!ui.sidebarCollapsed)}
          >
            {#if ui.sidebarCollapsed}
              <PanelLeftOpen class="ui-icon ui-icon--lg" />
            {:else}
              <PanelLeftClose class="ui-icon ui-icon--lg" />
            {/if}
          </IconButton>
          </Tooltip>
        </li>
      </ul>
    </nav>

    {#if ui.currentView === "editor" && !ui.sidebarCollapsed}
      <div
        use:surfaceEnter={{ x: -12, scale: 0.995 }}
        class="ui-workspace-panel flex w-64 flex-col"
      >
        {#key ui.sidebarView}
        <div use:crossfadeEnter={{ x: -5 }} class="min-h-0 flex flex-1 flex-col">
        {#if ui.sidebarView === "files"}
          <div class="min-h-0 flex-1">
            <Sidebar />
          </div>
        {:else}
          <header class="ui-panel-header">
            <span class="ui-panel-title">{sidebarTitle}</span>
            <IconButton
              label="Collapse sidebar"
              compact
              onclick={() => setSidebarCollapsed(true)}
            >
              <PanelLeftClose class="ui-icon ui-icon--sm" />
            </IconButton>
          </header>
          <div class="min-h-0 flex-1">
            {#if ui.sidebarView === "search"}
            <SearchPanel />
            {:else}
            <OutlinePanel />
            {/if}
          </div>
        {/if}
        </div>
        {/key}
      </div>
    {/if}
  </aside>

  <div class="ui-workspace-panel min-w-0 flex-1">
    <main class="flex h-full min-w-0 flex-col overflow-hidden">
      {#if ui.currentView === "settings"}
        <div use:crossfadeEnter={{ x: 8 }} class="h-full">
          <SettingsPage />
        </div>
      {:else if ui.currentView === "graph"}
        <div use:crossfadeEnter={{ x: 8 }} class="h-full">
          <GraphView />
        </div>
      {:else}
        <div use:crossfadeEnter={{ x: -5 }} class="flex h-full min-h-0 flex-col">
        <header class="ui-page-header px-2 lg:hidden">
          <IconButton
            label="Open explorer"
            touch
            onclick={() => (mobileSidebarOpen = true)}
          >
            <Menu class="ui-icon ui-icon--lg" />
          </IconButton>
          <div class="min-w-0 flex-1">
            <p class="truncate text-xs font-semibold leading-tight">{vault.activeTabName}</p>
            <p class="ui-caption ui-text-tertiary mt-0.5 truncate">
              {vault.vaultPath || "No vault selected"}
            </p>
          </div>
          <IconButton
            label="Open command palette"
            touch
            onclick={() => registry.executeCommand("palette.open-commands")}
          >
            <Command class="ui-icon ui-icon--lg" />
          </IconButton>
          <IconButton
            label="Export PDF"
            touch
            onclick={() => registry.executeCommand("file.export-pdf")}
          >
            <Download class="ui-icon ui-icon--lg" />
          </IconButton>
        </header>

        {#if vault.tabs.length > 0}
          <div class="ui-surface-chrome hidden h-11 shrink-0 items-center lg:flex">
            <DocumentTabs
              tabs={vault.tabs}
              activePath={vault.activeTabPath}
              onswitch={(path) => vault.switchTab(path)}
              onclose={(path) => vault.closeTab(path)}
            />
            <Button
              size="sm"
              class="mr-2"
              onclick={() => registry.executeCommand("file.export-pdf")}
            >
              <Download class="ui-icon ui-icon--sm" />
              PDF
            </Button>
          </div>
        {/if}

        <div class="hidden min-h-0 flex-1 grid-cols-[minmax(22rem,1.08fr)_minmax(22rem,0.92fr)] gap-1.5 overflow-hidden bg-transparent p-1.5 lg:grid">
          <section class="ui-workspace-panel overflow-hidden">
            {#if vault.activeTabPath}
              <EditorPanel />
            {:else}
              {@render emptyEditor()}
            {/if}
          </section>
          <section class="ui-workspace-panel overflow-hidden">
            <PreviewPanel />
          </section>
        </div>

        {#if vault.tabs.length > 1}
          <div class="ui-surface-chrome flex h-9 shrink-0 lg:hidden">
            <DocumentTabs
              tabs={vault.tabs}
              activePath={vault.activeTabPath}
              compact
              onswitch={(path) => vault.switchTab(path)}
              onclose={(path) => vault.closeTab(path)}
            />
          </div>
        {/if}

        <div class="flex min-h-0 flex-1 flex-col overflow-hidden lg:hidden">
          <div class="mx-3 mt-3 shrink-0">
            <SegmentedControl
              value={mobileTab}
              options={mobileViewOptions}
              label="Workspace view"
              variant="tab"
              onchange={(value) => (mobileTab = value as typeof mobileTab)}
            />
          </div>
          <div class="mt-2 min-h-0 flex-1 overflow-hidden">
            {#key mobileTab}
            <div use:crossfadeEnter={{ x: mobileTab === "editor" ? -5 : 5 }} class="h-full">
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
            {/key}
          </div>
        </div>

        <DiagnosticsPanel />

        <footer class="ui-statusbar shrink-0 border-t-0 bg-transparent">
          <span class="min-w-0 flex-1 truncate">
            {vault.activeTabPath || "No file open"}
          </span>
          <span>{vault.status || "Ready"}</span>
          <StatusDot
            tone={vault.compilePhase !== "idle" ? "primary" : activeDirty ? "warning" : "success"}
            pulse={vault.compilePhase !== "idle"}
          />
          <button
            type="button"
            class="status-problems ui-glass-hover ui-interactive flex h-full items-center gap-1.5 px-1.5 {ui.problemsOpen ? 'ui-glass-control--active' : ''}"
            class:text-error={vault.diagnostics.length > 0}
            onclick={() => (ui.problemsOpen = !ui.problemsOpen)}
            aria-expanded={ui.problemsOpen}
            aria-label="Toggle problems panel"
          >
            <CircleAlert class="ui-icon ui-icon--sm" />
            <span class="tabular-nums">{vault.diagnostics.length}</span>
          </button>
        </footer>
        </div>
      {/if}
    </main>

    <Drawer
      open={mobileSidebarOpen}
      label="Workspace navigation"
      onclose={() => (mobileSidebarOpen = false)}
    >
      <div class="ui-surface-chrome flex h-full flex-col">
        <header class="ui-page-header">
          <span class="ui-panel-title">
            {sidebarTitle}
          </span>
          <IconButton
            label="Show explorer"
            touch
            active={ui.sidebarView === "files"}
            onclick={() => setSidebarView("files")}
          >
            <Files class="ui-icon" />
          </IconButton>
          <IconButton
            label="Show document outline"
            touch
            active={ui.sidebarView === "outline"}
            onclick={() => setSidebarView("outline")}
          >
            <ListTree class="ui-icon" />
          </IconButton>
          <IconButton
            label="Search in vault"
            touch
            active={ui.sidebarView === "search"}
            onclick={() => setSidebarView("search")}
          >
            <Search class="ui-icon" />
          </IconButton>
          <IconButton
            label="Close explorer"
            touch
            onclick={() => (mobileSidebarOpen = false)}
          >
            <X class="ui-icon ui-icon--lg" />
          </IconButton>
        </header>
        <div class="min-h-0 flex-1">
          {#key ui.sidebarView}
          <div use:crossfadeEnter={{ x: 5 }} class="h-full">
          {#if ui.sidebarView === "files"}
            <Sidebar />
          {:else if ui.sidebarView === "search"}
            <SearchPanel onnavigate={() => (mobileSidebarOpen = false)} />
          {:else}
            <OutlinePanel onnavigate={() => (mobileSidebarOpen = false)} />
          {/if}
          </div>
          {/key}
        </div>
        <div class="grid grid-cols-2 gap-1 p-2">
            <Button
              active={ui.currentView === "graph"}
              onclick={() => openView("graph")}
            >
              <GitGraph class="ui-icon" />
              Graph
            </Button>
            <Button
              active={ui.currentView === "settings"}
              onclick={() => openView("settings")}
            >
              <Settings class="ui-icon" />
              Settings
            </Button>
        </div>
      </div>
    </Drawer>
  </div>
</div>

{#snippet emptyEditor()}
  <div class="flex h-full items-center justify-center">
    <EmptyState
      title="Start with a document"
      description="Open a vault, then select a Typst file from the explorer."
    >
      {#snippet icon()}
        <FileText class="ui-icon ui-icon--lg" />
      {/snippet}
      {#snippet action()}
        <Button variant="primary" size="sm" onclick={() => vault.openVault()}>
          Open vault
        </Button>
      {/snippet}
    </EmptyState>
  </div>
{/snippet}

<style>
  :global(.ui-orbital-rail > :not(.shared-highlight)) {
    position: relative;
    z-index: 1;
  }

  :global(.ui-orbital-rail .icon-button.is-active) {
    background: transparent;
    box-shadow: none;
  }

</style>
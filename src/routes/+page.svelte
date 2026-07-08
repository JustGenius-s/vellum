<script lang="ts">
  import Platform from "$lib/components/Platform.svelte";
  import EditorPanel from "$lib/components/EditorPanel.svelte";
  import PreviewPanel from "$lib/components/PreviewPanel.svelte";
  import GraphView from "$lib/components/GraphView.svelte";
  import CommandPalette from "$lib/components/CommandPalette.svelte";

  import { createCommandRegistry } from "$lib/commands/registry";
  import { createKeybindingManager, ResolveResultKind } from "$lib/commands/keybinding";

  import { createVault } from "$lib/vault.svelte";
  import { createTheme } from "$lib/theme.svelte";

  import { Download, Sun, Moon, Settings, GitGraph } from "lucide-svelte";

  const vault = createVault();
  const theme = createTheme();
  const registry = createCommandRegistry();
  const keybindings = createKeybindingManager();

  let currentView = $state<"editor" | "settings" | "graph">("editor");
  let paletteOpen = $state(false);
  let findPanelOpen = $state(false);

  $effect(() => {
    vault.loadSavedState().then((savedTheme) => {
      if (savedTheme === "light" || savedTheme === "dark") {
        theme.applyTheme(savedTheme);
      } else {
        theme.init();
      }
    });
  });

  // --- Commands ---

  registry.registerCommand({
    id: "save-file",
    label: "Save File",
    handler: () => { if (vault.activeTabPath) vault.saveFile(vault.activeTabPath); },
  });

  registry.registerCommand({
    id: "export-pdf",
    label: "Export PDF",
    icon: Download,
    handler: () => vault.exportPDF(),
  });

  registry.registerCommand({
    id: "open-settings",
    label: "Open Settings",
    icon: Settings,
    handler: () => { currentView = "settings"; },
  });

  registry.registerCommand({
    id: "open-graph",
    label: "Open Graph",
    icon: GitGraph,
    handler: () => { currentView = "graph"; },
  });

  $effect(() => {
    const isDark = theme.theme === "dark";
    const dispose = registry.registerCommand({
      id: "toggle-theme",
      label: isDark ? "Switch to Light" : "Switch to Dark",
      icon: isDark ? Sun : Moon,
      handler: () => theme.applyTheme(isDark ? "light" : "dark"),
    });
    return dispose;
  });

  registry.registerCommand({
    id: "palette",
    handler: () => { paletteOpen = true; },
  });

  registry.registerCommand({
    id: "find",
    handler: () => { findPanelOpen = true; },
  });

  registry.registerCommand({
    id: "back-to-editor",
    handler: () => { currentView = "editor"; },
  });

  // --- Keybindings ---

  keybindings.bind({ keys: "Cmd+S", command: "save-file" });
  keybindings.bind({ keys: "Cmd+P", command: "palette" });
  keybindings.bind({ keys: "Cmd+F", command: "find" });

  function handleKeydown(e: KeyboardEvent) {
    const result = keybindings.resolve(e, {});
    if (result.kind === ResolveResultKind.Found) {
      e.preventDefault();
      registry.executeCommand(result.command);
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<Platform
  {vault}
  {registry}
  {currentView}
  onNavigate={(v) => (currentView = v)}
  {theme}
>
  {#snippet editorSlot()}
    {#if vault.activeTabPath}
      <EditorPanel
        source={vault.source}
        fileNames={vault.fileNames}
        {findPanelOpen}
        onSourceChange={(v) => vault.onSourceChange(v)}
        onFindPanelClose={() => (findPanelOpen = false)}
      />
    {:else}
      <div class="flex items-center justify-center h-full text-base-content/40 text-sm">
        Open a file to start editing
      </div>
    {/if}
  {/snippet}

  {#snippet previewSlot()}
    <PreviewPanel svg={vault.svg} />
  {/snippet}

  {#snippet graphSlot()}
    <GraphView stems={vault.fileNames} links={vault.backlinkIndex} onOpen={(s) => vault.openByStem(s)} onBack={() => (currentView = "editor")} />
  {/snippet}
</Platform>

<CommandPalette
  open={paletteOpen}
  onClose={() => (paletteOpen = false)}
  {vault}
  {registry}
  {keybindings}
/>

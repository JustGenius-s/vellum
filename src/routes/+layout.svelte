<script lang="ts">
  import "../app.css";
  import { setContext, onMount } from "svelte";
  import {
    CircleAlert,
    Download,
    GitGraph,
    Moon,
    PanelLeftClose,
    Search,
    Settings,
    Sun,
  } from "lucide-svelte";
  import { createVault } from "$lib/vault.svelte";
  import { createTheme } from "$lib/theme.svelte";
  import { createSettings } from "$lib/settings.svelte";
  import { createCommandRegistry } from "$lib/commands/registry";
  import { createKeybindingManager, ResolveResultKind } from "$lib/commands/keybinding";
  import type { SidebarView, View } from "$lib/stores.svelte";

  let { children } = $props();

  const vault = createVault();
  const theme = createTheme();
  const settings = createSettings();
  const registry = createCommandRegistry();
  const keybindings = createKeybindingManager();

  const ui = $state<{
    currentView: View;
    paletteOpen: boolean;
    paletteQuery: string;
    findPanelOpen: boolean;
    sidebarCollapsed: boolean;
    sidebarView: SidebarView;
    gotoLine: number | null;
    problemsOpen: boolean;
    scrollRatio: number;
    scrollSource: "editor" | "preview" | null;
  }>({
    currentView: "editor",
    paletteOpen: false,
    paletteQuery: "",
    findPanelOpen: false,
    sidebarCollapsed: false,
    sidebarView: "files",
    gotoLine: null,
    problemsOpen: false,
    scrollRatio: 0,
    scrollSource: null,
  });

  setContext("vault", vault);
  setContext("theme", theme);
  setContext("settings", settings);
  setContext("registry", registry);
  setContext("keybindings", keybindings);
  setContext("ui", ui);

  $effect(() => {
    vault.configureAutoSave(
      settings.editor.autoSave,
      settings.editor.autoSaveDelayMs,
    );
  });

  onMount(() => {
    ui.sidebarCollapsed =
      localStorage.getItem("vellum-sidebar-collapsed") === "true";
    const savedSidebarView = localStorage.getItem("vellum-sidebar-view");
    ui.sidebarView =
      savedSidebarView === "outline" || savedSidebarView === "search"
        ? savedSidebarView
        : "files";

    theme.init();
    settings.init();
    void vault.loadSavedState();

    const disposers: (() => void)[] = [];

    disposers.push(registry.registerCommand({
      id: "file.save",
      label: "Save File",
      handler: () => { if (vault.activeTabPath) vault.saveFile(vault.activeTabPath); },
    }));

    disposers.push(registry.registerCommand({
      id: "file.export-pdf",
      label: "Export PDF",
      icon: Download,
      handler: () => vault.exportPDF(),
    }));

    disposers.push(registry.registerCommand({
      id: "view.settings",
      label: "Open Settings",
      icon: Settings,
      handler: () => { ui.currentView = "settings"; },
    }));

    disposers.push(registry.registerCommand({
      id: "view.graph",
      label: "Open Graph",
      icon: GitGraph,
      handler: () => { ui.currentView = "graph"; },
    }));

    disposers.push(registry.registerCommand({
      id: "view.editor",
      label: "Back to Editor",
      handler: () => { ui.currentView = "editor"; },
    }));

    disposers.push(registry.registerCommand({
      id: "view.toggle-sidebar",
      label: "Toggle Explorer Sidebar",
      icon: PanelLeftClose,
      handler: () => {
        ui.sidebarCollapsed = !ui.sidebarCollapsed;
        localStorage.setItem(
          "vellum-sidebar-collapsed",
          String(ui.sidebarCollapsed),
        );
      },
    }));

    disposers.push(registry.registerCommand({
      id: "view.toggle-problems",
      label: "Toggle Problems",
      icon: CircleAlert,
      handler: () => { ui.problemsOpen = !ui.problemsOpen; },
    }));

    disposers.push(registry.registerCommand({
      id: "view.search",
      label: "Search in Vault",
      icon: Search,
      handler: () => {
        ui.currentView = "editor";
        ui.sidebarView = "search";
        ui.sidebarCollapsed = false;
        localStorage.setItem("vellum-sidebar-view", "search");
        localStorage.setItem("vellum-sidebar-collapsed", "false");
      },
    }));

    disposers.push(registry.registerCommand({
      id: "theme.toggle",
      get label() { return theme.theme === "dark" ? "Switch to Light" : "Switch to Dark"; },
      get icon() { return theme.theme === "dark" ? Sun : Moon; },
      handler: () => theme.applyTheme(theme.theme === "dark" ? "light" : "dark"),
    }));

    disposers.push(registry.registerCommand({
      id: "palette.open",
      label: "Quick Open",
      handler: () => {
        ui.paletteQuery = "";
        ui.paletteOpen = true;
      },
    }));

    disposers.push(registry.registerCommand({
      id: "palette.open-commands",
      label: "Show Command Palette",
      handler: () => {
        ui.paletteQuery = ">";
        ui.paletteOpen = true;
      },
    }));

    disposers.push(registry.registerCommand({
      id: "editor.find",
      label: "Find in Document",
      handler: () => { ui.findPanelOpen = true; },
    }));

    disposers.push(keybindings.bind({ keys: "Cmd+S", command: "file.save" }));
    disposers.push(keybindings.bind({ keys: "Cmd+P", command: "palette.open" }));
    disposers.push(keybindings.bind({
      keys: "Cmd+Shift+P",
      command: "palette.open-commands",
    }));
    disposers.push(keybindings.bind({ keys: "Cmd+F", command: "editor.find" }));
    disposers.push(keybindings.bind({
      keys: "Cmd+Shift+F",
      command: "view.search",
    }));
    disposers.push(keybindings.bind({
      keys: "Cmd+B",
      command: "view.toggle-sidebar",
    }));

    return () => {
      for (const d of disposers) d();
    };
  });

  function handleKeydown(e: KeyboardEvent) {
    const result = keybindings.resolve(e, {});
    if (result.kind === ResolveResultKind.Found) {
      e.preventDefault();
      registry.executeCommand(result.command);
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{@render children?.()}
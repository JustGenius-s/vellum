<script lang="ts">
  import "../app.css";
  import { setContext, onMount } from "svelte";
  import { Download, Sun, Moon, Settings, GitGraph } from "lucide-svelte";
  import { createVault } from "$lib/vault.svelte";
  import { createTheme } from "$lib/theme.svelte";
  import { createCommandRegistry } from "$lib/commands/registry";
  import { createKeybindingManager, ResolveResultKind } from "$lib/commands/keybinding";
  import type { View } from "$lib/stores.svelte";

  let { children } = $props();

  const vault = createVault();
  const theme = createTheme();
  const registry = createCommandRegistry();
  const keybindings = createKeybindingManager();

  const ui = $state<{
    currentView: View;
    paletteOpen: boolean;
    findPanelOpen: boolean;
    gotoLine: number | null;
    diagnosticsDismissed: boolean;
    scrollRatio: number;
    scrollSource: "editor" | "preview" | null;
  }>({
    currentView: "editor",
    paletteOpen: false,
    findPanelOpen: false,
    gotoLine: null,
    diagnosticsDismissed: false,
    scrollRatio: 0,
    scrollSource: null,
  });

  setContext("vault", vault);
  setContext("theme", theme);
  setContext("registry", registry);
  setContext("keybindings", keybindings);
  setContext("ui", ui);

  onMount(() => {
    vault.loadSavedState()
      .then((savedTheme) => {
        if (savedTheme === "light" || savedTheme === "dark") {
          theme.applyTheme(savedTheme);
        } else {
          theme.init();
        }
      })
      .catch((e) => {
        console.error("Failed to load saved state:", e);
        theme.init();
      });

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
      id: "theme.toggle",
      get label() { return theme.theme === "dark" ? "Switch to Light" : "Switch to Dark"; },
      get icon() { return theme.theme === "dark" ? Sun : Moon; },
      handler: () => theme.applyTheme(theme.theme === "dark" ? "light" : "dark"),
    }));

    disposers.push(registry.registerCommand({
      id: "palette.open",
      handler: () => { ui.paletteOpen = true; },
    }));

    disposers.push(registry.registerCommand({
      id: "editor.find",
      handler: () => { ui.findPanelOpen = true; },
    }));

    disposers.push(keybindings.bind({ keys: "Cmd+S", command: "file.save" }));
    disposers.push(keybindings.bind({ keys: "Cmd+P", command: "palette.open" }));
    disposers.push(keybindings.bind({ keys: "Cmd+F", command: "editor.find" }));

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
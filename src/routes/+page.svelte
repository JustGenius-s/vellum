<script lang="ts">
  import Platform from "$lib/components/Platform.svelte";
  import CommandPalette from "$lib/components/CommandPalette.svelte";

  import { ResolveResultKind } from "$lib/commands/keybinding";

  import { vault, theme, registry, keybindings, ui } from "$lib/stores.svelte";

  import { Download, Sun, Moon, Settings, GitGraph } from "lucide-svelte";
  import { onMount } from "svelte";

  $effect(() => {
    vault.loadSavedState().then((savedTheme) => {
      if (savedTheme === "light" || savedTheme === "dark") {
        theme.applyTheme(savedTheme);
      } else {
        theme.init();
      }
    }).catch((e) => {
      console.error("Failed to load saved state:", e);
      theme.init();
    });
  });

  // --- Commands & Keybindings ---

  onMount(() => {
    const disposers: (() => void)[] = [];

    disposers.push(registry.registerCommand({
      id: "save-file",
      label: "Save File",
      handler: () => { if (vault.activeTabPath) vault.saveFile(vault.activeTabPath); },
    }));

    disposers.push(registry.registerCommand({
      id: "export-pdf",
      label: "Export PDF",
      icon: Download,
      handler: () => vault.exportPDF(),
    }));

    disposers.push(registry.registerCommand({
      id: "open-settings",
      label: "Open Settings",
      icon: Settings,
      handler: () => { ui.currentView = "settings"; },
    }));

    disposers.push(registry.registerCommand({
      id: "open-graph",
      label: "Open Graph",
      icon: GitGraph,
      handler: () => { ui.currentView = "graph"; },
    }));

    disposers.push(registry.registerCommand({
      id: "toggle-theme",
      get label() { return theme.theme === "dark" ? "Switch to Light" : "Switch to Dark"; },
      get icon() { return theme.theme === "dark" ? Sun : Moon; },
      handler: () => theme.applyTheme(theme.theme === "dark" ? "light" : "dark"),
    }));

    disposers.push(registry.registerCommand({
      id: "palette",
      handler: () => { ui.paletteOpen = true; },
    }));

    disposers.push(registry.registerCommand({
      id: "find",
      handler: () => { ui.findPanelOpen = true; },
    }));

    disposers.push(registry.registerCommand({
      id: "back-to-editor",
      handler: () => { ui.currentView = "editor"; },
    }));

    disposers.push(keybindings.bind({ keys: "Cmd+S", command: "save-file" }));
    disposers.push(keybindings.bind({ keys: "Cmd+P", command: "palette" }));
    disposers.push(keybindings.bind({ keys: "Cmd+F", command: "find" }));

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

<Platform />

<CommandPalette />
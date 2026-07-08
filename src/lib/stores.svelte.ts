import { createVault, type TreeNode } from "$lib/vault.svelte";
import { createTheme } from "$lib/theme.svelte";
import { createCommandRegistry } from "$lib/commands/registry";
import { createKeybindingManager } from "$lib/commands/keybinding";

export type { TreeNode };

export type View = "editor" | "settings" | "graph";

export const vault = createVault();
export const theme = createTheme();
export const registry = createCommandRegistry();
export const keybindings = createKeybindingManager();

export const ui = $state<{
  currentView: View;
  paletteOpen: boolean;
  findPanelOpen: boolean;
}>({
  currentView: "editor",
  paletteOpen: false,
  findPanelOpen: false,
});
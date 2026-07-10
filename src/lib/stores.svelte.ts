import { getContext } from "svelte";
import { createVault, type TreeNode } from "$lib/vault.svelte";
import { createTheme } from "$lib/theme.svelte";
import { createCommandRegistry } from "$lib/commands/registry";
import { createKeybindingManager } from "$lib/commands/keybinding";

export type { TreeNode };
export type View = "editor" | "settings" | "graph";
export type Vault = ReturnType<typeof createVault>;
export type Theme = ReturnType<typeof createTheme>;
export type Registry = ReturnType<typeof createCommandRegistry>;
export type Keybindings = ReturnType<typeof createKeybindingManager>;
export type UIState = {
  currentView: View;
  paletteOpen: boolean;
  findPanelOpen: boolean;
  /** When set, editor scrolls to this 1-based line then clears. */
  gotoLine: number | null;
  /** User dismissed the diagnostics panel until next compile error. */
  diagnosticsDismissed: boolean;
  /** Scroll ratio 0–1 for editor ↔ preview sync. */
  scrollRatio: number;
  /** Which side last drove scroll sync. */
  scrollSource: "editor" | "preview" | null;
};

export function getVault(): Vault { return getContext<Vault>("vault"); }
export function getTheme(): Theme { return getContext<Theme>("theme"); }
export function getRegistry(): Registry { return getContext<Registry>("registry"); }
export function getKeybindings(): Keybindings { return getContext<Keybindings>("keybindings"); }
export function getUI(): UIState { return getContext<UIState>("ui"); }
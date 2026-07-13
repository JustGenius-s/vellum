import { getContext } from "svelte";
import { createVault, type TreeNode } from "$lib/vault.svelte";
import { createTheme } from "$lib/theme.svelte";
import { createSettings } from "$lib/settings.svelte";
import { createCommandRegistry } from "$lib/commands/registry";
import { createKeybindingManager } from "$lib/commands/keybinding";

export type { TreeNode };
export type View = "editor" | "settings" | "graph";
export type SidebarView = "files" | "search" | "outline";
export type Vault = ReturnType<typeof createVault>;
export type Theme = ReturnType<typeof createTheme>;
export type Settings = ReturnType<typeof createSettings>;
export type Registry = ReturnType<typeof createCommandRegistry>;
export type Keybindings = ReturnType<typeof createKeybindingManager>;
export type UIState = {
  currentView: View;
  paletteOpen: boolean;
  /** Initial query used to select quick-open mode. */
  paletteQuery: string;
  findPanelOpen: boolean;
  /** Whether the desktop explorer panel is hidden. */
  sidebarCollapsed: boolean;
  /** Active content in the primary sidebar. */
  sidebarView: SidebarView;
  /** When set, editor scrolls to this 1-based line then clears. */
  gotoLine: number | null;
  /** Whether the workspace-level problems panel is visible. */
  problemsOpen: boolean;
  /** Scroll ratio 0–1 for editor ↔ preview sync. */
  scrollRatio: number;
  /** Which side last drove scroll sync. */
  scrollSource: "editor" | "preview" | null;
};

export function getVault(): Vault { return getContext<Vault>("vault"); }
export function getTheme(): Theme { return getContext<Theme>("theme"); }
export function getSettings(): Settings { return getContext<Settings>("settings"); }
export function getRegistry(): Registry { return getContext<Registry>("registry"); }
export function getKeybindings(): Keybindings { return getContext<Keybindings>("keybindings"); }
export function getUI(): UIState { return getContext<UIState>("ui"); }
import type { ComponentType, LazyExoticComponent } from "react";

import type { Command } from "@/application/commands/registry";
import type { WorkspaceController } from "@/application/workspace-controller";
import type { SidebarView } from "@/application/workspace-state";

export const WORKSPACE_PLUGIN_API_VERSION = 1 as const;

export type WorkspaceCapability =
  | "files"
  | "compile"
  | "data"
  | "packages"
  | "session"
  | "preview"
  | "ai";

export const WORKSPACE_CAPABILITIES: readonly WorkspaceCapability[] = [
  "files",
  "compile",
  "data",
  "packages",
  "session",
  "preview",
  "ai",
];

export interface WorkspacePluginCommandContext {
  controller: WorkspaceController;
  openPalette(mode: "commands" | "files"): void;
  problemsOpen: boolean;
}

export interface WorkspacePluginActivationContext {
  controller: WorkspaceController;
  capabilities: ReadonlySet<WorkspaceCapability>;
}

export type WorkspaceEntryDialogRequest =
  | { kind: "file" | "folder"; parent: string }
  | { kind: "rename"; path: string; name: string };

export interface WorkspaceViewProps {
  requestEntryDialog(request: WorkspaceEntryDialogRequest): void;
}

export interface WorkspaceViewContribution {
  id: SidebarView;
  label: string;
  icon: ComponentType<{ className?: string }>;
  location: "panel" | "page";
  placement: "primary" | "footer";
  component: LazyExoticComponent<ComponentType<WorkspaceViewProps>>;
  onActivate?(controller: WorkspaceController): void;
}

export interface WorkspacePluginManifest {
  id: string;
  name: string;
  version: string;
  apiVersion: typeof WORKSPACE_PLUGIN_API_VERSION;
  requires?: readonly WorkspaceCapability[];
  activate?(context: WorkspacePluginActivationContext): void | (() => void);
  contributes: {
    views?: readonly WorkspaceViewContribution[];
    commands?(context: WorkspacePluginCommandContext): readonly Command[];
  };
}

export function defineWorkspacePlugin<const T extends WorkspacePluginManifest>(plugin: T) {
  return plugin;
}

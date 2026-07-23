import type { ComponentType, LazyExoticComponent } from "react";

import type { Command } from "@/application/commands/registry";
import type { SidebarView } from "@/application/workspace-state";

export const WORKSPACE_PLUGIN_API_VERSION = 2 as const;

export interface CapabilityToken<T> {
  readonly id: string;
  readonly _type?: T;
}

export interface PluginServiceToken<T> {
  readonly id: string;
  readonly _type?: T;
}

export function defineCapability<T>(id: string): CapabilityToken<T> {
  if (!id.trim()) throw new Error("Capability id cannot be empty");
  return Object.freeze({ id });
}

export function definePluginService<T>(id: string): PluginServiceToken<T> {
  if (!id.trim()) throw new Error("Plugin service id cannot be empty");
  return Object.freeze({ id });
}

export interface WorkspaceCapabilityHost {
  has(token: CapabilityToken<unknown>): boolean;
  get<T>(token: CapabilityToken<T>): T;
}

export interface WorkspacePluginScope {
  readonly pluginId: string;
  get<T>(token: CapabilityToken<T>): T;
  getService<T>(token: PluginServiceToken<T>): T;
}

export interface WorkspacePluginCommandContext extends WorkspacePluginScope {
  openPalette(mode: "commands" | "files"): void;
}

export interface WorkspacePluginActivationContext extends WorkspacePluginScope {
  provide<T>(token: PluginServiceToken<T>, service: T): () => void;
}

export interface WorkspaceViewContribution {
  id: SidebarView;
  label: string;
  icon: ComponentType<{ className?: string }>;
  location: "panel" | "page";
  placement: "primary" | "footer";
  component: LazyExoticComponent<ComponentType>;
  onActivate?(context: WorkspacePluginScope): void;
}

export interface WorkspacePluginManifest {
  id: string;
  name: string;
  version: string;
  apiVersion: typeof WORKSPACE_PLUGIN_API_VERSION;
  requires?: readonly CapabilityToken<unknown>[];
  activate?(context: WorkspacePluginActivationContext): void | (() => void);
  contributes: {
    views?: readonly WorkspaceViewContribution[];
    commands?(context: WorkspacePluginCommandContext): readonly Command[];
  };
}

export function defineWorkspacePlugin<const T extends WorkspacePluginManifest>(plugin: T) {
  return plugin;
}

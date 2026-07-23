import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import {
  FolderOpenIcon,
  GearSixIcon,
  ListChecksIcon,
  ListBulletsIcon,
  MagnifyingGlassIcon,
  PackageIcon,
} from "@phosphor-icons/react";

import type { SidebarView } from "@/application/workspace-state";
import type { WorkspaceController } from "@/application/workspace-controller";
import type { Command } from "@/application/commands/registry";

export type WorkspaceCapability =
  | "files"
  | "compile"
  | "data"
  | "packages"
  | "session"
  | "preview"
  | "ai";

export interface WorkspaceFeatureContribution {
  id: SidebarView;
  label: string;
  icon: ComponentType<{ className?: string }>;
  location: "panel" | "page";
  placement: "primary" | "footer";
  capabilities: WorkspaceCapability[];
  commands(context: {
    controller: WorkspaceController;
    openPalette(mode: "commands" | "files"): void;
    problemsOpen: boolean;
  }): Command[];
  component: LazyExoticComponent<ComponentType<any>>;
}

export const workspaceFeatures: WorkspaceFeatureContribution[] = [
  {
    id: "files",
    label: "Files",
    icon: FolderOpenIcon,
    location: "panel",
    placement: "primary",
    capabilities: ["files"],
    commands: ({ controller, openPalette }) => [
      {
        id: "file.quick-open",
        title: "Quick open document",
        description: "Jump to any Typst file in the vault",
        group: "Navigate",
        keybinding: "Mod+P",
        when: "hasVault",
        handler: () => openPalette("files"),
      },
      {
        id: "workspace.open",
        title: "Open vault",
        description: "Choose a local folder as the active workspace",
        group: "Workspace",
        keybinding: "Mod+O",
        handler: () => controller.openVault(),
      },
      {
        id: "file.save",
        title: "Save active document",
        group: "Document",
        keybinding: "Mod+S",
        when: "hasActiveFile",
        handler: () => controller.saveActive(),
      },
      {
        id: "file.export-pdf",
        title: "Export active document as PDF",
        group: "Document",
        keybinding: "Mod+Shift+P",
        when: "hasActiveFile",
        handler: () => controller.exportPdf(),
      },
      {
        id: "document.compile",
        title: "Compile preview now",
        group: "Document",
        keybinding: "Mod+Enter",
        when: "hasActiveFile",
        handler: () => controller.compileActive(),
      },
      {
        id: "view.editor",
        title: "Focus editor",
        group: "View",
        keybinding: "Mod+1",
        when: "hasActiveFile",
        handler: () => controller.setCompactSurface("editor"),
      },
      {
        id: "view.preview",
        title: "Focus preview",
        group: "View",
        keybinding: "Mod+2",
        when: "hasActiveFile",
        handler: () => controller.setCompactSurface("preview"),
      },
    ],
    component: lazy(() =>
      import("@/features/workspace/sidebar/files-panel").then((module) => ({
        default: module.FilesPanel,
      })),
    ),
  },
  {
    id: "search",
    label: "Search",
    icon: MagnifyingGlassIcon,
    location: "panel",
    placement: "primary",
    capabilities: ["files"],
    commands: () => [],
    component: lazy(() =>
      import("@/features/workspace/sidebar/search-panel").then((module) => ({
        default: module.SearchPanel,
      })),
    ),
  },
  {
    id: "outline",
    label: "Structure",
    icon: ListBulletsIcon,
    location: "panel",
    placement: "primary",
    capabilities: ["files"],
    commands: ({ controller, problemsOpen }) => [
      {
        id: "view.problems",
        title: problemsOpen ? "Hide problems" : "Show problems",
        group: "View",
        keybinding: "Mod+J",
        when: "hasActiveFile",
        handler: () => controller.setProblemsOpen(!problemsOpen),
      },
    ],
    component: lazy(() =>
      import("@/features/workspace/sidebar/outline-panel").then((module) => ({
        default: module.OutlinePanel,
      })),
    ),
  },
  {
    id: "tasks",
    label: "AI tasks",
    icon: ListChecksIcon,
    location: "page",
    placement: "primary",
    capabilities: ["ai", "files", "compile"],
    commands: () => [],
    component: lazy(() =>
      import("@/features/tasks/tasks-page").then((module) => ({ default: module.TasksPage })),
    ),
  },
  {
    id: "packages",
    label: "Packages",
    icon: PackageIcon,
    location: "page",
    placement: "primary",
    capabilities: ["packages", "compile"],
    commands: () => [],
    component: lazy(() =>
      import("@/features/packages/package-manager-page").then((module) => ({
        default: module.PackageManagerPage,
      })),
    ),
  },
  {
    id: "settings",
    label: "Settings",
    icon: GearSixIcon,
    location: "page",
    placement: "footer",
    capabilities: ["session", "compile", "ai", "packages"],
    commands: () => [],
    component: lazy(() =>
      import("@/features/settings/settings-page").then((module) => ({
        default: module.SettingsPage,
      })),
    ),
  },
];

export function workspaceFeature(id: SidebarView) {
  return workspaceFeatures.find((feature) => feature.id === id) ?? workspaceFeatures[0];
}

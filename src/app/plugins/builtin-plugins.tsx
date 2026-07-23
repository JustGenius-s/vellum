import { lazy } from "react";
import {
  FolderOpenIcon,
  GearSixIcon,
  ListChecksIcon,
  ListBulletsIcon,
  MagnifyingGlassIcon,
  PackageIcon,
} from "@phosphor-icons/react";

import {
  defineWorkspacePlugin,
  WORKSPACE_PLUGIN_API_VERSION,
  type WorkspacePluginManifest,
} from "@/app/plugins/plugin-api";

const documentsPlugin = defineWorkspacePlugin({
  id: "vellum.documents",
  name: "Documents",
  version: "1.0.0",
  apiVersion: WORKSPACE_PLUGIN_API_VERSION,
  requires: ["files", "compile", "preview", "session"],
  contributes: {
    views: [
      {
        id: "files",
        label: "Files",
        icon: FolderOpenIcon,
        location: "panel",
        placement: "primary",
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
        component: lazy(() =>
          import("@/features/workspace/sidebar/outline-panel").then((module) => ({
            default: module.OutlinePanel,
          })),
        ),
      },
    ],
    commands: ({ controller, openPalette, problemsOpen }) => [
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
      {
        id: "view.problems",
        title: problemsOpen ? "Hide problems" : "Show problems",
        group: "View",
        keybinding: "Mod+J",
        when: "hasActiveFile",
        handler: () => controller.setProblemsOpen(!problemsOpen),
      },
    ],
  },
});

const tasksPlugin = defineWorkspacePlugin({
  id: "vellum.tasks",
  name: "AI tasks",
  version: "1.0.0",
  apiVersion: WORKSPACE_PLUGIN_API_VERSION,
  requires: ["ai", "files", "compile"],
  contributes: {
    views: [
      {
        id: "tasks",
        label: "AI tasks",
        icon: ListChecksIcon,
        location: "page",
        placement: "primary",
        component: lazy(() =>
          import("@/features/tasks/tasks-page").then((module) => ({
            default: module.TasksPage,
          })),
        ),
      },
    ],
  },
});

const packagesPlugin = defineWorkspacePlugin({
  id: "vellum.packages",
  name: "Typst packages",
  version: "1.0.0",
  apiVersion: WORKSPACE_PLUGIN_API_VERSION,
  requires: ["packages", "compile"],
  contributes: {
    views: [
      {
        id: "packages",
        label: "Packages",
        icon: PackageIcon,
        location: "page",
        placement: "primary",
        onActivate: (controller) => controller.ensurePackagesLoaded(),
        component: lazy(() =>
          import("@/features/packages/package-manager-page").then((module) => ({
            default: module.PackageManagerPage,
          })),
        ),
      },
    ],
  },
});

const settingsPlugin = defineWorkspacePlugin({
  id: "vellum.settings",
  name: "Settings",
  version: "1.0.0",
  apiVersion: WORKSPACE_PLUGIN_API_VERSION,
  requires: ["session", "compile", "ai", "packages"],
  contributes: {
    views: [
      {
        id: "settings",
        label: "Settings",
        icon: GearSixIcon,
        location: "page",
        placement: "footer",
        component: lazy(() =>
          import("@/features/settings/settings-page").then((module) => ({
            default: module.SettingsPage,
          })),
        ),
      },
    ],
  },
});

export const builtinWorkspacePlugins: readonly WorkspacePluginManifest[] = [
  documentsPlugin,
  tasksPlugin,
  packagesPlugin,
  settingsPlugin,
];

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
  AI_CAPABILITY,
  COMPILE_CAPABILITY,
  DATA_CAPABILITY,
  DOCUMENTS_CAPABILITY,
  FILES_CAPABILITY,
  PACKAGES_CAPABILITY,
  PREVIEW_CAPABILITY,
  SESSION_CAPABILITY,
  SETTINGS_CAPABILITY,
  WORKBENCH_CAPABILITY,
} from "@/app/plugins/capabilities";
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
  requires: [
    FILES_CAPABILITY,
    DOCUMENTS_CAPABILITY,
    COMPILE_CAPABILITY,
    WORKBENCH_CAPABILITY,
    PREVIEW_CAPABILITY,
    SESSION_CAPABILITY,
  ],
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
    commands: ({ get, openPalette }) => {
      const files = get(FILES_CAPABILITY);
      const documents = get(DOCUMENTS_CAPABILITY);
      const compile = get(COMPILE_CAPABILITY);
      const workbench = get(WORKBENCH_CAPABILITY);
      const { problemsOpen } = workbench.getSnapshot();
      return [
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
          handler: () => files.openVault(),
        },
        {
          id: "file.save",
          title: "Save active document",
          group: "Document",
          keybinding: "Mod+S",
          when: "hasActiveFile",
          handler: () => documents.saveActive(),
        },
        {
          id: "file.export-pdf",
          title: "Export active document as PDF",
          group: "Document",
          keybinding: "Mod+Shift+P",
          when: "hasActiveFile",
          handler: () => compile.exportPdf(),
        },
        {
          id: "document.compile",
          title: "Compile preview now",
          group: "Document",
          keybinding: "Mod+Enter",
          when: "hasActiveFile",
          handler: () => compile.compileActive(),
        },
        {
          id: "view.editor",
          title: "Focus editor",
          group: "View",
          keybinding: "Mod+1",
          when: "hasActiveFile",
          handler: () => workbench.setCompactSurface("editor"),
        },
        {
          id: "view.preview",
          title: "Focus preview",
          group: "View",
          keybinding: "Mod+2",
          when: "hasActiveFile",
          handler: () => workbench.setCompactSurface("preview"),
        },
        {
          id: "view.problems",
          title: problemsOpen ? "Hide problems" : "Show problems",
          group: "View",
          keybinding: "Mod+J",
          when: "hasActiveFile",
          handler: () => workbench.setProblemsOpen(!problemsOpen),
        },
      ];
    },
  },
});

const tasksPlugin = defineWorkspacePlugin({
  id: "vellum.tasks",
  name: "AI tasks",
  version: "1.0.0",
  apiVersion: WORKSPACE_PLUGIN_API_VERSION,
  requires: [AI_CAPABILITY, FILES_CAPABILITY, COMPILE_CAPABILITY],
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
  requires: [PACKAGES_CAPABILITY, COMPILE_CAPABILITY],
  contributes: {
    views: [
      {
        id: "packages",
        label: "Packages",
        icon: PackageIcon,
        location: "page",
        placement: "primary",
        onActivate: ({ get }) => get(PACKAGES_CAPABILITY).ensureLoaded(),
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
  requires: [
    SETTINGS_CAPABILITY,
    FILES_CAPABILITY,
    SESSION_CAPABILITY,
    COMPILE_CAPABILITY,
    AI_CAPABILITY,
    PACKAGES_CAPABILITY,
    DATA_CAPABILITY,
  ],
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

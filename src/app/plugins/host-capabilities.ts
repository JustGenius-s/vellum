import { WorkspaceCapabilityRegistry } from "@/app/plugins/capability-registry";
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
  type PluginStore,
} from "@/app/plugins/capabilities";
import type { WorkspaceController } from "@/application/workspace-controller";
import type { WorkspaceState } from "@/application/workspace-state";

function shallowEqual<T extends Record<string, unknown>>(left: T, right: T) {
  if (Object.is(left, right)) return true;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => Object.is(left[key], right[key]));
}

function createSelectorStore<T extends Record<string, unknown>>(
  controller: WorkspaceController,
  selector: (state: WorkspaceState) => T,
): PluginStore<T> {
  let source = controller.getSnapshot();
  let snapshot = selector(source);
  return {
    subscribe: controller.subscribe,
    getSnapshot: () => {
      const nextSource = controller.getSnapshot();
      if (nextSource === source) return snapshot;
      source = nextSource;
      const nextSnapshot = selector(nextSource);
      if (!shallowEqual(snapshot, nextSnapshot)) snapshot = nextSnapshot;
      return snapshot;
    },
  };
}

export function createWorkspaceCapabilityHost(controller: WorkspaceController) {
  const host = new WorkspaceCapabilityRegistry();
  const filesStore = createSelectorStore(controller, (state) => ({
    activePath: state.activePath,
    phase: state.phase,
    tree: state.tree,
    vaultPath: state.vaultPath,
  }));
  const documentsStore = createSelectorStore(controller, (state) => ({
    activePath: state.activePath,
    tabs: state.tabs,
  }));
  const workbenchStore = createSelectorStore(controller, (state) => ({
    compactSurface: state.compactSurface,
    problemsOpen: state.problemsOpen,
    sidebarView: state.sidebarView,
  }));
  const settingsStore = createSelectorStore(controller, (state) => ({
    aiApiKey: state.aiApiKey,
    aiBaseUrl: state.aiBaseUrl,
    aiModel: state.aiModel,
    cjkFont: state.cjkFont,
    fontCatalog: state.fontCatalog,
    fontsPending: state.fontsPending,
    latinFont: state.latinFont,
    vaultPath: state.vaultPath,
  }));

  host.provide(FILES_CAPABILITY, {
    ...filesStore,
    openVault: () => controller.openVault(),
    refreshTree: () => controller.refreshTree(),
    openFile: (path, line) => controller.openFile(path, line),
    createEntry: (parent, name, isDir) => controller.createEntry(parent, name, isDir),
    renameEntry: (path, name) => controller.renameEntry(path, name),
    deleteEntry: (path) => controller.deleteEntry(path),
  });
  host.provide(DOCUMENTS_CAPABILITY, {
    ...documentsStore,
    readText: (path) => controller.readDocumentText(path),
    getCursorOffset: (path) => controller.getCursorOffset(path),
    applyEdit: (edit) => controller.applyDocumentEdit(edit),
    openFile: (path, line) => controller.openFile(path, line),
    saveActive: () => controller.saveActive(),
  });
  host.provide(WORKBENCH_CAPABILITY, {
    ...workbenchStore,
    setCompactSurface: (surface) => controller.setCompactSurface(surface),
    setProblemsOpen: (open) => controller.setProblemsOpen(open),
    setSidebarView: (viewId) => controller.setSidebarView(viewId),
  });
  host.provide(COMPILE_CAPABILITY, {
    compileActive: () => controller.compileActive(),
    exportPdf: () => controller.exportPdf(),
  });
  host.provide(PACKAGES_CAPABILITY, {
    ensureLoaded: () => controller.ensurePackagesLoaded(),
  });
  host.provide(SETTINGS_CAPABILITY, {
    ...settingsStore,
    setFontPreference: (kind, family) => controller.setFontPreference(kind, family),
    setAiBaseUrl: (value) => controller.setAiBaseUrl(value),
    setAiModel: (value) => controller.setAiModel(value),
    setAiApiKey: (value) => controller.setAiApiKey(value),
  });

  const available = Object.freeze({ available: true as const });
  host.provide(DATA_CAPABILITY, available);
  host.provide(SESSION_CAPABILITY, available);
  host.provide(PREVIEW_CAPABILITY, available);
  host.provide(AI_CAPABILITY, available);
  return host;
}

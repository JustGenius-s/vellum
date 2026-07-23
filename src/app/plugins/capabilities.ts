import { defineCapability } from "@/app/plugins/plugin-api";
import type { DocumentEdit } from "@/application/document-edit";
import type { CompactSurface, WorkspacePhase } from "@/application/workspace-state";
import type { DocumentTab, FontCatalog, TreeNode } from "@/domain/workspace";

export interface PluginStore<T> {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => T;
}

export interface FilesCapabilitySnapshot {
  activePath: string;
  phase: WorkspacePhase;
  tree: TreeNode[];
  vaultPath: string;
}

export interface FilesCapability extends PluginStore<FilesCapabilitySnapshot> {
  openVault(): Promise<void>;
  refreshTree(): Promise<void>;
  openFile(path: string, line?: number): Promise<void>;
  createEntry(parent: string, name: string, isDir: boolean): Promise<void>;
  renameEntry(path: string, name: string): Promise<void>;
  deleteEntry(path: string): Promise<void>;
}

export interface DocumentsCapabilitySnapshot {
  activePath: string;
  tabs: DocumentTab[];
}

export interface DocumentsCapability extends PluginStore<DocumentsCapabilitySnapshot> {
  readText(path: string): Promise<string>;
  getCursorOffset(path: string): number | null;
  applyEdit(edit: DocumentEdit): Promise<number>;
  openFile(path: string, line?: number): Promise<void>;
  saveActive(): Promise<void>;
}

export interface WorkbenchCapabilitySnapshot {
  compactSurface: CompactSurface;
  problemsOpen: boolean;
  sidebarView: string;
}

export interface WorkbenchCapability extends PluginStore<WorkbenchCapabilitySnapshot> {
  setCompactSurface(surface: CompactSurface): void;
  setProblemsOpen(open: boolean): void;
  setSidebarView(viewId: string): void;
}

export interface CompileCapability {
  compileActive(): Promise<void>;
  exportPdf(): Promise<void>;
}

export interface PackagesCapability {
  ensureLoaded(): void;
}

export interface SettingsCapabilitySnapshot {
  aiApiKey: string;
  aiBaseUrl: string;
  aiModel: string;
  cjkFont: string;
  fontCatalog: FontCatalog;
  fontsPending: boolean;
  latinFont: string;
  vaultPath: string;
}

export interface SettingsCapability extends PluginStore<SettingsCapabilitySnapshot> {
  setFontPreference(kind: "latin" | "cjk", family: string): void;
  setAiBaseUrl(value: string): void;
  setAiModel(value: string): void;
  setAiApiKey(value: string): void;
}

export interface AvailabilityCapability {
  readonly available: true;
}

export const FILES_CAPABILITY = defineCapability<FilesCapability>("vellum.files");
export const DOCUMENTS_CAPABILITY = defineCapability<DocumentsCapability>("vellum.documents");
export const WORKBENCH_CAPABILITY = defineCapability<WorkbenchCapability>("vellum.workbench");
export const COMPILE_CAPABILITY = defineCapability<CompileCapability>("vellum.compile");
export const PACKAGES_CAPABILITY = defineCapability<PackagesCapability>("vellum.packages");
export const SETTINGS_CAPABILITY = defineCapability<SettingsCapability>("vellum.settings");
export const DATA_CAPABILITY = defineCapability<AvailabilityCapability>("vellum.data");
export const SESSION_CAPABILITY = defineCapability<AvailabilityCapability>("vellum.session");
export const PREVIEW_CAPABILITY = defineCapability<AvailabilityCapability>("vellum.preview");
export const AI_CAPABILITY = defineCapability<AvailabilityCapability>("vellum.ai");

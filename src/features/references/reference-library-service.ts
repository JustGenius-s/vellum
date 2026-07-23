import {
  definePluginService,
  type WorkspacePluginActivationContext,
} from "@/app/plugins/plugin-api";
import {
  DOCUMENTS_CAPABILITY,
  FILES_CAPABILITY,
  type DocumentsCapability,
  type FilesCapability,
  type PluginStore,
} from "@/app/plugins/capabilities";
import {
  markDuplicateKeys,
  normalizeBibtexLibrary,
  type ReferenceCatalog,
  type ReferenceItem,
  type ReferenceIssue,
  type ReferenceSource,
} from "@/domain/bibliography";
import { flattenFiles, relativePath } from "@/domain/workspace";

export interface ReferenceLibrarySnapshot extends ReferenceCatalog {
  readonly status: "idle" | "loading" | "ready";
  readonly revision: number;
}

export interface ReferenceLibraryService extends PluginStore<ReferenceLibrarySnapshot> {
  refresh(): Promise<void>;
  dispose(): void;
}

export const REFERENCE_LIBRARY_SERVICE = definePluginService<ReferenceLibraryService>(
  "vellum.references.library",
);

function isBibtexPath(path: string) {
  return path.toLowerCase().endsWith(".bib");
}

function issueMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function sourceFingerprint(files: FilesCapability, documents: DocumentsCapability) {
  const fileState = files.getSnapshot();
  const documentState = documents.getSnapshot();
  const paths = flattenFiles(fileState.tree)
    .filter((node) => !node.isDir && isBibtexPath(node.path))
    .map((node) => node.path)
    .sort();
  const tabRevisions = documentState.tabs
    .filter((tab) => isBibtexPath(tab.path))
    .map((tab) => `${tab.path}:${tab.revision}`)
    .sort();
  return [fileState.vaultPath, ...paths, ...tabRevisions].join("\u0000");
}

export function createReferenceLibraryService(
  files: FilesCapability,
  documents: DocumentsCapability,
): ReferenceLibraryService {
  const listeners = new Set<() => void>();
  const disposals = [files.subscribe(onDependencyChange), documents.subscribe(onDependencyChange)];
  let fingerprint = "";
  let tree = files.getSnapshot().tree;
  let generation = 0;
  let active = false;
  let disposed = false;
  let snapshot: ReferenceLibrarySnapshot = {
    status: "idle",
    revision: 0,
    items: [],
    sources: [],
    issues: [],
  };

  function publish(next: Omit<ReferenceLibrarySnapshot, "revision">) {
    snapshot = { ...next, revision: snapshot.revision + 1 };
    listeners.forEach((listener) => listener());
  }

  function onDependencyChange() {
    const nextTree = files.getSnapshot().tree;
    const treeChanged = nextTree !== tree;
    tree = nextTree;
    const nextFingerprint = sourceFingerprint(files, documents);
    if (nextFingerprint === fingerprint && !treeChanged) return;
    fingerprint = nextFingerprint;
    if (!active) return;
    void refresh();
  }

  async function refresh() {
    if (disposed) return;
    active = true;
    const request = ++generation;
    fingerprint = sourceFingerprint(files, documents);
    publish({ ...snapshot, status: "loading" });

    const fileState = files.getSnapshot();
    const sourcePaths = flattenFiles(fileState.tree)
      .filter((node) => !node.isDir && isBibtexPath(node.path))
      .sort((left, right) => left.path.localeCompare(right.path))
      .map((node) => node.path);
    const sources: ReferenceSource[] = [];
    const items: ReferenceItem[] = [];
    const issues: ReferenceIssue[] = [];

    for (const path of sourcePaths) {
      if (request !== generation) return;
      try {
        const input = await documents.readText(path);
        const { parseAsync } = await import("@retorquere/bibtex-parser");
        const library = await parseAsync(input);
        const source = {
          path,
          relativePath: relativePath(path, fileState.vaultPath),
          entryCount: library.entries.filter((entry) => entry.key.trim()).length,
        } satisfies ReferenceSource;
        sources.push(source);
        const normalizedItems = normalizeBibtexLibrary(library, source, input);
        items.push(...normalizedItems);
        library.errors.forEach((error) => {
          if (error.error) issues.push({ path, message: error.error });
        });
      } catch (error) {
        sources.push({
          path,
          relativePath: relativePath(path, fileState.vaultPath),
          entryCount: 0,
        });
        issues.push({ path, message: issueMessage(error) });
      }
    }

    if (request !== generation) return;
    publish({ status: "ready", items: markDuplicateKeys(items), sources, issues });
  }

  const service: ReferenceLibraryService = {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    refresh,
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      disposals.forEach((dispose) => dispose());
      listeners.clear();
    },
  };

  return service;
}

export function activateReferenceLibraryService(context: WorkspacePluginActivationContext) {
  const files = context.get(FILES_CAPABILITY);
  const documents = context.get(DOCUMENTS_CAPABILITY);
  const service = createReferenceLibraryService(files, documents);
  const release = context.provide(REFERENCE_LIBRARY_SERVICE, service);
  return () => {
    service.dispose();
    release();
  };
}

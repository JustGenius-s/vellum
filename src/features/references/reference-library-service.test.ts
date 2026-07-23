import { describe, expect, it } from "vite-plus/test";

import type {
  DocumentsCapability,
  DocumentsCapabilitySnapshot,
  FilesCapability,
  FilesCapabilitySnapshot,
} from "@/app/plugins/capabilities";
import { createReferenceLibraryService } from "@/features/references/reference-library-service";

function store<T>(snapshot: T) {
  return {
    subscribe: () => () => undefined,
    getSnapshot: () => snapshot,
  };
}

describe("reference library service", () => {
  it("aggregates BibTeX files, marks duplicates, and isolates source errors", async () => {
    const files = {
      ...store<FilesCapabilitySnapshot>({
        activePath: "",
        phase: "ready",
        vaultPath: "/vault",
        tree: [
          { name: "first.bib", path: "/vault/first.bib", isDir: false, children: [] },
          { name: "second.bib", path: "/vault/second.bib", isDir: false, children: [] },
          { name: "broken.bib", path: "/vault/broken.bib", isDir: false, children: [] },
        ],
      }),
      openVault: async () => undefined,
      refreshTree: async () => undefined,
      openFile: async () => undefined,
      createEntry: async () => undefined,
      renameEntry: async () => undefined,
      deleteEntry: async () => undefined,
    } satisfies FilesCapability;
    const documents = {
      ...store<DocumentsCapabilitySnapshot>({ activePath: "", tabs: [] }),
      readText: async (path: string) => {
        if (path.endsWith("broken.bib")) throw new Error("Cannot read bibliography");
        const title = path.endsWith("first.bib") ? "First paper" : "Second paper";
        return `@article{shared, title={${title}}, author={Doe, Jane}, year={2024}}`;
      },
      getCursorOffset: () => null,
      applyEdit: async () => 0,
      openFile: async () => undefined,
      saveActive: async () => undefined,
    } satisfies DocumentsCapability;
    const service = createReferenceLibraryService(files, documents);

    await service.refresh();

    const snapshot = service.getSnapshot();
    expect(snapshot.status).toBe("ready");
    expect(snapshot.items.map((item) => item.title)).toEqual(["First paper", "Second paper"]);
    expect(snapshot.items.every((item) => item.duplicateKey)).toBe(true);
    expect(snapshot.issues).toEqual([
      { path: "/vault/broken.bib", message: "Cannot read bibliography" },
    ]);
    service.dispose();
  });
});

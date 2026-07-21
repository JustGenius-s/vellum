import { describe, expect, it } from "vite-plus/test";

import {
  documentFormat,
  fileStem,
  parseOutline,
  resolveDocumentTarget,
  type TreeNode,
} from "@/domain/workspace";

describe("document formats", () => {
  it("recognizes supported document names", () => {
    expect(fileStem("notes/main.typ")).toBe("main");
    expect(fileStem("notes/draft.md")).toBe("draft");
    expect(fileStem("notes/references.bib")).toBe("references");
    expect(documentFormat("notes/draft.md")).toBe("markdown");
    expect(documentFormat("notes/main.typ")).toBe("typst");
    expect(documentFormat("notes/references.BIB")).toBe("bibliography");
  });

  it("parses headings from both syntaxes", () => {
    expect(parseOutline("# Markdown\n\n## Detail")).toMatchObject([
      { level: 1, title: "Markdown", line: 1 },
      { level: 2, title: "Detail", line: 3 },
    ]);
    expect(parseOutline("= Typst\n\n== Detail")).toMatchObject([
      { level: 1, title: "Typst", line: 1 },
      { level: 2, title: "Detail", line: 3 },
    ]);
  });
});

describe("document targets", () => {
  const vaultPath = "/vault";
  const tree: TreeNode[] = [
    { name: "atlas.typ", path: "/vault/atlas.typ", isDir: false, children: [] },
    { name: "method.typ", path: "/vault/method.typ", isDir: false, children: [] },
    { name: "systems.typ", path: "/vault/systems.typ", isDir: false, children: [] },
    {
      name: "reading",
      path: "/vault/reading",
      isDir: true,
      children: [
        {
          name: "systems.typ",
          path: "/vault/reading/systems.typ",
          isDir: false,
          children: [],
        },
      ],
    },
    {
      name: "drafts",
      path: "/vault/drafts",
      isDir: true,
      children: [
        { name: "shared.typ", path: "/vault/drafts/shared.typ", isDir: false, children: [] },
      ],
    },
    {
      name: "notes",
      path: "/vault/notes",
      isDir: true,
      children: [
        { name: "shared.md", path: "/vault/notes/shared.md", isDir: false, children: [] },
      ],
    },
  ];

  it("resolves root, relative, extensionless, and anchored links inside the vault", () => {
    expect(resolveDocumentTarget(tree, "reading/systems.typ", "/vault/atlas.typ", vaultPath)).toBe(
      "/vault/reading/systems.typ",
    );
    expect(resolveDocumentTarget(tree, "../method.typ", "/vault/reading/systems.typ", vaultPath)).toBe(
      "/vault/method.typ",
    );
    expect(resolveDocumentTarget(tree, "atlas.typ#introduction", "/vault/method.typ", vaultPath)).toBe(
      "/vault/atlas.typ",
    );
    expect(resolveDocumentTarget(tree, "systems", "/vault/atlas.typ", vaultPath)).toBe(
      "/vault/systems.typ",
    );
    expect(resolveDocumentTarget(tree, "systems", "/vault/reading/systems.typ", vaultPath)).toBe(
      "/vault/reading/systems.typ",
    );
  });

  it("does not guess when a stem is missing or ambiguous", () => {
    expect(resolveDocumentTarget(tree, "shared", "/vault/atlas.typ", vaultPath)).toBeNull();
    expect(resolveDocumentTarget(tree, "missing.typ", "/vault/atlas.typ", vaultPath)).toBeNull();
  });
});

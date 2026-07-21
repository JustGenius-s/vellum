import { describe, expect, it } from "vite-plus/test";

import { resolveFileTypeIconKind } from "@/components/ui/file-type-icon";

describe("file type icons", () => {
  it("maps supported document extensions", () => {
    expect(resolveFileTypeIconKind("paper.typ")).toBe("typst");
    expect(resolveFileTypeIconKind("README.MD")).toBe("markdown");
    expect(resolveFileTypeIconKind("references.bib")).toBe("bibliography");
  });

  it("leaves unknown files to the fallback icon", () => {
    expect(resolveFileTypeIconKind("notes.txt")).toBe("generic");
    expect(resolveFileTypeIconKind("LICENSE")).toBe("generic");
  });
});

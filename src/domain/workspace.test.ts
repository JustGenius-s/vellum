import { describe, expect, it } from "vite-plus/test";

import { documentFormat, fileStem, parseOutline } from "@/domain/workspace";

describe("document formats", () => {
  it("recognizes Typst and Markdown document names", () => {
    expect(fileStem("notes/main.typ")).toBe("main");
    expect(fileStem("notes/draft.md")).toBe("draft");
    expect(documentFormat("notes/draft.md")).toBe("markdown");
    expect(documentFormat("notes/main.typ")).toBe("typst");
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

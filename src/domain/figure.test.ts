import { describe, expect, it } from "vite-plus/test";

import { figureReference, insertFigureReference, relativeFilePath } from "@/domain/figure";

describe("figure references", () => {
  it("builds paths relative to a Typst document", () => {
    expect(relativeFilePath("/vault/figures/result/chart.typ", "/vault/chapters")).toBe(
      "../figures/result/chart.typ",
    );
    expect(
      figureReference(
        "/vault/chapters/results.typ",
        "/vault/figures/result/chart.typ",
        "result",
      ),
    ).toContain('#include "../figures/result/chart.typ"');
  });

  it("uses vault-relative embeds for Markdown and inserts after the cursor line", () => {
    expect(
      figureReference(
        "/vault/notes/results.md",
        "/vault/figures/result/chart.typ",
        "result",
      ),
    ).toBe("![[../figures/result/chart.typ]]");
    expect(insertFigureReference("first\nsecond\n", "#include \"chart.typ\"", "cursor", 2)).toBe(
      'first\n\n#include "chart.typ"\n\nsecond\n',
    );
  });
});

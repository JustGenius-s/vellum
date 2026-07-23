import { Text } from "@codemirror/state";
import { describe, expect, it } from "vite-plus/test";

import { applyDocumentChanges } from "@/application/document-edit";

describe("document edits", () => {
  it("applies multiple ranges against one document revision", () => {
    const document = Text.of(["alpha beta"]);
    const result = applyDocumentChanges(document, [
      { from: 6, to: 10, insert: "gamma" },
      { from: 0, to: 5, insert: "one" },
    ]);
    expect(result.toString()).toBe("one gamma");
  });

  it("rejects invalid and overlapping ranges", () => {
    const document = Text.of(["abcdef"]);
    expect(() =>
      applyDocumentChanges(document, [
        { from: 1, to: 4, insert: "x" },
        { from: 3, to: 5, insert: "y" },
      ]),
    ).toThrow("cannot overlap");
    expect(() =>
      applyDocumentChanges(document, [{ from: 2, to: 9, insert: "x" }]),
    ).toThrow("Invalid document edit range");
  });
});

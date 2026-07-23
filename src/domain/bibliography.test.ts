import { describe, expect, it } from "vite-plus/test";
import {
  insertCitationReference,
  markDuplicateKeys,
  normalizeBibtexLibrary,
  searchReferences,
} from "@/domain/bibliography";

const source = { path: "/vault/references.bib", relativePath: "references.bib", entryCount: 1 };

describe("bibliography normalization", () => {
  it("normalizes parser entries and preserves source lines", () => {
    const input = `@article{doe2024,\n  title = {A useful title},\n  author = {Doe, Jane and Smith, John},\n  year = {2024},\n  journal = {Journal of Tests}\n}`;
    const library = {
      entries: [
        {
          type: "article",
          key: "doe2024",
          fields: {
            title: "A useful title",
            author: [
              { lastName: "Doe", firstName: "Jane" },
              { lastName: "Smith", firstName: "John" },
            ],
            year: "2024",
            journal: "Journal of Tests",
          },
          input,
        },
      ],
      errors: [],
    };
    const [item] = normalizeBibtexLibrary(library, source, input);
    expect(item.title).toBe("A useful title");
    expect(item.authors.map((author) => author.name)).toEqual(["Jane Doe", "John Smith"]);
    expect(item.line).toBe(1);
    expect(item.container).toBe("Journal of Tests");
  });

  it("marks duplicate keys across source files and searches all display fields", () => {
    const first = normalizeBibtexLibrary(
      { entries: [{ type: "book", key: "same", fields: { title: "A book" } }], errors: [] },
      source,
      "@book{same,title={A book}}",
    )[0];
    const second = normalizeBibtexLibrary(
      { entries: [{ type: "article", key: "same", fields: { title: "A paper" } }], errors: [] },
      { ...source, path: "/vault/other.bib", relativePath: "other.bib" },
      "@article{same,title={A paper}}",
    )[0];
    const items = markDuplicateKeys([first, second]);
    expect(items.every((item) => item.duplicateKey)).toBe(true);
    expect(searchReferences(items, "paper").map((item) => item.title)).toEqual(["A paper"]);
  });

  it("inserts a citation at the cursor without merging into adjacent words", () => {
    expect(insertCitationReference("See.results.", "doe2024", 3)).toEqual({
      from: 3,
      to: 3,
      insert: " @doe2024 ",
      selectionAfter: 12,
    });
    expect(insertCitationReference("See ", "doe2024", null).insert).toBe("@doe2024");
  });
});

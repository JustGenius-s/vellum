import type { BibtexCreator, BibtexEntry, BibtexLibrary } from "@retorquere/bibtex-parser";

export interface ReferencePerson {
  readonly given: string;
  readonly family: string;
  readonly name: string;
}

export interface ReferenceSource {
  readonly path: string;
  readonly relativePath: string;
  readonly entryCount: number;
}

export interface ReferenceItem {
  readonly id: string;
  readonly key: string;
  readonly type: string;
  readonly title: string;
  readonly authors: readonly ReferencePerson[];
  readonly year: string;
  readonly container: string;
  readonly doi: string;
  readonly url: string;
  readonly fields: Readonly<Record<string, string>>;
  readonly source: ReferenceSource;
  readonly line: number;
  readonly duplicateKey: boolean;
}

export interface ReferenceIssue {
  readonly path: string;
  readonly message: string;
}

export interface ReferenceCatalog {
  readonly items: readonly ReferenceItem[];
  readonly sources: readonly ReferenceSource[];
  readonly issues: readonly ReferenceIssue[];
}

function textValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map((item) => textValue(item)).filter(Boolean).join(", ");
  if (value && typeof value === "object") {
    const creator = value as BibtexCreator;
    return [creator.firstName, creator.lastName, creator.name].filter(Boolean).join(" ").trim();
  }
  return "";
}

function creatorName(creator: BibtexCreator): ReferencePerson {
  const given = creator.firstName?.trim() ?? "";
  const family = creator.lastName?.trim() ?? "";
  const name = creator.name?.trim() || [given, family].filter(Boolean).join(" ") || "Unknown author";
  return { given, family, name };
}

function fieldValue(entry: BibtexEntry, name: string) {
  return textValue(entry.fields[name.toLowerCase()]);
}

export function entryLine(source: string, entry: Pick<BibtexEntry, "type" | "key" | "input">, from = 0) {
  const input = entry.input?.trim();
  const escapedKey = entry.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`@${entry.type}\\s*[({]\\s*${escapedKey}\\s*[,}]`, "i");
  const match = pattern.exec(source.slice(from));
  const start = match ? from + match.index : input ? source.indexOf(input, from) : -1;
  if (start < 0) return 1;
  return source.slice(0, start).split("\n").length;
}

export function normalizeBibtexLibrary(
  library: BibtexLibrary,
  source: ReferenceSource,
  input: string,
): ReferenceItem[] {
  let searchFrom = 0;
  return library.entries
    .filter((entry) => entry.key.trim())
    .map((entry, index) => {
      const fields = Object.fromEntries(
        Object.entries(entry.fields).map(([name, value]) => [name, textValue(value)]),
      );
      const rawAuthors = entry.fields.author ?? entry.fields.editor ?? [];
      const authors = Array.isArray(rawAuthors)
        ? rawAuthors.map((creator) =>
            typeof creator === "string" ? creatorName({ name: creator }) : creatorName(creator),
          )
        : rawAuthors
          ? [creatorName({ name: textValue(rawAuthors) })]
          : [];
      const line = entryLine(input, entry, searchFrom);
      const rawInput = entry.input?.trim();
      const foundInput = rawInput ? input.indexOf(rawInput, searchFrom) : -1;
      searchFrom = foundInput >= 0 && rawInput ? foundInput + rawInput.length : searchFrom;
      const title = fieldValue(entry, "title") || entry.key;
      const year = fieldValue(entry, "year") || fieldValue(entry, "date").slice(0, 4);
      return {
        id: `${source.path}:${entry.key}:${line}:${index}`,
        key: entry.key,
        type: entry.type,
        title,
        authors,
        year,
        container: fieldValue(entry, "journal") || fieldValue(entry, "booktitle") || fieldValue(entry, "publisher"),
        doi: fieldValue(entry, "doi"),
        url: fieldValue(entry, "url"),
        fields,
        source,
        line,
        duplicateKey: false,
      } satisfies ReferenceItem;
    });
}

export function markDuplicateKeys(items: readonly ReferenceItem[]) {
  const counts = new Map<string, number>();
  items.forEach((item) => counts.set(item.key.toLowerCase(), (counts.get(item.key.toLowerCase()) ?? 0) + 1));
  return items.map((item) => ({ ...item, duplicateKey: (counts.get(item.key.toLowerCase()) ?? 0) > 1 }));
}

export function referenceSearchText(item: ReferenceItem) {
  return [
    item.key,
    item.title,
    item.type,
    item.year,
    item.container,
    item.authors.map((author) => author.name).join(" "),
    ...Object.values(item.fields),
  ]
    .join(" ")
    .toLocaleLowerCase();
}

export function searchReferences(items: readonly ReferenceItem[], query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [...items];
  return items.filter((item) => referenceSearchText(item).includes(normalized));
}

export function insertCitationReference(content: string, key: string, cursorOffset: number | null) {
  const offset = cursorOffset == null ? content.length : Math.min(Math.max(0, cursorOffset), content.length);
  const before = content[offset - 1] ?? "";
  const after = content[offset] ?? "";
  const prefix = before && !/\s/.test(before) ? " " : "";
  const suffix = after && !/\s/.test(after) ? " " : "";
  const insert = `${prefix}@${key}${suffix}`;
  return {
    from: offset,
    to: offset,
    insert,
    selectionAfter: offset + prefix.length + key.length + 1,
  };
}

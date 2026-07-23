import { ChangeSet, type Text } from "@codemirror/state";

export interface DocumentTextChange {
  from: number;
  to: number;
  insert: string;
}

export interface DocumentEdit {
  path: string;
  changes: readonly DocumentTextChange[];
  expectedRevision?: number;
  selectionAfter?: number;
  activate?: boolean;
  focus?: boolean;
}

export interface EditorRequest {
  id: number;
  path: string;
  selection: number | null;
  focus: boolean;
}

export function applyDocumentChanges(document: Text, changes: readonly DocumentTextChange[]) {
  const ordered = [...changes].sort((left, right) => left.from - right.from || left.to - right.to);
  let previousTo = -1;
  for (const change of ordered) {
    if (
      !Number.isInteger(change.from) ||
      !Number.isInteger(change.to) ||
      change.from < 0 ||
      change.to < change.from ||
      change.to > document.length
    ) {
      throw new Error(`Invalid document edit range: ${change.from}-${change.to}`);
    }
    if (change.from < previousTo) throw new Error("Document edit ranges cannot overlap");
    previousTo = change.to;
  }
  return ChangeSet.of(ordered, document.length).apply(document);
}

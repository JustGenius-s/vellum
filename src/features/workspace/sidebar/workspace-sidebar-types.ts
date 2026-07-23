export type WorkspaceEntryDialogRequest =
  | { kind: "file" | "folder"; parent: string }
  | { kind: "rename"; path: string; name: string };

export type EntryDialogState = WorkspaceEntryDialogRequest | null;

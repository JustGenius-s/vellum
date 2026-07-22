import type { TreeNode } from "@/domain/workspace";

export type EntryDialogState =
  | { kind: "file" | "folder"; parent: string }
  | { kind: "rename"; target: TreeNode }
  | null;

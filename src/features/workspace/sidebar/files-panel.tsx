import { useState } from "react";
import {
  CaretDownIcon,
  CaretRightIcon,
  FilePlusIcon,
  FolderIcon,
  FolderOpenIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import { useConfirmation } from "@/app/confirmation-context";
import { FILES_CAPABILITY } from "@/app/plugins/capabilities";
import { usePluginCapability, usePluginStore } from "@/app/plugins/plugin-context";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { FileTypeIcon } from "@/components/ui/file-type-icon";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  useSidebar,
} from "@/components/ui/sidebar";
import { fileStem, type TreeNode } from "@/domain/workspace";
import { EmptySidebar } from "@/features/workspace/sidebar/empty-sidebar";
import { EntryDialog } from "@/features/workspace/sidebar/entry-dialog";
import type { EntryDialogState } from "@/features/workspace/sidebar/workspace-sidebar-types";

function TreeRow({
  node,
  depth,
  onCreate,
  onRename,
  onDelete,
  activePath,
  onOpenFile,
  onOpenVault,
}: {
  node: TreeNode;
  depth: number;
  onCreate(parent: string, kind: "file" | "folder"): void;
  onRename(target: TreeNode): void;
  onDelete(target: TreeNode): void;
  activePath: string;
  onOpenFile(path: string): void;
  onOpenVault(): void;
}) {
  const { setOpenMobile } = useSidebar();
  const [expanded, setExpanded] = useState(depth < 1);
  const isActive = activePath === node.path;
  const FolderEntryIcon = expanded ? FolderOpenIcon : FolderIcon;

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={`flex min-h-9 items-center rounded-md transition-colors ${
              isActive ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60"
            }`}
            style={{ paddingLeft: `${0.4 + depth * 0.78}rem` }}
            onContextMenu={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-2 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              data-active={isActive}
              onClick={() => {
                if (node.isDir) {
                  setExpanded((value) => !value);
                  return;
                }
                onOpenFile(node.path);
                setOpenMobile(false);
              }}
            >
              {node.isDir ? (
                expanded ? (
                  <CaretDownIcon className="size-3 shrink-0 text-sidebar-foreground/40" />
                ) : (
                  <CaretRightIcon className="size-3 shrink-0 text-sidebar-foreground/40" />
                )
              ) : (
                <span className="w-3 shrink-0" />
              )}
              {node.isDir ? (
                <FolderEntryIcon
                  className={`size-3.5 shrink-0 ${
                    isActive ? "text-sidebar-primary" : "text-sidebar-foreground/48"
                  }`}
                  weight={isActive ? "duotone" : "regular"}
                />
              ) : (
                <FileTypeIcon
                  name={node.name}
                  className={`size-3.5 shrink-0 ${
                    isActive ? "text-sidebar-primary" : "text-sidebar-foreground/48"
                  }`}
                  fallbackWeight={isActive ? "duotone" : "regular"}
                />
              )}
              <span
                className={`truncate ${isActive ? "font-medium text-sidebar-foreground" : "text-sidebar-foreground/76"}`}
              >
                {fileStem(node.name)}
              </span>
            </button>
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent className="min-w-40">
          {node.isDir ? (
            <>
              <ContextMenuItem onSelect={() => onCreate(node.path, "file")}>
                New file
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => onCreate(node.path, "folder")}>
                New folder
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          ) : null}
          <ContextMenuItem onSelect={() => onRename(node)}>Rename</ContextMenuItem>
          <ContextMenuItem variant="destructive" onSelect={() => onDelete(node)}>
            Delete
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={onOpenVault}>
            <FolderOpenIcon />
            Open another vault
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {node.isDir && expanded ? (
        <div className="animate-in fade-in slide-in-from-top-1 duration-150">
          {node.children.map((child) => (
            <TreeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              onCreate={onCreate}
              onRename={onRename}
              onDelete={onDelete}
              activePath={activePath}
              onOpenFile={onOpenFile}
              onOpenVault={onOpenVault}
            />
          ))}
          {node.children.length === 0 ? (
            <p className="py-1 pl-10 text-[10px] text-sidebar-foreground/36">Empty folder</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function FilesPanel() {
  const files = usePluginCapability(FILES_CAPABILITY);
  const confirm = useConfirmation();
  const state = usePluginStore(files);
  const [dialog, setDialog] = useState<EntryDialogState>(null);

  async function requestDelete(target: TreeNode) {
    const confirmed = await confirm({
      title: `Delete ${target.name}?`,
      description: target.isDir
        ? "This folder and everything inside it will be permanently deleted from the local vault."
        : "This file will be permanently deleted from the local vault.",
      confirmLabel: target.isDir ? "Delete folder" : "Delete file",
      destructive: true,
    });
    if (confirmed) await files.deleteEntry(target.path);
  }

  if (state.phase === "booting") {
    return (
      <SidebarMenu className="gap-1 px-1">
        {Array.from({ length: 7 }, (_, index) => (
          <SidebarMenuItem key={index}>
            <SidebarMenuSkeleton showIcon />
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    );
  }

  if (!state.vaultPath) {
    return (
      <EmptySidebar
        icon={FolderOpenIcon}
        title="No vault open"
        description="Choose a folder of documents and research data. Vellum keeps every source local and portable."
        action={
          <Button size="sm" onClick={() => void files.openVault()}>
            <FolderOpenIcon data-icon="inline-start" /> Open vault
          </Button>
        }
      />
    );
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="min-h-full group-data-[collapsible=icon]:hidden">
            {state.tree.length === 0 ? (
              <EmptySidebar
                icon={FilePlusIcon}
                title="The vault is empty"
                description="Create the first document or text data file and keep the workspace in durable local formats."
                action={
                  <Button
                    size="sm"
                    onClick={() => setDialog({ kind: "file", parent: state.vaultPath })}
                  >
                    <PlusIcon data-icon="inline-start" /> New document
                  </Button>
                }
              />
            ) : (
              <div className="px-1 pb-6">
                {state.tree.map((node) => (
                  <TreeRow
                    key={node.path}
                    node={node}
                    depth={0}
                    onCreate={(parent, kind) => setDialog({ kind, parent })}
                    onRename={(target) =>
                      setDialog({ kind: "rename", path: target.path, name: target.name })
                    }
                    onDelete={(target) => void requestDelete(target)}
                    activePath={state.activePath}
                    onOpenFile={(path) => void files.openFile(path)}
                    onOpenVault={() => void files.openVault()}
                  />
                ))}
              </div>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-40">
          <ContextMenuItem
            onSelect={() => setDialog({ kind: "file", parent: state.vaultPath })}
          >
            New document
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => setDialog({ kind: "folder", parent: state.vaultPath })}
          >
            New folder
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => void files.refreshTree()}>Refresh</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => void files.openVault()}>
            <FolderOpenIcon />
            Open another vault
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <EntryDialog state={dialog} onClose={() => setDialog(null)} />
    </>
  );
}

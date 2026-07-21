import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  ArrowClockwiseIcon,
  BooksIcon,
  CaretDownIcon,
  CaretRightIcon,
  FilePlusIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  GearSixIcon,
  LinkSimpleIcon,
  ListBulletsIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from "@phosphor-icons/react";

import { useWorkspace } from "@/app/workspace-context";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Sidebar,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  useSidebar,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SidebarView } from "@/application/workspace-controller";
import { fileName, fileStem, type TreeNode } from "@/domain/workspace";

type EntryDialogState =
  | { kind: "file" | "folder"; parent: string }
  | { kind: "rename"; target: TreeNode }
  | null;

const sidebarViews: Array<{
  id: SidebarView;
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { id: "files", label: "Files", icon: FolderOpenIcon },
  { id: "search", label: "Search", icon: MagnifyingGlassIcon },
  { id: "outline", label: "Structure", icon: ListBulletsIcon },
];

const settingsView = { id: "settings", label: "Settings", icon: GearSixIcon } as const;

function EmptySidebar({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-56 flex-col items-start justify-center px-4 py-8 group-data-[collapsible=icon]:hidden">
      <div className="mb-4 flex size-9 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-foreground">
        <Icon className="size-4.5" />
      </div>
      <p className="text-sm font-semibold tracking-[-0.01em] text-sidebar-foreground">{title}</p>
      <p className="mt-1.5 max-w-52 text-xs leading-5 text-sidebar-foreground/55">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

function TreeRow({
  node,
  depth,
  onCreate,
  onRename,
}: {
  node: TreeNode;
  depth: number;
  onCreate(parent: string, kind: "file" | "folder"): void;
  onRename(target: TreeNode): void;
}) {
  const { controller, state } = useWorkspace();
  const { setOpenMobile } = useSidebar();
  const [expanded, setExpanded] = useState(depth < 1);
  const isActive = state.activePath === node.path;
  const Icon = node.isDir ? (expanded ? FolderOpenIcon : FolderIcon) : FileTextIcon;

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
                void controller.openFile(node.path);
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
              <Icon
                className={`size-3.5 shrink-0 ${
                  isActive ? "text-sidebar-primary" : "text-sidebar-foreground/48"
                }`}
                weight={isActive ? "duotone" : "regular"}
              />
              <span
                className={`truncate ${isActive ? "font-medium text-sidebar-foreground" : "text-sidebar-foreground/76"}`}
              >
                {node.name.replace(/\.typ$/i, "")}
              </span>
            </button>
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent className="min-w-40">
          {node.isDir ? (
            <>
              <ContextMenuItem onSelect={() => onCreate(node.path, "file")}>
                New document
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => onCreate(node.path, "folder")}>
                New folder
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          ) : null}
          <ContextMenuItem onSelect={() => onRename(node)}>Rename</ContextMenuItem>
          <ContextMenuItem
            variant="destructive"
            onSelect={() => void controller.deleteEntry(node.path)}
          >
            Delete
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

function FilesPanel({ onDialog }: { onDialog(state: EntryDialogState): void }) {
  const { controller, state } = useWorkspace();

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
        description="Choose a folder of Typst documents. Vellum never moves it into a proprietary database."
        action={
          <Button size="sm" onClick={() => void controller.openVault()}>
            <FolderOpenIcon data-icon="inline-start" /> Open vault
          </Button>
        }
      />
    );
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="min-h-full group-data-[collapsible=icon]:hidden">
          {state.tree.length === 0 ? (
            <EmptySidebar
              icon={FilePlusIcon}
              title="The vault is empty"
              description="Create the first Typst document and start with a durable local file."
              action={
                <Button
                  size="sm"
                  onClick={() => onDialog({ kind: "file", parent: state.vaultPath })}
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
                  onCreate={(parent, kind) => onDialog({ kind, parent })}
                  onRename={(target) => onDialog({ kind: "rename", target })}
                />
              ))}
            </div>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-40">
        <ContextMenuItem onSelect={() => onDialog({ kind: "file", parent: state.vaultPath })}>
          New document
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onDialog({ kind: "folder", parent: state.vaultPath })}>
          New folder
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => void controller.refreshTree()}>Refresh</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function SearchPanel() {
  const { controller, state } = useWorkspace();
  const { setOpenMobile } = useSidebar();
  const [query, setQuery] = useState(state.searchQuery);

  useEffect(() => {
    const timer = window.setTimeout(() => void controller.search(query), 260);
    return () => window.clearTimeout(timer);
  }, [controller, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
      <div className="px-2 pb-3 pt-1">
        <div className="relative">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-sidebar-foreground/38" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search workspace"
            className="h-9 rounded-md border-sidebar-border bg-background pl-8 text-xs shadow-none"
          />
        </div>
      </div>

      {state.searchPending ? (
        <div className="space-y-3 px-3 py-2">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </div>
      ) : state.searchResults.length ? (
        <div className="space-y-1 px-1 pb-5">
          {state.searchResults.map((result) => (
            <button
              key={`${result.path}:${result.line}:${result.column}`}
              type="button"
              className="w-full rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-sidebar-accent/65 active:translate-y-px"
              onClick={() => {
                void controller.openSearchMatch(result);
                setOpenMobile(false);
              }}
            >
              <span className="flex items-center gap-2 text-[11px] font-medium text-sidebar-foreground/78">
                <FileTextIcon className="size-3 text-sidebar-primary" />
                <span className="truncate">{result.relativePath}</span>
              </span>
              <span className="mt-1 line-clamp-2 block text-[10px] leading-4 text-sidebar-foreground/48">
                {result.preview}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <EmptySidebar
          icon={MagnifyingGlassIcon}
          title={query ? "No matches" : "Search the vault"}
          description={
            query
              ? "Try a broader phrase or a document title."
              : "Results include exact lines and jump directly into the editor."
          }
        />
      )}
    </div>
  );
}

function OutlinePanel() {
  const { controller, state } = useWorkspace();
  const { setOpenMobile } = useSidebar();
  const outline = controller.outline;
  const backlinks = controller.activeBacklinks;

  if (!state.activePath) {
    return (
      <EmptySidebar
        icon={ListBulletsIcon}
        title="No document selected"
        description="Open a Typst file to inspect its headings and linked mentions."
      />
    );
  }

  return (
    <div className="space-y-4 px-2 pb-6 group-data-[collapsible=icon]:hidden">
      <section>
        <p className="px-2 pb-1.5 text-xs font-medium text-sidebar-foreground/60">
          Document outline
        </p>
        {outline.length ? (
          <div className="space-y-0.5">
            {outline.map((heading) => (
              <button
                key={`${heading.line}:${heading.title}`}
                type="button"
                className="flex min-h-9 w-full items-center gap-2 rounded-lg pr-2 text-left text-xs text-sidebar-foreground/68 hover:bg-sidebar-accent/65 hover:text-sidebar-foreground"
                style={{ paddingLeft: `${0.5 + (heading.level - 1) * 0.7}rem` }}
                onClick={() => {
                  controller.revealLine(heading.line);
                  setOpenMobile(false);
                }}
              >
                <span className="truncate">{heading.title}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="px-2 py-3 text-xs leading-5 text-sidebar-foreground/42">
            Add a heading such as{" "}
            <span className="font-mono text-sidebar-foreground/66">= Introduction</span>.
          </p>
        )}
      </section>

      <section>
        <p className="flex items-center gap-2 px-2 pb-1.5 text-xs font-medium text-sidebar-foreground/60">
          <LinkSimpleIcon className="size-3" /> Linked mentions
        </p>
        {backlinks.length ? (
          backlinks.map((stem) => (
            <button
              key={stem}
              type="button"
              className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-xs text-sidebar-foreground/68 hover:bg-sidebar-accent/65"
              onClick={() => {
                void controller.openByStem(stem);
                setOpenMobile(false);
              }}
            >
              <FileTextIcon className="size-3.5 text-sidebar-primary" />
              <span className="truncate">{stem}</span>
            </button>
          ))
        ) : (
          <p className="px-2 py-3 text-xs leading-5 text-sidebar-foreground/42">
            No other document links here yet.
          </p>
        )}
      </section>
    </div>
  );
}

function SettingsPanel() {
  const { controller, state } = useWorkspace();

  return (
    <div className="space-y-4 px-1 pb-6 group-data-[collapsible=icon]:hidden">
      <section>
        <div className="px-2 pb-2">
          <p className="text-xs font-medium text-sidebar-foreground/60">Workspace</p>
          <p
            className="mt-1 truncate text-xs text-sidebar-foreground/42"
            title={state.vaultPath || undefined}
          >
            {state.vaultPath || "No local workspace is open"}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="h-9 w-full justify-start px-2 text-xs font-normal text-sidebar-foreground/68"
          onClick={() => void controller.refreshTree()}
          disabled={!state.vaultPath}
        >
          <ArrowClockwiseIcon data-icon="inline-start" />
          Refresh workspace
        </Button>
      </section>
    </div>
  );
}

function EntryDialog({ state, onClose }: { state: EntryDialogState; onClose(): void }) {
  const { controller } = useWorkspace();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (state?.kind === "rename") setName(fileStem(state.target.name));
    else setName("");
    setError("");
  }, [state]);

  const title =
    state?.kind === "rename"
      ? "Rename entry"
      : state?.kind === "folder"
        ? "New folder"
        : "New document";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!state || !name.trim()) return;
    setPending(true);
    setError("");
    try {
      if (state.kind === "rename") await controller.renameEntry(state.target.path, name.trim());
      else await controller.createEntry(state.parent, name.trim(), state.kind === "folder");
      onClose();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={Boolean(state)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {state?.kind === "folder"
                ? "Folders organize the local vault without changing file formats."
                : "Documents are stored as plain .typ files."}
            </DialogDescription>
          </DialogHeader>
          <label className="grid gap-2 text-xs font-medium">
            Name
            <Input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="research-note"
            />
            {error ? <span className="text-xs font-normal text-destructive">{error}</span> : null}
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? "Working" : state?.kind === "rename" ? "Rename" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AppSidebar() {
  const { controller, state } = useWorkspace();
  const { state: sidebarState, setOpen, isMobile } = useSidebar();
  const [dialog, setDialog] = useState<EntryDialogState>(null);
  const vaultName = useMemo(
    () => (state.vaultPath ? fileName(state.vaultPath) : "Local workspace"),
    [state.vaultPath],
  );
  const activeView =
    state.sidebarView === settingsView.id
      ? settingsView
      : sidebarViews.find((view) => view.id === state.sidebarView)!;

  function selectView(view: SidebarView) {
    if (!isMobile && state.sidebarView === view) {
      setOpen(sidebarState === "collapsed");
      return;
    }

    controller.setSidebarView(view);

    if (!isMobile) {
      setOpen(true);
    }
  }

  return (
    <>
      <Sidebar collapsible="icon" className="bg-sidebar">
        <div className="flex size-full min-h-0">
          <nav
            className="flex w-12 shrink-0 flex-col items-center bg-sidebar-accent/50 py-2"
            aria-label="Workspace views"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground"
                  aria-label="Vellum"
                >
                  <BooksIcon className="size-4.5" weight="duotone" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">Vellum</TooltipContent>
            </Tooltip>

            <div className="mt-3 flex flex-col gap-1">
              {sidebarViews.map(({ id, label, icon: Icon }) => (
                <Tooltip key={id}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`size-9 ${
                        state.sidebarView === id
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/60 hover:text-sidebar-foreground"
                      }`}
                      onClick={() => selectView(id)}
                      aria-label={label}
                      aria-pressed={state.sidebarView === id}
                    >
                      <Icon />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">{label}</TooltipContent>
                </Tooltip>
              ))}
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`mt-auto size-9 ${
                    state.sidebarView === settingsView.id
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/60 hover:text-sidebar-foreground"
                  }`}
                  onClick={() => selectView(settingsView.id)}
                  aria-label={settingsView.label}
                  aria-pressed={state.sidebarView === settingsView.id}
                >
                  <GearSixIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{settingsView.label}</TooltipContent>
            </Tooltip>
          </nav>

          <div className="flex min-w-0 flex-1 flex-col bg-sidebar group-data-[collapsible=icon]:hidden">
            <header className="flex h-12 shrink-0 items-center px-3">
              <h2 className="min-w-0 flex-1 truncate text-sm font-medium text-sidebar-foreground">
                {state.sidebarView === "files" ? vaultName : activeView.label}
              </h2>
              {state.sidebarView === "files" && state.vaultPath ? (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setDialog({ kind: "file", parent: state.vaultPath })}
                  aria-label="Create document"
                >
                  <PlusIcon />
                </Button>
              ) : null}
            </header>

            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2">
              {state.sidebarView === "files" ? (
                <FilesPanel onDialog={setDialog} />
              ) : state.sidebarView === "search" ? (
                <SearchPanel />
              ) : state.sidebarView === "outline" ? (
                <OutlinePanel />
              ) : (
                <SettingsPanel />
              )}
            </div>
          </div>
        </div>
      </Sidebar>

      <EntryDialog state={dialog} onClose={() => setDialog(null)} />
    </>
  );
}

import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  ArrowClockwiseIcon,
  BooksIcon,
  CaretDownIcon,
  CaretRightIcon,
  DotsThreeIcon,
  FilePlusIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  LinkSimpleIcon,
  ListBulletsIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";

import { useWorkspace } from "@/app/workspace-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
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
      <div className="mb-4 flex size-9 items-center justify-center rounded-lg border border-sidebar-border bg-sidebar-accent/45 text-sidebar-foreground/72">
        <Icon className="size-4" />
      </div>
      <p className="text-sm font-medium text-sidebar-foreground">{title}</p>
      <p className="mt-1 max-w-48 text-xs leading-5 text-sidebar-foreground/52">{description}</p>
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
  const [expanded, setExpanded] = useState(depth < 1);
  const isActive = state.activePath === node.path;
  const Icon = node.isDir ? (expanded ? FolderOpenIcon : FolderIcon) : FileTextIcon;

  return (
    <div>
      <div
        className="group/tree-row flex min-h-8 items-center rounded-md pr-1 hover:bg-sidebar-accent/70"
        style={{ paddingLeft: `${0.35 + depth * 0.75}rem` }}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          data-active={isActive}
          onClick={() =>
            node.isDir ? setExpanded((value) => !value) : void controller.openFile(node.path)
          }
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
            className={`size-3.5 shrink-0 ${isActive ? "text-[var(--signal)]" : "text-sidebar-foreground/55"}`}
          />
          <span
            className={`truncate ${isActive ? "font-medium text-sidebar-foreground" : "text-sidebar-foreground/76"}`}
          >
            {node.name.replace(/\.typ$/i, "")}
          </span>
          {isActive ? <span className="ml-auto size-1.5 rounded-full bg-[var(--signal)]" /> : null}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="opacity-0 group-hover/tree-row:opacity-100 data-open:opacity-100"
              aria-label={`Actions for ${node.name}`}
            >
              <DotsThreeIcon weight="bold" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-40">
            {node.isDir ? (
              <>
                <DropdownMenuItem onSelect={() => onCreate(node.path, "file")}>
                  <FilePlusIcon /> New document
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onCreate(node.path, "folder")}>
                  <FolderPlusIcon /> New folder
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuItem onSelect={() => onRename(node)}>
              <PencilSimpleIcon /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => void controller.deleteEntry(node.path)}
            >
              <TrashIcon /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

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

  if (state.tree.length === 0) {
    return (
      <EmptySidebar
        icon={FilePlusIcon}
        title="The vault is empty"
        description="Create the first Typst document and start with a durable local file."
        action={
          <Button size="sm" onClick={() => onDialog({ kind: "file", parent: state.vaultPath })}>
            <PlusIcon data-icon="inline-start" /> New document
          </Button>
        }
      />
    );
  }

  return (
    <div className="px-1 pb-6 group-data-[collapsible=icon]:hidden">
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
  );
}

function SearchPanel() {
  const { controller, state } = useWorkspace();
  const [query, setQuery] = useState(state.searchQuery);

  useEffect(() => {
    const timer = window.setTimeout(() => void controller.search(query), 260);
    return () => window.clearTimeout(timer);
  }, [controller, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
      <div className="px-2 pb-2">
        <div className="relative">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-sidebar-foreground/38" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search this vault"
            className="h-8 border-sidebar-border bg-sidebar-accent/35 pl-8 text-xs shadow-none"
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
              className="w-full rounded-md px-2.5 py-2 text-left transition-colors hover:bg-sidebar-accent/70 active:translate-y-px"
              onClick={() => void controller.openSearchMatch(result)}
            >
              <span className="flex items-center gap-2 text-[11px] font-medium text-sidebar-foreground/78">
                <FileTextIcon className="size-3 text-[var(--signal)]" />
                <span className="truncate">{result.relativePath}</span>
                <span className="ml-auto font-mono text-[9px] text-sidebar-foreground/35">
                  {result.line}
                </span>
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
    <div className="space-y-5 px-2 pb-6 group-data-[collapsible=icon]:hidden">
      <section>
        <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/38">
          Document outline
        </p>
        {outline.length ? (
          <div className="space-y-0.5">
            {outline.map((heading) => (
              <button
                key={`${heading.line}:${heading.title}`}
                type="button"
                className="flex min-h-8 w-full items-center gap-2 rounded-md pr-2 text-left text-xs text-sidebar-foreground/68 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
                style={{ paddingLeft: `${0.5 + (heading.level - 1) * 0.7}rem` }}
                onClick={() => controller.revealLine(heading.line)}
              >
                <span className="flex size-5 shrink-0 items-center justify-center rounded border border-sidebar-border font-mono text-[9px] text-sidebar-foreground/36">
                  {heading.level}
                </span>
                <span className="truncate">{heading.title}</span>
                <span className="ml-auto font-mono text-[9px] text-sidebar-foreground/28">
                  {heading.line}
                </span>
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

      <section className="border-t border-sidebar-border pt-4">
        <p className="flex items-center gap-2 px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/38">
          <LinkSimpleIcon className="size-3" /> Linked mentions
          <Badge variant="outline" className="ml-auto h-4 px-1 font-mono text-[8px]">
            {backlinks.length}
          </Badge>
        </p>
        {backlinks.length ? (
          backlinks.map((stem) => (
            <button
              key={stem}
              type="button"
              className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-sidebar-foreground/68 hover:bg-sidebar-accent/70"
              onClick={() => void controller.openByStem(stem)}
            >
              <FileTextIcon className="size-3.5 text-[var(--signal)]" />
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
  const { setOpenMobile } = useSidebar();
  const [dialog, setDialog] = useState<EntryDialogState>(null);
  const vaultName = useMemo(
    () => (state.vaultPath ? fileName(state.vaultPath) : "Local workspace"),
    [state.vaultPath],
  );

  function selectView(view: SidebarView) {
    controller.setSidebarView(view);
    setOpenMobile(true);
  }

  return (
    <>
      <Sidebar collapsible="icon" className="border-sidebar-border bg-sidebar">
        <SidebarHeader className="px-2.5 pb-1 pt-3">
          <div className="flex min-h-9 items-center gap-2 px-1">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--signal)] text-[var(--signal-foreground)] shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]">
              <BooksIcon className="size-4" weight="fill" />
            </div>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-xs font-semibold tracking-[-0.01em] text-sidebar-foreground">
                Vellum
              </p>
              <p className="truncate font-mono text-[9px] text-sidebar-foreground/38">
                {vaultName}
              </p>
            </div>
          </div>
        </SidebarHeader>

        <SidebarGroup className="pt-1">
          <SidebarMenu>
            {sidebarViews.map(({ id, label, icon: Icon }) => (
              <SidebarMenuItem key={id}>
                <SidebarMenuButton
                  isActive={state.sidebarView === id}
                  tooltip={label}
                  onClick={() => selectView(id)}
                >
                  <Icon />
                  <span>{label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarContent>
          <SidebarGroup className="min-h-0 flex-1 px-1.5 pt-2">
            <SidebarGroupLabel className="px-2 text-[10px] uppercase tracking-[0.15em]">
              {state.sidebarView === "files"
                ? "Vault"
                : state.sidebarView === "search"
                  ? "Full-text search"
                  : "Document map"}
            </SidebarGroupLabel>
            {state.sidebarView === "files" && state.vaultPath ? (
              <SidebarGroupAction
                onClick={() => setDialog({ kind: "file", parent: state.vaultPath })}
                aria-label="Create document"
              >
                <PlusIcon />
              </SidebarGroupAction>
            ) : null}
            <SidebarGroupContent className="min-h-0 flex-1">
              <ScrollArea className="h-[calc(100dvh-13rem)] md:h-[calc(100svh-13rem)]">
                {state.sidebarView === "files" ? (
                  <FilesPanel onDialog={setDialog} />
                ) : state.sidebarView === "search" ? (
                  <SearchPanel />
                ) : (
                  <OutlinePanel />
                )}
              </ScrollArea>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border px-2.5 py-2">
          <div className="flex min-h-8 items-center gap-2 px-1 group-data-[collapsible=icon]:justify-center">
            <span
              className={`size-2 rounded-full ${state.mode === "desktop" ? "bg-[var(--signal)]" : "bg-amber-400"}`}
              aria-hidden="true"
            />
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-[10px] font-medium text-sidebar-foreground/68">
                {state.mode === "desktop" ? "Desktop engine" : "Browser demo"}
              </p>
              <p className="truncate font-mono text-[8px] text-sidebar-foreground/32">
                {state.mode === "desktop" ? "Typst 0.15" : "UI preview adapter"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon-xs"
              className="ml-auto group-data-[collapsible=icon]:hidden"
              onClick={() => void controller.refreshTree()}
              aria-label="Refresh workspace"
            >
              <ArrowClockwiseIcon />
            </Button>
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <EntryDialog state={dialog} onClose={() => setDialog(null)} />
    </>
  );
}

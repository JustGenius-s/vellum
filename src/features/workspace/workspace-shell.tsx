import { lazy, Suspense, useMemo } from "react";
import {
  CommandIcon,
  DownloadSimpleIcon,
  FolderOpenIcon,
  XIcon,
} from "@phosphor-icons/react";

import { useCommandRegistration, useCommands } from "@/app/command-context";
import { useWorkspace } from "@/app/workspace-context";
import { Button } from "@/components/ui/button";
import { FileTypeIcon } from "@/components/ui/file-type-icon";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useDefaultLayout,
} from "@/components/ui/resizable";
import { SidebarInset, useSidebar } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { documentFormat, fileName, fileStem, flattenFiles } from "@/domain/workspace";
import { PreviewPane } from "@/features/preview/preview-pane";
import { AppSidebar } from "@/features/workspace/app-sidebar";
import { ProblemsPanel } from "@/features/workspace/problems-panel";
import { useMediaQuery } from "@/hooks/use-media-query";

const TypstEditor = lazy(() =>
  import("@/features/editor/typst-editor").then((module) => ({ default: module.TypstEditor })),
);

function CompactSurfaceSwitch() {
  const { controller, state } = useWorkspace();

  return (
    <div className="flex h-8 items-center rounded-lg bg-muted p-0.5 min-[1180px]:hidden">
      {(["editor", "preview"] as const).map((surface) => (
        <button
          key={surface}
          type="button"
          className={`h-7 rounded-md px-2.5 text-[11px] font-medium capitalize transition-[background-color,color,box-shadow] duration-150 active:translate-y-px sm:px-3 sm:text-xs ${
            state.compactSurface === surface
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => controller.setCompactSurface(surface)}
        >
          {surface}
        </button>
      ))}
    </div>
  );
}

function WorkspaceTopbar() {
  const { controller, state } = useWorkspace();
  const { openPalette } = useCommands();
  const { toggleSidebar } = useSidebar();
  const toggleSidebarCommand = useMemo(
    () => ({
      id: "view.toggle-sidebar",
      title: "Toggle sidebar panel",
      description: "Show or hide the sidebar content",
      group: "View" as const,
      keybinding: "Mod+B",
      handler: toggleSidebar,
    }),
    [toggleSidebar],
  );
  useCommandRegistration(toggleSidebarCommand);

  const active = controller.activeTab;
  const compileFailed = state.compilePhase === "failed";
  const canExport = Boolean(active && documentFormat(active.path) !== "bibliography");

  return (
    <header className="flex h-12 shrink-0 items-center gap-1.5 border-b bg-background px-2 sm:px-3">
      <div className="hidden min-w-0 flex-1 min-[1180px]:block">
        <DocumentTabs />
      </div>

      <span className="min-w-0 flex-1 truncate px-1 text-sm font-medium min-[1180px]:hidden">
        {active ? fileStem(active.name) : "Workspace"}
        {active?.dirty ? " *" : ""}
      </span>

      <CompactSurfaceSwitch />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="hidden h-8 text-xs lg:flex"
            onClick={() => openPalette("commands")}
          >
            <CommandIcon />
            <span>Commands</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Open command palette</TooltipContent>
      </Tooltip>

      <div
        className={`hidden px-2 text-xs capitalize sm:block ${
          compileFailed ? "text-destructive" : "text-muted-foreground"
        }`}
        aria-label={`Compile status: ${state.compilePhase}`}
      >
        {state.compilePhase}
      </div>

      <Button
        size="sm"
        className="h-8"
        onClick={() => void controller.exportPdf()}
        disabled={!canExport}
        aria-label="Export PDF"
      >
        <DownloadSimpleIcon />
        <span className="hidden md:inline">Export</span>
      </Button>

      <Button
        variant="ghost"
        size="icon-sm"
        className="lg:hidden"
        onClick={() => openPalette("commands")}
        aria-label="Open commands"
      >
        <CommandIcon />
      </Button>
    </header>
  );
}

function DocumentTabs() {
  const { controller, state } = useWorkspace();
  if (!state.tabs.length) return null;

  return (
    <div className="no-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto">
      {state.tabs.map((tab) => {
        const active = tab.path === state.activePath;
        return (
          <div
            key={tab.path}
            className={`group/tab relative flex min-w-28 max-w-52 items-center rounded-md transition-colors ${
              active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            }`}
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-xs active:translate-y-px"
              onClick={() => controller.switchTab(tab.path)}
            >
              <FileTypeIcon
                name={tab.name}
                className="size-3.5 shrink-0 text-muted-foreground"
                fallbackWeight={active ? "duotone" : "regular"}
              />
              <span className="truncate">{fileStem(tab.name)}</span>
              {tab.dirty ? <span className="text-muted-foreground">*</span> : null}
            </button>
            <button
              type="button"
              className={`mr-1 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[opacity,background-color,color] hover:bg-muted hover:text-foreground focus:opacity-100 ${
                active ? "opacity-65" : "opacity-0 group-hover/tab:opacity-65"
              }`}
              onClick={() => controller.closeTab(tab.path)}
              aria-label={`Close ${tab.name}`}
            >
              <XIcon className="size-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function EmptyWorkspace() {
  const { controller, state } = useWorkspace();

  return (
    <div className="flex h-full min-h-0 items-center justify-center px-5 py-10 sm:px-10">
      <div className="w-full max-w-lg">
        <div className="mb-5 flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <FolderOpenIcon className="size-5" weight="duotone" />
        </div>
        <h1 className="max-w-md text-2xl font-semibold tracking-tight sm:text-3xl">
          {state.vaultPath
            ? "Choose a document from your library."
            : "A quieter place to write and typeset."}
        </h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          {state.vaultPath
            ? "Your Typst, Markdown, and BibTeX files remain local and portable. Open one to edit its source."
            : "Open a folder to create a workspace around plain Typst, Markdown, and BibTeX files."}
        </p>
        {!state.vaultPath ? (
          <Button className="mt-6" size="lg" onClick={() => void controller.openVault()}>
            <FolderOpenIcon data-icon="inline-start" /> Open workspace
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function EditorPane() {
  const { controller, state } = useWorkspace();
  const active = controller.activeTab;
  const fileNames = flattenFiles(state.tree).map((file) => fileName(file.path));

  return (
    <section className="flex h-full min-h-0 w-full flex-col bg-card" aria-label="Document editor">
      <div className="min-h-0 flex-1">
        {active ? (
          <Suspense
            fallback={
              <div className="space-y-3 px-[clamp(2rem,6vw,5rem)] py-14">
                <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                <div className="h-3 w-full animate-pulse rounded bg-muted" />
                <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
              </div>
            }
          >
            <TypstEditor
              value={active.content}
              activePath={active.path}
              fileNames={fileNames}
              diagnostics={state.diagnostics}
              revealLine={state.revealLine}
              onChange={(value) => controller.updateSource(value)}
              onRevealComplete={() => controller.clearRevealLine()}
            />
          </Suspense>
        ) : (
          <EmptyWorkspace />
        )}
      </div>
    </section>
  );
}

function WideWorkspaceSurfaces() {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "vellum-workspace-surfaces",
    panelIds: ["workspace-editor", "workspace-preview"],
    onlySaveAfterUserInteractions: true,
  });

  return (
    <ResizablePanelGroup
      id="vellum-workspace-surfaces"
      orientation="horizontal"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
      resizeTargetMinimumSize={{ fine: 8, coarse: 24 }}
      className="min-h-0"
    >
      <ResizablePanel
        id="workspace-editor"
        defaultSize="54"
        minSize="360px"
        className="min-h-0 min-w-0"
      >
        <EditorPane />
      </ResizablePanel>
      <ResizableHandle aria-label="Resize editor and preview" />
      <ResizablePanel
        id="workspace-preview"
        defaultSize="46"
        minSize="320px"
        className="min-h-0 min-w-0"
      >
        <PreviewPane />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function WorkspaceSurfaces() {
  const { state } = useWorkspace();
  const isWide = useMediaQuery("(min-width: 1180px)");

  if (isWide) return <WideWorkspaceSurfaces />;

  return state.compactSurface === "editor" ? <EditorPane /> : <PreviewPane />;
}

function WorkspaceMain() {
  const { state } = useWorkspace();

  return (
    <SidebarInset className="h-[100dvh] min-h-0 overflow-hidden bg-background">
      <WorkspaceTopbar />
      {state.tabs.length ? (
        <div className="shrink-0 border-b bg-background px-2 py-1 min-[1180px]:hidden">
          <DocumentTabs />
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-hidden">
          <WorkspaceSurfaces />
        </div>
        <ProblemsPanel />
      </div>
    </SidebarInset>
  );
}

export function WorkspaceShell() {
  return (
    <div className="flex min-h-[100dvh] w-full overflow-hidden bg-background">
      <AppSidebar />
      <WorkspaceMain />
    </div>
  );
}

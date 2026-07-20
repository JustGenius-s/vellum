import { lazy, Suspense, useMemo } from "react";
import {
  CommandIcon,
  DownloadSimpleIcon,
  FileTextIcon,
  FolderOpenIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";

import { useCommandRegistration, useCommands } from "@/app/command-context";
import { useWorkspace } from "@/app/workspace-context";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fileName, flattenFiles } from "@/domain/workspace";
import { PreviewPane } from "@/features/preview/preview-pane";
import { AppSidebar } from "@/features/workspace/app-sidebar";
import { ProblemsPanel } from "@/features/workspace/problems-panel";

const TypstEditor = lazy(() =>
  import("@/features/editor/typst-editor").then((module) => ({ default: module.TypstEditor })),
);

function WorkspaceTopbar() {
  const { controller, state } = useWorkspace();
  const { openPalette, primaryModifier } = useCommands();
  const { toggleSidebar } = useSidebar();
  const toggleSidebarCommand = useMemo(
    () => ({
      id: "view.toggle-sidebar",
      title: "Toggle sidebar",
      description: "Expand or collapse the workspace navigation",
      group: "View" as const,
      icon: "sidebar" as const,
      keybinding: "Mod+B",
      handler: toggleSidebar,
    }),
    [toggleSidebar],
  );
  useCommandRegistration(toggleSidebarCommand);

  const primaryLabel = primaryModifier === "Cmd" ? "⌘" : "Ctrl";
  const active = controller.activeTab;

  return (
    <header className="flex min-h-11 shrink-0 items-center gap-1.5 border-b border-border/70 bg-background/78 px-2 backdrop-blur-xl sm:px-3">
      <SidebarTrigger className="shrink-0" />
      <Separator orientation="vertical" className="mx-1 h-4" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-xs font-medium text-foreground">
            {active?.name.replace(/\.typ$/i, "") ??
              (state.vaultPath ? fileName(state.vaultPath) : "Vellum")}
          </p>
          {active?.dirty ? (
            <span className="size-1.5 shrink-0 rounded-full bg-amber-400" aria-label="Unsaved" />
          ) : null}
        </div>
        <p className="hidden truncate font-mono text-[8px] text-muted-foreground sm:block">
          {controller.activeRelativePath() ||
            (state.vaultPath ? "No document open" : "Local-first Typst workspace")}
        </p>
      </div>

      <div className="mr-1 flex items-center rounded-md border border-border/70 bg-muted/40 p-0.5 lg:hidden">
        <button
          type="button"
          className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${state.compactSurface === "editor" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
          onClick={() => controller.setCompactSurface("editor")}
        >
          Editor
        </button>
        <button
          type="button"
          className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${state.compactSurface === "preview" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
          onClick={() => controller.setCompactSurface("preview")}
        >
          Preview
        </button>
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="hidden h-7 min-w-28 justify-start border-border/70 bg-muted/25 text-[10px] text-muted-foreground shadow-none md:flex"
            onClick={() => openPalette("commands")}
          >
            <CommandIcon /> Commands
            <span className="ml-auto font-mono text-[9px]">{primaryLabel}K</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Open command palette</TooltipContent>
      </Tooltip>

      <div className="hidden items-center gap-1.5 sm:flex">
        <span
          className={`size-1.5 rounded-full ${state.compilePhase === "failed" ? "bg-destructive" : "bg-[var(--signal)]"}`}
        />
        <span className="max-w-28 truncate font-mono text-[8px] uppercase tracking-[0.08em] text-muted-foreground">
          {state.compilePhase}
        </span>
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => controller.setProblemsOpen(!state.problemsOpen)}
            disabled={!active}
            aria-label="Toggle problems"
          >
            <WarningCircleIcon />
            {state.diagnostics.length ? (
              <span className="absolute right-0 top-0 flex min-w-3.5 -translate-y-0.5 translate-x-0.5 items-center justify-center rounded-full bg-destructive px-0.5 font-mono text-[7px] text-white">
                {state.diagnostics.length}
              </span>
            ) : null}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Problems</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void controller.exportPdf()}
            disabled={!active}
            aria-label="Export PDF"
          >
            <DownloadSimpleIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Export PDF</TooltipContent>
      </Tooltip>

      <Button
        variant="ghost"
        size="icon-sm"
        className="md:hidden"
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
    <div className="no-scrollbar flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-border/60 bg-background/62 px-1.5">
      {state.tabs.map((tab) => {
        const active = tab.path === state.activePath;
        return (
          <div
            key={tab.path}
            className={`group/tab relative flex min-w-28 max-w-52 items-center border-r border-border/40 ${active ? "bg-muted/45 text-foreground" : "text-muted-foreground hover:bg-muted/25 hover:text-foreground"}`}
          >
            {active ? <span className="absolute inset-x-2 top-0 h-px bg-[var(--signal)]" /> : null}
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-1.5 px-2.5 py-2 text-left text-[10px]"
              onClick={() => controller.switchTab(tab.path)}
            >
              <FileTextIcon
                className={`size-3 shrink-0 ${active ? "text-[var(--signal)]" : "text-muted-foreground"}`}
              />
              <span className="truncate">{tab.name.replace(/\.typ$/i, "")}</span>
              {tab.dirty ? <span className="size-1 shrink-0 rounded-full bg-amber-400" /> : null}
            </button>
            <button
              type="button"
              className="mr-1 flex size-5 shrink-0 items-center justify-center rounded opacity-0 transition-opacity hover:bg-muted group-hover/tab:opacity-100 focus:opacity-100"
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
    <div className="flex h-full min-h-0 flex-col items-start justify-center px-8 sm:px-[12vw]">
      <div className="mb-5 flex size-11 items-center justify-center rounded-lg border border-border bg-muted/35 text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <FolderOpenIcon className="size-5" />
      </div>
      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--signal)]">
        {state.vaultPath ? "Workspace ready" : "Local files first"}
      </p>
      <h1 className="mt-2 max-w-md text-2xl font-semibold tracking-[-0.04em] text-foreground sm:text-3xl">
        {state.vaultPath
          ? "Open a Typst document from the sidebar."
          : "Writing and typesetting, in the same room."}
      </h1>
      <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
        {state.vaultPath
          ? "Files remain plain .typ documents. The editor, compiler, search, and commands build around that durable source."
          : "Choose a folder to create a vault. Vellum edits local Typst source and compiles it through the native desktop engine."}
      </p>
      {!state.vaultPath ? (
        <Button className="mt-6" onClick={() => void controller.openVault()}>
          <FolderOpenIcon data-icon="inline-start" /> Open vault
        </Button>
      ) : null}
    </div>
  );
}

function EditorPane() {
  const { controller, state } = useWorkspace();
  const active = controller.activeTab;
  const fileNames = flattenFiles(state.tree).map((file) =>
    fileName(file.path).replace(/\.typ$/i, ""),
  );

  return (
    <section
      className="flex h-full min-h-0 w-full flex-col bg-background"
      aria-label="Document editor"
    >
      <header className="flex min-h-10 items-center gap-2 border-b border-border/65 px-3">
        <FileTextIcon className="size-3.5 text-[var(--signal)]" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Source
        </span>
        {active ? (
          <span className="ml-auto font-mono text-[8px] uppercase tracking-[0.08em] text-muted-foreground">
            {active.content.split("\n").length} lines
          </span>
        ) : null}
      </header>
      <div className="min-h-0 flex-1">
        {active ? (
          <Suspense
            fallback={
              <div className="space-y-3 px-12 py-14">
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

function StatusBar() {
  const { state } = useWorkspace();
  return (
    <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-border/65 bg-background/86 px-3 font-mono text-[8px] uppercase tracking-[0.09em] text-muted-foreground backdrop-blur-xl">
      <span className="flex items-center gap-1.5">
        <span
          className={`size-1.5 rounded-full ${state.compilePhase === "failed" ? "bg-destructive" : "bg-[var(--signal)]"}`}
        />
        {state.statusText}
      </span>
      <span className="ml-auto hidden sm:inline">Typst / SVG</span>
      <span>{state.mode === "desktop" ? "Native" : "Demo"}</span>
    </footer>
  );
}

export function WorkspaceShell() {
  const { state } = useWorkspace();

  return (
    <div className="flex min-h-[100dvh] w-full overflow-hidden bg-background">
      <AppSidebar />
      <SidebarInset className="h-[100dvh] min-h-0 overflow-hidden bg-background">
        <WorkspaceTopbar />
        <DocumentTabs />
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div className="workspace-grid h-full min-h-0">
            <div
              className={`${state.compactSurface === "editor" ? "flex" : "hidden"} min-h-0 min-w-0 lg:flex`}
            >
              <EditorPane />
            </div>
            <div
              className={`${state.compactSurface === "preview" ? "flex" : "hidden"} min-h-0 min-w-0 border-l border-border/70 lg:flex`}
            >
              <PreviewPane />
            </div>
          </div>
          <ProblemsPanel />
        </div>
        <StatusBar />
      </SidebarInset>
    </div>
  );
}

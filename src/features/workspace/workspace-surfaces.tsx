import { lazy, Suspense } from "react";
import { FolderOpenIcon } from "@phosphor-icons/react";
import { useWorkspace } from "@/app/workspace-context";
import { Button } from "@/components/ui/button";
import { PreviewPane } from "@/features/preview/preview-pane";
import { isDataFile } from "@/domain/data";
import { fileName, flattenFiles } from "@/domain/workspace";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup, useDefaultLayout } from "@/components/ui/resizable";
import { useMediaQuery } from "@/hooks/use-media-query";

const TypstEditor = lazy(() =>
  import("@/features/editor/typst-editor").then((module) => ({ default: module.TypstEditor })),
);
const DataInspector = lazy(() =>
  import("@/features/data/data-inspector").then((module) => ({ default: module.DataInspector })),
);

function EmptyWorkspace() {
  const { controller, state } = useWorkspace();
  return (
    <div className="flex h-full min-h-0 items-center justify-center px-5 py-10 sm:px-10">
      <div className="w-full max-w-lg">
        <div className="mb-5 flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <FolderOpenIcon className="size-5" weight="duotone" />
        </div>
        <h1 className="max-w-md text-2xl font-semibold tracking-tight sm:text-3xl">
          {state.vaultPath ? "Choose a document from your library." : "A quieter place to write and typeset."}
        </h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          {state.vaultPath
            ? "Your documents and research data remain local and portable. Open one to edit or inspect it."
            : "Open a folder to create a workspace around plain documents and research data files."}
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
  const fileNames = flattenFiles(state.tree).filter((file) => !isDataFile(file.path)).map((file) => fileName(file.path));
  return (
    <section className="flex h-full min-h-0 w-full flex-col bg-card" aria-label="Document editor">
      <div className="min-h-0 flex-1">
        {active ? (
          <Suspense fallback={<div className="space-y-3 px-[clamp(2rem,6vw,5rem)] py-14"><div className="h-3 w-2/3 animate-pulse rounded bg-muted" /><div className="h-3 w-full animate-pulse rounded bg-muted" /><div className="h-3 w-5/6 animate-pulse rounded bg-muted" /></div>}>
            <TypstEditor value={active.content} activePath={active.path} fileNames={fileNames} diagnostics={state.diagnostics} revealLine={state.revealLine} onChange={(value) => controller.updateSource(value)} onCursorChange={(path, offset) => controller.recordCursor(path, offset)} onRevealComplete={() => controller.clearRevealLine()} />
          </Suspense>
        ) : <EmptyWorkspace />}
      </div>
    </section>
  );
}

function WideWorkspaceSurfaces() {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id: "vellum-workspace-surfaces", panelIds: ["workspace-editor", "workspace-preview"], onlySaveAfterUserInteractions: true });
  return (
    <ResizablePanelGroup id="vellum-workspace-surfaces" orientation="horizontal" defaultLayout={defaultLayout} onLayoutChanged={onLayoutChanged} resizeTargetMinimumSize={{ fine: 8, coarse: 24 }} className="min-h-0">
      <ResizablePanel id="workspace-editor" defaultSize="54" minSize="360px" className="min-h-0 min-w-0"><EditorPane /></ResizablePanel>
      <ResizableHandle aria-label="Resize editor and preview" />
      <ResizablePanel id="workspace-preview" defaultSize="46" minSize="320px" className="min-h-0 min-w-0"><PreviewPane /></ResizablePanel>
    </ResizablePanelGroup>
  );
}

function DataLoadingSurface() {
  return <div className="grid h-full grid-cols-1 md:grid-cols-[15rem_minmax(0,1fr)]"><div className="border-b p-4 md:border-r md:border-b-0"><div className="h-8 animate-pulse rounded bg-muted" /></div><div className="space-y-4 p-6"><div className="h-6 w-48 animate-pulse rounded bg-muted" /><div className="h-52 animate-pulse rounded-lg bg-muted" /></div></div>;
}

export function WorkspaceSurfaces() {
  const { controller, state } = useWorkspace();
  const isWide = useMediaQuery("(min-width: 1180px)");
  if (controller.activeIsData) return <Suspense fallback={<DataLoadingSurface />}><DataInspector /></Suspense>;
  if (isWide) return <WideWorkspaceSurfaces />;
  return state.compactSurface === "editor" ? <EditorPane /> : <PreviewPane />;
}

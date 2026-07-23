import { Suspense, useEffect } from "react";
import { useWorkspacePluginRegistry, useWorkspacePlugins } from "@/app/plugins/plugin-context";
import { shallowEqual, useWorkspaceController, useWorkspaceSelector } from "@/app/workspace-context";
import { SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/features/workspace/app-sidebar";
import { DocumentTabs } from "@/features/workspace/document-tabs";
import { ProblemsPanel } from "@/features/workspace/problems-panel";
import { WorkspaceAiTaskDock } from "@/features/workspace/workspace-ai-task-dock";
import { WorkspaceSurfaces } from "@/features/workspace/workspace-surfaces";
import { WorkspaceTopbar } from "@/features/workspace/workspace-topbar";
import { cn } from "@/lib/utils";

function WorkspaceMain() {
  const controller = useWorkspaceController();
  const pluginRegistry = useWorkspacePluginRegistry();
  useWorkspacePlugins();
  const state = useWorkspaceSelector(
    (workspace) => ({ sidebarView: workspace.sidebarView, tabs: workspace.tabs }),
    shallowEqual,
  );
  const feature = pluginRegistry.view(state.sidebarView);
  const pageActive = feature.location === "page";
  const FeaturePage = feature.component;

  useEffect(() => {
    if (feature.id !== state.sidebarView) controller.setSidebarView(feature.id);
  }, [controller, feature.id, state.sidebarView]);

  return (
    <SidebarInset className="h-[100dvh] min-h-0 overflow-hidden bg-background">
      <div
        className={cn(
          "absolute inset-0 flex min-h-0 flex-col overflow-hidden",
          pageActive && "invisible pointer-events-none",
        )}
        aria-hidden={pageActive || undefined}
        inert={pageActive || undefined}
      >
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
      </div>

      {pageActive ? (
        <div className="absolute inset-0 min-h-0 overflow-hidden bg-background">
          <Suspense fallback={<div className="h-full animate-pulse bg-muted/20" />}>
            <FeaturePage requestEntryDialog={() => undefined} />
          </Suspense>
        </div>
      ) : null}
    </SidebarInset>
  );
}

export function WorkspaceShell() {
  return (
    <div className="flex min-h-[100dvh] w-full overflow-hidden bg-background">
      <AppSidebar />
      <WorkspaceMain />
      <WorkspaceAiTaskDock />
    </div>
  );
}

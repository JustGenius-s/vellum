import { Suspense } from "react";
import { shallowEqual, useWorkspaceSelector } from "@/app/workspace-context";
import { workspaceFeature } from "@/application/workspace-features";
import { SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/features/workspace/app-sidebar";
import { DocumentTabs } from "@/features/workspace/document-tabs";
import { ProblemsPanel } from "@/features/workspace/problems-panel";
import { WorkspaceAiTaskDock } from "@/features/workspace/workspace-ai-task-dock";
import { WorkspaceSurfaces } from "@/features/workspace/workspace-surfaces";
import { WorkspaceTopbar } from "@/features/workspace/workspace-topbar";

function WorkspaceMain() {
  const state = useWorkspaceSelector(
    (workspace) => ({ sidebarView: workspace.sidebarView, tabs: workspace.tabs }),
    shallowEqual,
  );
  const feature = workspaceFeature(state.sidebarView);

  if (feature.location === "page") {
    const FeaturePage = feature.component;
    return (
      <SidebarInset className="h-[100dvh] min-h-0 overflow-hidden bg-background">
        <Suspense fallback={<div className="h-full animate-pulse bg-muted/20" />}>
          <FeaturePage />
        </Suspense>
      </SidebarInset>
    );
  }

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
      <WorkspaceAiTaskDock />
    </div>
  );
}

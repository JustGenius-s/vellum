import { lazy, Suspense } from "react";
import { useWorkspace } from "@/app/workspace-context";
import { SidebarInset } from "@/components/ui/sidebar";
import { PackageManagerPage } from "@/features/packages/package-manager-page";
import { SettingsPage } from "@/features/settings/settings-page";
import { AppSidebar } from "@/features/workspace/app-sidebar";
import { DocumentTabs } from "@/features/workspace/document-tabs";
import { ProblemsPanel } from "@/features/workspace/problems-panel";
import { WorkspaceAiTaskDock } from "@/features/workspace/workspace-ai-task-dock";
import { WorkspaceSurfaces } from "@/features/workspace/workspace-surfaces";
import { WorkspaceTopbar } from "@/features/workspace/workspace-topbar";

const TasksPage = lazy(() =>
  import("@/features/tasks/tasks-page").then((module) => ({ default: module.TasksPage })),
);

function WorkspaceMain() {
  const { state } = useWorkspace();

  if (state.sidebarView === "tasks") {
    return (
      <SidebarInset className="h-[100dvh] min-h-0 overflow-hidden bg-background">
        <Suspense fallback={<div className="h-full animate-pulse bg-muted/20" />}>
          <TasksPage />
        </Suspense>
      </SidebarInset>
    );
  }

  if (state.sidebarView === "packages") {
    return (
      <SidebarInset className="h-[100dvh] min-h-0 overflow-hidden bg-background">
        <PackageManagerPage />
      </SidebarInset>
    );
  }

  if (state.sidebarView === "settings") {
    return (
      <SidebarInset className="h-[100dvh] min-h-0 overflow-hidden bg-background">
        <SettingsPage />
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

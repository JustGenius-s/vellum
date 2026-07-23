import { Suspense, useMemo, useState } from "react";
import { BooksIcon } from "@phosphor-icons/react";
import { useWorkspacePluginRegistry, useWorkspacePlugins } from "@/app/plugins/plugin-context";
import type { SidebarView } from "@/application/workspace-state";
import { shallowEqual, useWorkspaceController, useWorkspaceSelector } from "@/app/workspace-context";
import { Button } from "@/components/ui/button";
import { Sidebar, useSidebar } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fileName } from "@/domain/workspace";
import { EntryDialog } from "@/features/workspace/sidebar/entry-dialog";
import type { EntryDialogState } from "@/features/workspace/sidebar/workspace-sidebar-types";

export function AppSidebar() {
  const controller = useWorkspaceController();
  const pluginRegistry = useWorkspacePluginRegistry();
  const { views } = useWorkspacePlugins();
  const state = useWorkspaceSelector(
    (workspace) => ({ sidebarView: workspace.sidebarView, vaultPath: workspace.vaultPath }),
    shallowEqual,
  );
  const { state: sidebarState, setOpen, setOpenMobile, isMobile } = useSidebar();
  const [dialog, setDialog] = useState<EntryDialogState>(null);
  const vaultName = useMemo(
    () => (state.vaultPath ? fileName(state.vaultPath) : "Local workspace"),
    [state.vaultPath],
  );
  const activeView = pluginRegistry.view(state.sidebarView);
  const primaryViews = views.filter((view) => view.placement === "primary");
  const footerViews = views.filter((view) => view.placement === "footer");
  const ActivePanel = activeView.component;

  function selectView(viewId: SidebarView) {
    const view = pluginRegistry.view(viewId);
    if (view.location === "page") {
      if (state.sidebarView !== viewId) controller.setSidebarView(viewId);
      view.onActivate?.(controller);
      if (isMobile) setOpenMobile(false);
      else setOpen(false);
      return;
    }

    if (!isMobile && state.sidebarView === viewId) {
      setOpen(sidebarState === "collapsed");
      return;
    }

    controller.setSidebarView(viewId);
    view.onActivate?.(controller);
    if (isMobile) setOpenMobile(false);
    else setOpen(true);
  }

  return (
    <>
      <Sidebar collapsible="icon" className="bg-sidebar">
        <div className="flex size-full min-h-0">
          <nav className="flex w-12 shrink-0 flex-col items-center bg-sidebar-accent/50 py-2" aria-label="Workspace views">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground" aria-label="Vellum">
                  <BooksIcon className="size-4.5" weight="duotone" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">Vellum</TooltipContent>
            </Tooltip>

            <div className="mt-3 flex flex-col gap-1">
              {primaryViews.map(({ id, label, icon: Icon }) => (
                <Tooltip key={id}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`size-9 ${state.sidebarView === id ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/60 hover:text-sidebar-foreground"}`}
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

            <div className="mt-auto flex flex-col gap-1">
              {footerViews.map(({ id, label, icon: Icon }) => (
                <Tooltip key={id}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`size-9 ${state.sidebarView === id ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/60 hover:text-sidebar-foreground"}`}
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
          </nav>

          {activeView.location === "panel" ? (
            <div className="flex min-w-0 flex-1 flex-col bg-sidebar group-data-[collapsible=icon]:hidden">
              <header className="flex h-12 shrink-0 items-center px-3">
                <h2 className="min-w-0 flex-1 truncate text-sm font-medium text-sidebar-foreground">
                  {state.sidebarView === "files" ? vaultName : activeView.label}
                </h2>
              </header>
              <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                <Suspense fallback={<div className="h-20 animate-pulse rounded-md bg-sidebar-accent/60" />}>
                  <ActivePanel requestEntryDialog={setDialog} />
                </Suspense>
              </div>
            </div>
          ) : null}
        </div>
      </Sidebar>
      <EntryDialog state={dialog} onClose={() => setDialog(null)} />
    </>
  );
}

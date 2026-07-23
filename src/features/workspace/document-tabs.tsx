import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { FileTypeIcon } from "@/components/ui/file-type-icon";
import { fileStem } from "@/domain/workspace";
import { shallowEqual, useWorkspaceController, useWorkspaceSelector } from "@/app/workspace-context";
import { XIcon } from "@phosphor-icons/react";

export function DocumentTabs() {
  const controller = useWorkspaceController();
  const state = useWorkspaceSelector(
    (workspace) => ({ activePath: workspace.activePath, tabs: workspace.tabs }),
    shallowEqual,
  );
  if (!state.tabs.length) return null;

  return (
    <div className="no-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto">
      {state.tabs.map((tab) => {
        const active = tab.path === state.activePath;
        const tabIndex = state.tabs.findIndex((candidate) => candidate.path === tab.path);
        const hasOtherTabs = state.tabs.length > 1;
        const hasTabsToRight = tabIndex < state.tabs.length - 1;
        const closeOthers = state.tabs
          .filter((candidate) => candidate.path !== tab.path)
          .map((candidate) => candidate.path);
        const closeToRight = state.tabs.slice(tabIndex + 1).map((candidate) => candidate.path);

        return (
          <ContextMenu key={tab.path}>
            <ContextMenuTrigger asChild>
              <div
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
            </ContextMenuTrigger>
            <ContextMenuContent className="min-w-52">
              <ContextMenuItem onSelect={() => controller.closeTab(tab.path)}>Close</ContextMenuItem>
              <ContextMenuItem
                disabled={!hasOtherTabs}
                onSelect={() => controller.closeTabs(closeOthers)}
              >
                Close Others
              </ContextMenuItem>
              <ContextMenuItem
                disabled={!hasTabsToRight}
                onSelect={() => controller.closeTabs(closeToRight)}
              >
                Close to the Right
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                onSelect={() => controller.closeTabs(state.tabs.map((item) => item.path))}
              >
                Close All Tabs
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        );
      })}
    </div>
  );
}

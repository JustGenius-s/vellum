import { useMemo } from "react";
import { CommandIcon, DownloadSimpleIcon, RobotIcon } from "@phosphor-icons/react";
import { useCommandRegistration, useCommands } from "@/app/command-context";
import { useWorkspace } from "@/app/workspace-context";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isDataFile } from "@/domain/data";
import { documentFormat, fileStem } from "@/domain/workspace";
import { DocumentTabs } from "@/features/workspace/document-tabs";

function CompactSurfaceSwitch() {
  const { controller, state } = useWorkspace();
  if (controller.activeIsData) return null;

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

export function WorkspaceTopbar() {
  const { controller } = useWorkspace();
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
  const canExport = Boolean(
    active && !isDataFile(active.path) && documentFormat(active.path) !== "bibliography",
  );
  const canUseWorkspaceAi = Boolean(active && !isDataFile(active.path));

  return (
    <header className="flex h-12 shrink-0 items-center gap-1.5 border-b bg-background px-2 sm:px-3">
      <div className="hidden min-w-0 flex-1 min-[1180px]:block"><DocumentTabs /></div>
      <span className="min-w-0 flex-1 truncate px-1 text-sm font-medium min-[1180px]:hidden">
        {active ? fileStem(active.name) : "Workspace"}
        {active?.dirty ? " *" : ""}
      </span>
      <CompactSurfaceSwitch />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="sm" className="hidden h-8 text-xs lg:flex" onClick={() => openPalette("commands")}>
            <CommandIcon /><span>Commands</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Open command palette</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => controller.openWorkspaceAiTask()} disabled={!canUseWorkspaceAi} aria-label="Ask AI about this file">
            <RobotIcon /><span className="hidden md:inline">Ask AI</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Open a workspace editing task</TooltipContent>
      </Tooltip>
      <Button size="sm" className="h-8" onClick={() => void controller.exportPdf()} disabled={!canExport} aria-label="Export PDF">
        <DownloadSimpleIcon /><span className="hidden md:inline">Export</span>
      </Button>
      <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={() => openPalette("commands")} aria-label="Open commands">
        <CommandIcon />
      </Button>
    </header>
  );
}

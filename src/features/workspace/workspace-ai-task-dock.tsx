import { lazy, Suspense } from "react";
import { CircleNotchIcon, ListChecksIcon } from "@phosphor-icons/react";
import { shallowEqual, useWorkspaceController, useWorkspaceSelector } from "@/app/workspace-context";
import { Button } from "@/components/ui/button";

const QuickTaskPopover = lazy(() =>
  import("@/features/tasks/quick-task-popover").then((module) => ({
    default: module.QuickTaskPopover,
  })),
);

export function WorkspaceAiTaskDock() {
  const controller = useWorkspaceController();
  const state = useWorkspaceSelector(
    (workspace) => ({
      aiTaskPopoverOpen: workspace.aiTaskPopoverOpen,
      aiTasks: workspace.aiTasks,
      selectedAiTaskId: workspace.selectedAiTaskId,
      sidebarView: workspace.sidebarView,
    }),
    shallowEqual,
  );
  const tasks = state.aiTasks.filter((task) => !task.archivedAt);
  if (state.sidebarView === "tasks" || !tasks.length || !state.selectedAiTaskId) return null;
  const activeCount = tasks.filter((task) => task.status === "running" || task.status === "queued").length;
  const attentionCount = tasks.filter((task) => task.status === "failed" || task.status === "interrupted").length;
  const label = activeCount
    ? `${activeCount} active task${activeCount === 1 ? "" : "s"}`
    : attentionCount
      ? `${attentionCount} task${attentionCount === 1 ? "" : "s"} need attention`
      : `${tasks.length} AI task${tasks.length === 1 ? "" : "s"}`;
  const icon = activeCount ? <CircleNotchIcon className="animate-spin" /> : <ListChecksIcon />;
  const trigger = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="fixed right-3 bottom-3 z-40 h-9 max-w-[calc(100vw-1.5rem)] gap-2 rounded-full bg-background/95 px-3 shadow-md ring-1 ring-foreground/5 backdrop-blur-sm active:scale-[0.98] sm:right-4 sm:bottom-4"
      aria-label={`Open AI task: ${label}`}
    >
      {icon}
      <span className="truncate">{label}</span>
      {activeCount ? <span className="font-mono text-[10px] text-muted-foreground">{activeCount}</span> : null}
    </Button>
  );

  return (
    <Suspense fallback={trigger}>
      <QuickTaskPopover
        open={state.aiTaskPopoverOpen}
        onOpenChange={(open) => controller.setAiTaskPopoverOpen(open)}
      >
        {trigger}
      </QuickTaskPopover>
    </Suspense>
  );
}

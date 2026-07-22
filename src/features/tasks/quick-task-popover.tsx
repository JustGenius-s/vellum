import type { ReactElement } from "react";
import { ArrowsOutSimpleIcon, ChartLineIcon, XIcon } from "@phosphor-icons/react";

import { useWorkspace } from "@/app/workspace-context";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TaskConversation } from "@/features/tasks/task-conversation";

export function QuickTaskPopover({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  children: ReactElement;
}) {
  const { controller, state } = useWorkspace();
  const task = state.aiTasks.find((candidate) => candidate.id === state.selectedAiTaskId) ?? null;
  const tasks = state.aiTasks.filter((candidate) => !candidate.archivedAt);
  const running = task?.status === "running" || task?.status === "queued";

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        sideOffset={8}
        className="flex h-[min(48rem,calc(100dvh-4rem))] w-[calc(100vw-1rem)] max-w-none flex-col gap-0 overflow-hidden rounded-lg p-0 shadow-lg sm:w-[44rem]"
      >
        <PopoverHeader className="relative flex-row items-center gap-2 border-b px-3 py-2.5">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-muted/30 text-muted-foreground">
            <ChartLineIcon className="size-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <PopoverTitle className="sr-only">AI task</PopoverTitle>
            <PopoverDescription className="sr-only">Persistent workspace AI conversation</PopoverDescription>
            {task ? (
              <Select value={task.id} onValueChange={(taskId) => controller.selectAiTask(taskId)}>
                <SelectTrigger size="sm" className="h-7 w-full max-w-80 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  {tasks.map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      <span className="block max-w-72 truncate">{candidate.title}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="text-sm font-medium">AI task</span>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              if (task) controller.selectAiTask(task.id, true);
              onOpenChange(false);
            }}
            aria-label="Open tasks page"
          >
            <ArrowsOutSimpleIcon />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => onOpenChange(false)} aria-label="Close task">
            <XIcon />
          </Button>
          {running ? <Progress value={task.progress} className="absolute inset-x-0 bottom-0 h-px rounded-none" /> : null}
        </PopoverHeader>
        {task ? (
          <TaskConversation key={task.id} task={task} compact />
        ) : (
          <div className="flex flex-1 items-center justify-center px-6 text-sm text-muted-foreground">No task selected.</div>
        )}
      </PopoverContent>
    </Popover>
  );
}

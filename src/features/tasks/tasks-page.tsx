import { useMemo, useState, type ComponentType } from "react";
import {
  ArchiveIcon,
  ArrowLeftIcon,
  ChartLineIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  ClockIcon,
  DatabaseIcon,
  DotsThreeIcon,
  FileTextIcon,
  FolderOpenIcon,
  ListChecksIcon,
  MagnifyingGlassIcon,
  RobotIcon,
  SidebarSimpleIcon,
  WarningCircleIcon,
  XCircleIcon,
} from "@phosphor-icons/react";

import { useWorkspace } from "@/app/workspace-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { aiTaskStatusActive, type AiTask, type AiTaskStatus } from "@/domain/ai-task";
import { fileName, relativePath } from "@/domain/workspace";
import { TaskConversation } from "@/features/tasks/task-conversation";

type TaskFilter = "all" | "active" | "attention" | "archived";

const statusPresentation: Record<
  AiTaskStatus,
  { label: string; icon: ComponentType<{ className?: string; weight?: "fill" | "regular" }> }
> = {
  draft: { label: "Draft", icon: ClockIcon },
  queued: { label: "Queued", icon: ClockIcon },
  running: { label: "Running", icon: CircleNotchIcon },
  "waiting-input": { label: "Waiting", icon: ClockIcon },
  completed: { label: "Completed", icon: CheckCircleIcon },
  failed: { label: "Failed", icon: XCircleIcon },
  cancelled: { label: "Stopped", icon: XCircleIcon },
  interrupted: { label: "Interrupted", icon: WarningCircleIcon },
};

function relativeTime(timestamp: number) {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function TaskStatus({ task }: { task: AiTask }) {
  const presentation = statusPresentation[task.status];
  const Icon = presentation.icon;
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
      <Icon
        className={`size-3 ${task.status === "running" ? "animate-spin" : ""}`}
        weight={task.status === "completed" ? "fill" : "regular"}
      />
      {presentation.label}
    </span>
  );
}

function TaskInspector({ task }: { task: AiTask }) {
  const { controller, state } = useWorkspace();
  const sameVault = state.vaultPath === task.source.vaultPath;
  return (
    <div className="space-y-6 px-4 py-5">
      <section>
        <h3 className="mb-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Source</h3>
        <button
          type="button"
          disabled={!sameVault}
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-muted disabled:opacity-50"
          onClick={() => void controller.openFile(task.source.path)}
        >
          {task.source.kind === "data-figure" ? (
            <DatabaseIcon className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 flex-1 truncate font-mono">{relativePath(task.source.path, task.source.vaultPath)}</span>
        </button>
      </section>

      <section>
        <h3 className="mb-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Context files</h3>
        {task.contextPaths.length ? (
          <div className="space-y-0.5">
            {task.contextPaths.map((path) => (
              <button key={path} type="button" disabled={!sameVault} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-50" onClick={() => void controller.openFile(path)}>
                <FolderOpenIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate font-mono">{relativePath(path, task.source.vaultPath)}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="px-2 text-xs leading-5 text-muted-foreground">No additional files attached.</p>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Artifacts</h3>
        {task.artifacts.length ? (
          <div className="space-y-1">
            {task.artifacts.map((artifact) => (
              <button key={artifact.id} type="button" disabled={!sameVault} className="w-full rounded-md border px-2.5 py-2 text-left hover:bg-muted/40 disabled:opacity-50" onClick={() => void controller.openFile(artifact.path)}>
                <span className="block truncate text-xs font-medium">{artifact.label}</span>
                <span className="mt-0.5 block truncate font-mono text-[9px] text-muted-foreground">{relativePath(artifact.path, task.source.vaultPath)}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="px-2 text-xs leading-5 text-muted-foreground">Generated files appear here.</p>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Changed files</h3>
        {task.fileChanges.length ? (
          <div className="space-y-2 px-2">
            {task.fileChanges.map((change) => (
              <button
                key={change.id}
                type="button"
                disabled={!sameVault}
                className="flex w-full items-start gap-2 rounded-md py-1 text-left text-xs hover:bg-muted disabled:opacity-50"
                onClick={() => void controller.openFile(change.path)}
              >
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-muted-foreground/45" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[10px]">{relativePath(change.path, task.source.vaultPath)}</span>
                  <span className="text-[10px] text-muted-foreground">{change.operation} · {change.saved ? "saved" : "editor buffer"}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="px-2 text-xs leading-5 text-muted-foreground">No workspace changes yet.</p>
        )}
      </section>
    </div>
  );
}

export function TasksPage() {
  const { controller, state } = useWorkspace();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [mobileDetail, setMobileDetail] = useState(Boolean(state.selectedAiTaskId));
  const selected = state.aiTasks.find((task) => task.id === state.selectedAiTaskId) ?? null;
  const tasks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...state.aiTasks]
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .filter((task) => {
        if (filter === "active" && !aiTaskStatusActive(task.status)) return false;
        if (filter === "attention" && !["failed", "interrupted", "waiting-input"].includes(task.status)) return false;
        if (filter === "archived" && !task.archivedAt) return false;
        if (filter !== "archived" && task.archivedAt) return false;
        if (!needle) return true;
        return `${task.title} ${task.source.path}`.toLowerCase().includes(needle);
      });
  }, [filter, query, state.aiTasks]);

  function selectTask(taskId: string) {
    controller.selectAiTask(taskId, true);
    setMobileDetail(true);
  }

  const taskList = (
    <aside className={`${mobileDetail ? "hidden md:flex" : "flex"} h-full min-h-0 w-full shrink-0 flex-col border-r bg-muted/10 md:w-72`}>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">AI tasks</h1>
      </header>
      <div className="space-y-2 border-b p-3">
        <div className="relative">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks" className="h-8 pl-8 text-xs" />
        </div>
        <Tabs value={filter} onValueChange={(value) => setFilter(value as TaskFilter)}>
          <TabsList className="grid h-8 w-full grid-cols-4 rounded-md">
            <TabsTrigger value="all" className="text-[10px]">All</TabsTrigger>
            <TabsTrigger value="active" className="text-[10px]">Active</TabsTrigger>
            <TabsTrigger value="attention" className="text-[10px]">Issues</TabsTrigger>
            <TabsTrigger value="archived" className="text-[10px]">Archive</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-0.5 p-2">
          {tasks.map((task) => (
            <button
              key={task.id}
              type="button"
              className={`w-full rounded-md px-2.5 py-2.5 text-left transition-colors ${selected?.id === task.id ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
              onClick={() => selectTask(task.id)}
            >
              <span className="block truncate text-xs font-medium">{task.title}</span>
              <span className="mt-1.5 flex items-center gap-2">
                <TaskStatus task={task} />
                <span className="ml-auto font-mono text-[9px] text-muted-foreground">{relativeTime(task.updatedAt)}</span>
              </span>
              <span className="mt-1 block truncate font-mono text-[9px] text-muted-foreground/75">{fileName(task.source.path)}</span>
            </button>
          ))}
          {!tasks.length ? (
            <div className="px-3 py-12 text-center">
              <ListChecksIcon className="mx-auto size-7 text-muted-foreground/50" />
              <p className="mt-3 text-xs text-muted-foreground">No tasks in this view.</p>
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </aside>
  );

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      {taskList}
      <main className={`${mobileDetail ? "flex" : "hidden md:flex"} min-h-0 min-w-0 flex-1 flex-col`}>
        {selected ? (
          <>
            <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
              <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={() => setMobileDetail(false)} aria-label="Back to task list">
                <ArrowLeftIcon />
              </Button>
              {selected.source.kind === "data-figure" ? (
                <ChartLineIcon className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <RobotIcon className="size-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-medium">{selected.title}</h2>
                <TaskStatus task={selected} />
              </div>
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon-sm" className="xl:hidden" aria-label="Show task details"><SidebarSimpleIcon /></Button>
                </SheetTrigger>
                <SheetContent className="w-[min(22rem,90vw)] gap-0 p-0">
                  <SheetHeader className="border-b">
                    <SheetTitle>Task details</SheetTitle>
                    <SheetDescription>Context, artifacts, and changed files.</SheetDescription>
                  </SheetHeader>
                  <ScrollArea className="min-h-0 flex-1"><TaskInspector task={selected} /></ScrollArea>
                </SheetContent>
              </Sheet>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Task actions"><DotsThreeIcon /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {(selected.status === "failed" || selected.status === "cancelled" || selected.status === "interrupted") ? (
                    <DropdownMenuItem onSelect={() => controller.retryAiTask(selected.id)}>Retry task</DropdownMenuItem>
                  ) : null}
                  {aiTaskStatusActive(selected.status) ? (
                    <DropdownMenuItem onSelect={() => controller.cancelAiTask(selected.id)}>Stop current run</DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem onSelect={() => controller.archiveAiTask(selected.id, !selected.archivedAt)}>
                    <ArchiveIcon /> {selected.archivedAt ? "Restore" : "Archive"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </header>
            <div className="flex min-h-0 flex-1">
              <TaskConversation task={selected} />
              <aside className="hidden min-h-0 w-72 shrink-0 border-l bg-muted/10 xl:block">
                <ScrollArea className="h-full"><TaskInspector task={selected} /></ScrollArea>
              </aside>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center px-6">
            <div className="max-w-sm text-center">
              <ListChecksIcon className="mx-auto size-9 text-muted-foreground/45" />
              <h2 className="mt-4 text-sm font-medium">Select a task</h2>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">Start an AI task from an open document or data file, then return here to continue the conversation.</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

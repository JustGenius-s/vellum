import {
  CaretRightIcon,
  CheckCircleIcon,
  CopyIcon,
  RobotIcon,
  WarningIcon,
  XCircleIcon,
  XIcon,
} from "@phosphor-icons/react";

import { useWorkspace } from "@/app/workspace-context";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { CompileDiagnostic } from "@/domain/workspace";
import { formatDiagnosticForClipboard } from "@/features/workspace/diagnostic-copy";

interface DiagnosticGroup {
  key: string;
  name: string;
  directory: string;
  diagnostics: CompileDiagnostic[];
}

function groupDiagnostics(diagnostics: CompileDiagnostic[]): DiagnosticGroup[] {
  const groups = new Map<string, DiagnosticGroup>();

  for (const diagnostic of diagnostics) {
    const normalizedPath = diagnostic.path
      ? diagnostic.path.replaceAll("\\", "/").replace(/^\.\//, "")
      : null;
    const key = normalizedPath ?? "__compiler__";
    let group = groups.get(key);

    if (!group) {
      const segments = normalizedPath?.split("/") ?? [];
      const name = segments.pop() ?? "Compiler";
      group = {
        key,
        name,
        directory: segments.join("/"),
        diagnostics: [],
      };
      groups.set(key, group);
    }

    group.diagnostics.push(diagnostic);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      diagnostics: [...group.diagnostics].sort((left, right) => {
        const severity = Number(left.severity !== "error") - Number(right.severity !== "error");
        if (severity) return severity;
        const line =
          (left.line ?? Number.MAX_SAFE_INTEGER) - (right.line ?? Number.MAX_SAFE_INTEGER);
        if (line) return line;
        return (left.column ?? Number.MAX_SAFE_INTEGER) - (right.column ?? Number.MAX_SAFE_INTEGER);
      }),
    }))
    .sort((left, right) => {
      if (left.key === "__compiler__") return 1;
      if (right.key === "__compiler__") return -1;
      return left.key.localeCompare(right.key);
    });
}

export function ProblemsPanel() {
  const { controller, state } = useWorkspace();
  if (!state.problemsOpen) return null;

  const groups = groupDiagnostics(state.diagnostics);
  const fileCount = groups.filter((group) => group.key !== "__compiler__").length;
  const canFixWithAi = Boolean(
    state.diagnostics.length && controller.activeTab && !controller.activeIsData,
  );

  return (
    <section
      className="flex h-[min(18rem,42dvh)] shrink-0 flex-col overflow-hidden border-t bg-background"
      aria-label="Compile problems"
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b px-3 sm:px-4">
        <h2 className="text-sm font-medium">Problems</h2>
        {state.diagnostics.length ? (
          <span className="truncate text-xs text-muted-foreground">
            {state.diagnostics.length} {state.diagnostics.length === 1 ? "problem" : "problems"}
            {fileCount ? ` in ${fileCount} ${fileCount === 1 ? "file" : "files"}` : ""}
          </span>
        ) : null}
        {canFixWithAi ? (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto h-7 text-xs"
            onClick={() =>
              controller.openWorkspaceAiTask(
                state.activePath,
                "Fix the current compiler errors with the smallest safe change, then compile again to verify the result.",
              )
            }
          >
            <RobotIcon /> Fix with AI
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon-xs"
          className={canFixWithAi ? "" : "ml-auto"}
          onClick={() => controller.setProblemsOpen(false)}
          aria-label="Close problems"
        >
          <XIcon />
        </Button>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        {state.diagnostics.length ? (
          <div className="py-1">
            {groups.map((group) => (
              <Collapsible key={group.key} defaultOpen className="group/file">
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 w-full justify-start rounded-none px-3 text-left font-normal"
                  >
                    <CaretRightIcon className="size-3.5 text-muted-foreground transition-transform group-data-[state=open]/file:rotate-90" />
                    <span className="min-w-0 truncate text-sm font-medium">{group.name}</span>
                    {group.directory ? (
                      <span className="min-w-0 truncate text-xs text-muted-foreground">
                        {group.directory}
                      </span>
                    ) : null}
                    <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                      {group.diagnostics.length}
                    </span>
                  </Button>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  {group.diagnostics.map((diagnostic, index) => {
                    const isError = diagnostic.severity === "error";
                    const key = `${diagnostic.line}:${diagnostic.column}:${diagnostic.message}:${index}`;

                    return (
                      <ContextMenu key={key}>
                        <ContextMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            className="grid h-auto min-h-10 w-full grid-cols-[1rem_minmax(0,1fr)_auto] items-start gap-2 rounded-none py-1.5 pr-3 pl-8 text-left whitespace-normal"
                            onClick={() => void controller.openDiagnostic(diagnostic)}
                          >
                            {isError ? (
                              <XCircleIcon className="mt-0.5 size-4 text-destructive" />
                            ) : (
                              <WarningIcon className="mt-0.5 size-4 text-muted-foreground" />
                            )}
                            <span className="min-w-0">
                              <span className="block text-sm leading-5 text-foreground">
                                {diagnostic.message}
                              </span>
                              {diagnostic.hints.length ? (
                                <span className="block text-xs leading-4 text-muted-foreground">
                                  {diagnostic.hints.join(" · ")}
                                </span>
                              ) : null}
                            </span>
                            {diagnostic.line ? (
                              <span className="pt-0.5 font-mono text-xs leading-4 text-muted-foreground">
                                {diagnostic.line}:{diagnostic.column ?? 1}
                              </span>
                            ) : null}
                          </Button>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="min-w-40">
                          <ContextMenuItem
                            onSelect={() =>
                              void navigator.clipboard.writeText(
                                formatDiagnosticForClipboard(diagnostic),
                              )
                            }
                          >
                            <CopyIcon />
                            Copy {isError ? "error" : "warning"}
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    );
                  })}
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        ) : (
          <div className="flex h-full min-h-36 flex-col items-center justify-center gap-2 text-center">
            <CheckCircleIcon className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">No problems found</p>
          </div>
        )}
      </ScrollArea>
    </section>
  );
}

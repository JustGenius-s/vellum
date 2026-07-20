import { CheckCircleIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";

import { useWorkspace } from "@/app/workspace-context";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

export function ProblemsPanel() {
  const { controller, state } = useWorkspace();
  if (!state.problemsOpen) return null;

  return (
    <section
      className="absolute inset-x-0 bottom-0 z-30 flex h-[min(20rem,46dvh)] flex-col overflow-hidden border-t bg-background"
      aria-label="Compile problems"
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b px-3 sm:px-4">
        <WarningCircleIcon className="size-4 text-muted-foreground" />
        <h2 className="text-xs font-semibold">Problems</h2>
        <span className="text-xs text-muted-foreground">{state.diagnostics.length}</span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="ml-auto"
          onClick={() => controller.setProblemsOpen(false)}
          aria-label="Close problems"
        >
          <XIcon />
        </Button>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        {state.diagnostics.length ? (
          <div className="divide-y divide-border/55 px-2 py-1.5 sm:px-3">
            {state.diagnostics.map((diagnostic, index) => (
              <button
                key={`${diagnostic.path}:${diagnostic.line}:${diagnostic.message}:${index}`}
                type="button"
                className="flex min-h-14 w-full items-start gap-3 rounded-lg px-2.5 py-2.5 text-left hover:bg-muted/70 active:translate-y-px"
                onClick={() => void controller.openDiagnostic(diagnostic)}
              >
                <WarningCircleIcon
                  className={`mt-0.5 size-4 shrink-0 ${diagnostic.severity === "warning" ? "text-amber-400" : "text-destructive"}`}
                  weight="fill"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs leading-5 text-foreground">
                    {diagnostic.message}
                  </span>
                  {diagnostic.hints.length ? (
                    <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">
                      {diagnostic.hints.join(" · ")}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-right font-mono text-[9px] leading-4 text-muted-foreground">
                  {diagnostic.path ? (
                    <span className="block max-w-40 truncate">{diagnostic.path}</span>
                  ) : null}
                  {diagnostic.line ? (
                    <span>
                      {diagnostic.line}:{diagnostic.column ?? 1}
                    </span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex h-full min-h-36 flex-col items-center justify-center gap-2 text-center">
            <CheckCircleIcon className="size-7 text-muted-foreground" weight="duotone" />
            <p className="text-sm font-semibold">No problems found</p>
          </div>
        )}
      </ScrollArea>
    </section>
  );
}

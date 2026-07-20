import { CheckCircleIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";

import { useWorkspace } from "@/app/workspace-context";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

export function ProblemsPanel() {
  const { controller, state } = useWorkspace();
  if (!state.problemsOpen) return null;

  return (
    <section
      className="absolute inset-x-2 bottom-9 z-30 flex h-[min(19rem,42dvh)] flex-col overflow-hidden rounded-lg border border-border/80 bg-popover/96 shadow-[var(--shadow-float)] backdrop-blur-xl md:inset-x-3"
      aria-label="Compile problems"
    >
      <header className="flex min-h-10 items-center gap-2 border-b border-border/70 px-3">
        <span className="relative flex size-2">
          {state.compilePhase === "compiling" ? (
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--signal)] opacity-45" />
          ) : null}
          <span className="relative inline-flex size-2 rounded-full bg-[var(--signal)]" />
        </span>
        <WarningCircleIcon className="size-4 text-[var(--signal)]" />
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em]">Problems</h2>
        <span className="font-mono text-[9px] text-muted-foreground">
          {state.diagnostics.length} diagnostics
        </span>
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
          <div className="divide-y divide-border/55 p-1.5">
            {state.diagnostics.map((diagnostic, index) => (
              <button
                key={`${diagnostic.path}:${diagnostic.line}:${diagnostic.message}:${index}`}
                type="button"
                className="flex min-h-12 w-full items-start gap-3 rounded-md px-2.5 py-2 text-left hover:bg-muted/70 active:translate-y-px"
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
            <CheckCircleIcon className="size-6 text-[var(--signal)]" weight="fill" />
            <p className="text-sm font-medium">The document compiles cleanly</p>
            <p className="text-xs text-muted-foreground">
              Warnings and errors will appear here with source locations.
            </p>
          </div>
        )}
      </ScrollArea>
    </section>
  );
}

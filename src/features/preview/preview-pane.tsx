import { useLayoutEffect, useRef } from "react";
import {
  BookOpenTextIcon,
  FileTextIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";

import { useWorkspace } from "@/app/workspace-context";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { documentFormat } from "@/domain/workspace";
import { cn } from "@/lib/utils";

const pageStyles = `
  :host {
    display: block;
    width: 100%;
    line-height: 0;
  }

  svg {
    display: block;
    width: 100%;
    height: auto;
  }
`;

function InlineSvgPage({ svg, index, count }: { svg: string; index: number; count: number }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${pageStyles}</style>${svg}`;

    return () => root.replaceChildren();
  }, [svg]);

  return (
    <div
      ref={hostRef}
      role="img"
      aria-label={`Typst page ${index + 1} of ${count}`}
      className="w-full shrink-0 overflow-hidden bg-background shadow-sm ring-1 ring-foreground/10"
    />
  );
}

function CompileStatus() {
  const { state } = useWorkspace();
  const progress = state.compileProgress;

  if (
    !state.activePath ||
    documentFormat(state.activePath) === "bibliography" ||
    state.compilePhase === "ready"
  ) {
    return null;
  }

  const failed = state.compilePhase === "failed";
  const value = progress?.value ?? (failed ? 100 : 0);
  const label = progress?.label ?? (failed ? "Compile failed" : "Waiting to compile");
  const detail = progress?.detail;

  return (
    <div
      className="shrink-0 border-b bg-background px-3 py-2"
      role="status"
      aria-live="polite"
      aria-label={`Compile status: ${label}${detail ? `, ${detail}` : ""}`}
    >
      <div className="mb-1.5 flex min-w-0 items-center gap-2 text-xs">
        {failed ? (
          <WarningCircleIcon className="size-3.5 shrink-0 text-destructive" weight="fill" />
        ) : (
          <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-foreground" />
        )}
        <span className={cn("shrink-0 font-medium", failed && "text-destructive")}>{label}</span>
        {detail ? <span className="min-w-0 truncate text-muted-foreground">{detail}</span> : null}
        <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
          {Math.round(value)}%
        </span>
      </div>
      <Progress
        value={value}
        aria-label="Compile progress"
        aria-valuetext={`${label}${detail ? `: ${detail}` : ""}`}
        className={cn("h-1", failed && "[&_[data-slot=progress-indicator]]:bg-destructive")}
      />
    </div>
  );
}

export function PreviewPane() {
  const { state } = useWorkspace();
  const hasPages = state.previewPages.length > 0;
  const isBibliography =
    Boolean(state.activePath) && documentFormat(state.activePath) === "bibliography";

  return (
    <section
      className="flex h-full min-h-0 w-full flex-col bg-muted/40"
      aria-label="Compiled preview"
    >
      <CompileStatus />
      <ScrollArea className="min-h-0 flex-1">
        {isBibliography ? (
          <div className="mx-auto flex min-h-full max-w-sm flex-col items-start justify-center px-6 py-16">
            <BookOpenTextIcon className="mb-4 size-6 text-muted-foreground" weight="duotone" />
            <h2 className="text-base font-semibold tracking-[-0.015em]">Bibliography source</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">No standalone preview.</p>
          </div>
        ) : hasPages ? (
          <div className="flex min-h-full flex-col items-center gap-2 p-2">
            {state.previewPages.map((svg, index) => (
              <InlineSvgPage
                key={index}
                svg={svg}
                index={index}
                count={state.previewPages.length}
              />
            ))}
          </div>
        ) : state.compilePhase === "compiling" || state.compilePhase === "queued" ? (
          <div className="p-2">
            <div className="aspect-[794/1123] w-full space-y-6 bg-background p-[11%] shadow-sm ring-1 ring-foreground/10">
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-11/12" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          </div>
        ) : state.diagnostics.some((item) => item.severity === "error") ? (
          <div className="mx-auto flex min-h-full max-w-sm flex-col items-start justify-center px-6 py-16">
            <WarningCircleIcon className="mb-4 size-6 text-destructive" weight="duotone" />
            <h2 className="text-base font-semibold tracking-[-0.015em]">Preview paused</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Resolve the source error to continue compiling. Open Problems to jump to the exact
              line.
            </p>
          </div>
        ) : (
          <div className="mx-auto flex min-h-full max-w-sm flex-col items-start justify-center px-6 py-16">
            <FileTextIcon className="mb-4 size-6 text-muted-foreground" weight="duotone" />
            <h2 className="text-base font-semibold tracking-[-0.015em]">Nothing to preview yet</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Open a Typst or Markdown document from the sidebar. Compilation begins automatically
              as you write.
            </p>
          </div>
        )}
      </ScrollArea>
    </section>
  );
}

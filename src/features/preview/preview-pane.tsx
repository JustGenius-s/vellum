import { useLayoutEffect, useRef } from "react";
import { FileTextIcon, WarningCircleIcon } from "@phosphor-icons/react";

import { useWorkspace } from "@/app/workspace-context";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

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

export function PreviewPane() {
  const { state } = useWorkspace();
  const hasPages = state.previewPages.length > 0;

  return (
    <section
      className="flex h-full min-h-0 w-full flex-col bg-muted/40"
      aria-label="Compiled preview"
    >
      <ScrollArea className="min-h-0 flex-1">
        {hasPages ? (
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
        ) : state.compilePhase === "compiling" ? (
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

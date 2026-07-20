import { useEffect, useState } from "react";
import { BracketsCurlyIcon, FileTextIcon, WarningCircleIcon } from "@phosphor-icons/react";

import { useWorkspace } from "@/app/workspace-context";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export function PreviewPane() {
  const { state } = useWorkspace();
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (!state.previewSvg) {
      setUrl("");
      return;
    }
    const nextUrl = URL.createObjectURL(new Blob([state.previewSvg], { type: "image/svg+xml" }));
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [state.previewSvg]);

  return (
    <section
      className="flex h-full min-h-0 w-full flex-col bg-[var(--preview-field)]"
      aria-label="Compiled preview"
    >
      <header className="flex min-h-10 items-center gap-2 border-b border-border/65 bg-background/70 px-3 backdrop-blur-md">
        <BracketsCurlyIcon className="size-3.5 text-[var(--signal)]" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Compiled page
        </span>
        <Badge
          variant="outline"
          className="ml-auto h-5 border-border/70 bg-background/45 px-1.5 font-mono text-[8px] uppercase tracking-[0.08em] text-muted-foreground"
        >
          SVG
        </Badge>
      </header>

      <div className="preview-grid relative min-h-0 flex-1 overflow-auto px-3 py-5 sm:px-6 sm:py-8">
        {url ? (
          <div className="relative mx-auto w-full max-w-[52rem] animate-in fade-in zoom-in-95 duration-300">
            <img
              src={url}
              alt="Typst document preview"
              className="block aspect-[794/1123] w-full rounded-[3px] bg-[#fbfaf5] shadow-[0_28px_70px_-26px_rgba(4,8,5,0.76)] ring-1 ring-white/8"
            />
            {state.compilePhase === "compiling" ? (
              <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[3px] bg-background/6">
                <div className="compile-scan absolute inset-x-0 top-0 h-px bg-[var(--signal)]/55" />
              </div>
            ) : null}
          </div>
        ) : state.compilePhase === "compiling" ? (
          <div className="mx-auto aspect-[794/1123] w-full max-w-[52rem] space-y-6 rounded-[3px] bg-[#f7f5ee] p-[11%] shadow-[0_28px_70px_-26px_rgba(4,8,5,0.65)]">
            <Skeleton className="h-8 w-2/3 bg-[#dedbd1]" />
            <Skeleton className="h-3 w-full bg-[#e5e1d7]" />
            <Skeleton className="h-3 w-11/12 bg-[#e5e1d7]" />
            <Skeleton className="h-3 w-4/5 bg-[#e5e1d7]" />
          </div>
        ) : state.diagnostics.some((item) => item.severity === "error") ? (
          <div className="mx-auto flex min-h-full max-w-sm flex-col items-start justify-center py-16">
            <WarningCircleIcon className="mb-4 size-7 text-destructive" weight="fill" />
            <h2 className="text-base font-semibold">Preview paused by an error</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Open the Problems panel for the exact source location. The last successful page
              remains visible when available.
            </p>
          </div>
        ) : (
          <div className="mx-auto flex min-h-full max-w-sm flex-col items-start justify-center py-16">
            <div className="mb-4 flex size-10 items-center justify-center rounded-lg border border-border bg-background/40">
              <FileTextIcon className="size-5 text-muted-foreground" />
            </div>
            <h2 className="text-base font-semibold">Nothing to render yet</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Open a Typst document from the sidebar. Compilation begins automatically as you write.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

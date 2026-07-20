import { useEffect, useState } from "react";
import { FileTextIcon, WarningCircleIcon } from "@phosphor-icons/react";

import { useWorkspace } from "@/app/workspace-context";
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
      className="flex h-full min-h-0 w-full flex-col bg-muted/40"
      aria-label="Compiled preview"
    >
      <div className="relative min-h-0 flex-1 overflow-auto">
        {url ? (
          <img
            src={url}
            alt="Typst document preview"
            className="block aspect-[794/1123] w-full animate-in bg-background fade-in duration-200"
          />
        ) : state.compilePhase === "compiling" ? (
          <div className="aspect-[794/1123] w-full space-y-6 bg-background p-[11%]">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-11/12" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        ) : state.diagnostics.some((item) => item.severity === "error") ? (
          <div className="mx-auto flex min-h-full max-w-sm flex-col items-start justify-center py-16">
            <WarningCircleIcon className="mb-4 size-6 text-destructive" weight="duotone" />
            <h2 className="text-base font-semibold tracking-[-0.015em]">Preview paused</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Resolve the source error to continue compiling. Open Problems to jump to the exact
              line.
            </p>
          </div>
        ) : (
          <div className="mx-auto flex min-h-full max-w-sm flex-col items-start justify-center py-16">
            <FileTextIcon className="mb-4 size-6 text-muted-foreground" weight="duotone" />
            <h2 className="text-base font-semibold tracking-[-0.015em]">Nothing to preview yet</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Open a Typst document from the sidebar. Compilation begins automatically as you write.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

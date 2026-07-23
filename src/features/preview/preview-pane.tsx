import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  ArrowsOutSimpleIcon,
  BookOpenTextIcon,
  CopyIcon,
  DownloadSimpleIcon,
  FileTextIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";

import {
  shallowEqual,
  useWorkspaceController,
  useWorkspaceSelector,
} from "@/app/workspace-context";
import { useCompileProgress } from "@/features/preview/use-compile-progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { documentFormat, type PreviewPage } from "@/domain/workspace";
import { cn } from "@/lib/utils";
import {
  bindPreviewInteractions,
  type PreviewInteraction,
} from "@/features/preview/preview-interactions";
import { previewVirtualRange } from "@/features/preview/preview-virtualization";

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

  [data-vellum-interactive] {
    cursor: pointer;
    outline: none;
    transition: opacity 140ms ease-out;
  }

  @media (hover: hover) {
    [data-vellum-interactive]:hover {
      opacity: 0.78;
    }
  }

  [data-vellum-interactive]:active {
    opacity: 0.62;
  }

  [data-vellum-interactive]:focus-visible {
    outline: 1.5px solid currentColor;
    outline-offset: 2px;
  }

  a[data-vellum-interactive] > rect {
    transition: fill-opacity 140ms ease-out, stroke-opacity 140ms ease-out;
  }

  @media (hover: hover) {
    a[data-vellum-interactive]:hover > rect {
      fill: currentColor;
      fill-opacity: 0.05;
    }
  }

  a[data-vellum-interactive]:active > rect {
    fill: currentColor;
    fill-opacity: 0.1;
  }

  a[data-vellum-interactive]:focus-visible > rect {
    stroke: currentColor;
    stroke-opacity: 0.65;
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }

  [data-vellum-image-context] {
    cursor: context-menu;
    outline: none;
  }

  [data-vellum-image-context]:focus-visible {
    outline: 1.5px solid currentColor;
    outline-offset: 2px;
  }
`;

function InlineSvgPage({
  svg,
  index,
  count,
  onInteraction,
  onCopyImage,
  onDownloadImage,
  onPreviewImage,
}: {
  svg: string;
  index: number;
  count: number;
  onInteraction: (interaction: PreviewInteraction) => void;
  onCopyImage: (source: string) => void;
  onDownloadImage: (source: string) => void;
  onPreviewImage: (source: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const imageSourceRef = useRef<string | null>(null);
  const [contextImage, setContextImage] = useState<string | null>(null);
  const handleImageTargetChange = useCallback((source: string | null) => {
    imageSourceRef.current = source;
    setContextImage(source);
  }, []);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${pageStyles}</style>${svg}`;
    const releaseInteractions = bindPreviewInteractions(
      root,
      onInteraction,
      handleImageTargetChange,
    );

    return () => {
      releaseInteractions();
      root.replaceChildren();
    };
  }, [handleImageTargetChange, onInteraction, svg]);

  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (!open) handleImageTargetChange(null);
      }}
    >
      <ContextMenuTrigger asChild>
        <div
          ref={hostRef}
          role="document"
          aria-label={`Typst page ${index + 1} of ${count}`}
          className="w-full shrink-0 overflow-hidden bg-background shadow-sm ring-1 ring-foreground/10"
          onContextMenu={(event) => {
            if (!imageSourceRef.current) event.preventDefault();
          }}
        />
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-44">
        <ContextMenuItem
          disabled={!contextImage}
          onSelect={() => {
            if (contextImage) onCopyImage(contextImage);
          }}
        >
          <CopyIcon />
          Copy image
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!contextImage}
          onSelect={() => {
            if (contextImage) onDownloadImage(contextImage);
          }}
        >
          <DownloadSimpleIcon />
          Download image
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={!contextImage}
          onSelect={() => {
            if (contextImage) onPreviewImage(contextImage);
          }}
        >
          <ArrowsOutSimpleIcon />
          Preview image
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function CompileStatus() {
  const controller = useWorkspaceController();
  const activePath = useWorkspaceSelector((state) => state.activePath);
  const { phase, progress } = useCompileProgress(controller.compileProgress);

  if (
    !activePath ||
    documentFormat(activePath) === "bibliography" ||
    phase === "ready"
  ) {
    return null;
  }

  const failed = phase === "failed";
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

function VirtualPreviewPages({
  pages,
  viewportRef,
  onInteraction,
  onCopyImage,
  onDownloadImage,
  onPreviewImage,
}: {
  pages: PreviewPage[];
  viewportRef: RefObject<HTMLDivElement | null>;
  onInteraction: (interaction: PreviewInteraction) => void;
  onCopyImage: (source: string) => void;
  onDownloadImage: (source: string) => void;
  onPreviewImage: (source: string) => void;
}) {
  const slotsRef = useRef(new Map<number, HTMLDivElement>());
  const [visible, setVisible] = useState<Set<number>>(() => new Set([0]));

  useEffect(() => {
    const root = viewportRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        setVisible((current) => {
          const next = new Set(current);
          for (const entry of entries) {
            const index = Number((entry.target as HTMLElement).dataset.pageIndex);
            if (entry.isIntersecting) next.add(index);
            else next.delete(index);
          }
          if (next.size === current.size && [...next].every((index) => current.has(index))) {
            return current;
          }
          return next;
        });
      },
      { root },
    );
    slotsRef.current.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [pages, viewportRef]);

  const mountedRange = useMemo(() => {
    return previewVirtualRange(visible, pages.length);
  }, [pages.length, visible]);
  const pageKeys = useMemo(() => {
    const counts = new Map<string, number>();
    return pages.map((page) => {
      const occurrence = counts.get(page.id) ?? 0;
      counts.set(page.id, occurrence + 1);
      return `${page.id}:${occurrence}`;
    });
  }, [pages]);

  return (
    <div className="flex min-h-full flex-col items-center gap-2 p-2">
      {pages.map((page, index) => {
        const mounted = index >= mountedRange.from && index <= mountedRange.to;
        return (
          <div
            key={pageKeys[index]}
            ref={(node) => {
              if (node) slotsRef.current.set(index, node);
              else slotsRef.current.delete(index);
            }}
            data-page-index={index}
            className="w-full shrink-0"
            style={{ aspectRatio: `${page.width} / ${page.height}` }}
          >
            {mounted ? (
              <InlineSvgPage
                svg={page.svg}
                index={index}
                count={pages.length}
                onInteraction={onInteraction}
                onCopyImage={onCopyImage}
                onDownloadImage={onDownloadImage}
                onPreviewImage={onPreviewImage}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function PreviewPane() {
  const controller = useWorkspaceController();
  const state = useWorkspaceSelector(
    (workspace) => ({
      activePath: workspace.activePath,
      previewPages: workspace.previewPages,
      diagnostics: workspace.diagnostics,
      compilePhase: workspace.compilePhase,
    }),
    shallowEqual,
  );
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const hasPages = state.previewPages.length > 0;
  const isBibliography =
    Boolean(state.activePath) && documentFormat(state.activePath) === "bibliography";
  const handleInteraction = useCallback(
    (interaction: PreviewInteraction) => {
      switch (interaction.kind) {
        case "workspace-link":
          void controller.openPreviewDocument(interaction.target);
          break;
        case "external-link":
          void controller.openExternalLink(interaction.href);
          break;
        case "blocked-link":
          controller.rejectPreviewLink(interaction.href);
          break;
      }
    },
    [controller],
  );
  const handleCopyImage = useCallback(
    (source: string) => void controller.copyPreviewImage(source),
    [controller],
  );
  const handleDownloadImage = useCallback(
    (source: string) => void controller.downloadPreviewImage(source),
    [controller],
  );

  return (
    <>
      <section
        className="flex h-full min-h-0 w-full flex-col bg-muted/40"
        aria-label="Compiled preview"
      >
        <CompileStatus />
        <ScrollArea className="min-h-0 flex-1" viewportRef={viewportRef}>
          {isBibliography ? (
            <div className="mx-auto flex min-h-full max-w-sm flex-col items-start justify-center px-6 py-16">
              <BookOpenTextIcon className="mb-4 size-6 text-muted-foreground" weight="duotone" />
              <h2 className="text-base font-semibold tracking-[-0.015em]">Bibliography source</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">No standalone preview.</p>
            </div>
          ) : hasPages ? (
            <VirtualPreviewPages
              pages={state.previewPages}
              viewportRef={viewportRef}
              onInteraction={handleInteraction}
              onCopyImage={handleCopyImage}
              onDownloadImage={handleDownloadImage}
              onPreviewImage={setPreviewImage}
            />
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
      <Dialog open={Boolean(previewImage)} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] overflow-hidden p-2 sm:max-w-5xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Image preview</DialogTitle>
            <DialogDescription>Expanded document image</DialogDescription>
          </DialogHeader>
          {previewImage ? (
            <img
              src={previewImage}
              alt="Expanded document preview"
              className="max-h-[calc(100dvh-3rem)] w-full object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

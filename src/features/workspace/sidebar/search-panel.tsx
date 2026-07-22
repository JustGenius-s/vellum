import { useEffect, useState } from "react";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useWorkspace } from "@/app/workspace-context";
import { FileTypeIcon } from "@/components/ui/file-type-icon";
import { Input } from "@/components/ui/input";
import { useSidebar } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptySidebar } from "@/features/workspace/sidebar/empty-sidebar";

export function SearchPanel() {
  const { controller, state } = useWorkspace();
  const { setOpenMobile } = useSidebar();
  const [query, setQuery] = useState(state.searchQuery);

  useEffect(() => {
    const timer = window.setTimeout(() => void controller.search(query), 260);
    return () => window.clearTimeout(timer);
  }, [controller, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
      <div className="px-2 pb-3 pt-1">
        <div className="relative">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-sidebar-foreground/38" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search workspace"
            className="h-9 rounded-md border-sidebar-border bg-background pl-8 text-xs shadow-none"
          />
        </div>
      </div>

      {state.searchPending ? (
        <div className="space-y-3 px-3 py-2">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </div>
      ) : state.searchResults.length ? (
        <div className="space-y-1 px-1 pb-5">
          {state.searchResults.map((result) => (
            <button
              key={`${result.path}:${result.line}:${result.column}`}
              type="button"
              className="w-full rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-sidebar-accent/65 active:translate-y-px"
              onClick={() => {
                void controller.openSearchMatch(result);
                setOpenMobile(false);
              }}
            >
              <span className="flex items-center gap-2 text-[11px] font-medium text-sidebar-foreground/78">
                <FileTypeIcon
                  name={result.relativePath}
                  className="size-3 text-sidebar-primary"
                />
                <span className="truncate">{result.relativePath}</span>
              </span>
              <span className="mt-1 line-clamp-2 block text-[10px] leading-4 text-sidebar-foreground/48">
                {result.preview}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <EmptySidebar
          icon={MagnifyingGlassIcon}
          title={query ? "No matches" : "Search the vault"}
          description={
            query
              ? "Try a broader phrase or a document title."
              : "Results include exact lines and jump directly into the editor."
          }
        />
      )}
    </div>
  );
}


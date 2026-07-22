import {
  BookOpenTextIcon,
  FileTextIcon,
  LinkSimpleIcon,
  ListBulletsIcon,
} from "@phosphor-icons/react";
import { useWorkspace } from "@/app/workspace-context";
import { useSidebar } from "@/components/ui/sidebar";
import { isDataFile } from "@/domain/data";
import { documentFormat } from "@/domain/workspace";
import { EmptySidebar } from "@/features/workspace/sidebar/empty-sidebar";

export function OutlinePanel() {
  const { controller, state } = useWorkspace();
  const { setOpenMobile } = useSidebar();
  const outline = controller.outline;
  const backlinks = controller.activeBacklinks;

  if (!state.activePath) {
    return (
      <EmptySidebar
        icon={ListBulletsIcon}
        title="No document selected"
        description="Open a Typst file to inspect its headings and linked mentions."
      />
    );
  }

  if (isDataFile(state.activePath)) {
    return (
      <EmptySidebar
        icon={ListBulletsIcon}
        title="Data file"
        description="Use the data inspector to browse datasets, statistics, and dimension slices."
      />
    );
  }

  if (documentFormat(state.activePath) === "bibliography") {
    return (
      <EmptySidebar
        icon={BookOpenTextIcon}
        title="Bibliography file"
        description="No document outline."
      />
    );
  }

  return (
    <div className="space-y-4 px-2 pb-6 group-data-[collapsible=icon]:hidden">
      <section>
        <p className="px-2 pb-1.5 text-xs font-medium text-sidebar-foreground/60">
          Document outline
        </p>
        {outline.length ? (
          <div className="space-y-0.5">
            {outline.map((heading) => (
              <button
                key={`${heading.line}:${heading.title}`}
                type="button"
                className="flex min-h-9 w-full items-center gap-2 rounded-lg pr-2 text-left text-xs text-sidebar-foreground/68 hover:bg-sidebar-accent/65 hover:text-sidebar-foreground"
                style={{ paddingLeft: `${0.5 + (heading.level - 1) * 0.7}rem` }}
                onClick={() => {
                  controller.revealLine(heading.line);
                  setOpenMobile(false);
                }}
              >
                <span className="truncate">{heading.title}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="px-2 py-3 text-xs leading-5 text-sidebar-foreground/42">
            Add a heading such as{" "}
            <span className="font-mono text-sidebar-foreground/66">= Introduction</span>.
          </p>
        )}
      </section>

      <section>
        <p className="flex items-center gap-2 px-2 pb-1.5 text-xs font-medium text-sidebar-foreground/60">
          <LinkSimpleIcon className="size-3" /> Linked mentions
        </p>
        {backlinks.length ? (
          backlinks.map((stem) => (
            <button
              key={stem}
              type="button"
              className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-xs text-sidebar-foreground/68 hover:bg-sidebar-accent/65"
              onClick={() => {
                void controller.openByStem(stem);
                setOpenMobile(false);
              }}
            >
              <FileTextIcon className="size-3.5 text-sidebar-primary" />
              <span className="truncate">{stem}</span>
            </button>
          ))
        ) : (
          <p className="px-2 py-3 text-xs leading-5 text-sidebar-foreground/42">
            No other document links here yet.
          </p>
        )}
      </section>
    </div>
  );
}


import type { ComponentType, ReactNode } from "react";

export function EmptySidebar({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-56 flex-col items-start justify-center px-4 py-8 group-data-[collapsible=icon]:hidden">
      <div className="mb-4 flex size-9 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-foreground">
        <Icon className="size-4.5" />
      </div>
      <p className="text-sm font-semibold tracking-[-0.01em] text-sidebar-foreground">{title}</p>
      <p className="mt-1.5 max-w-52 text-xs leading-5 text-sidebar-foreground/55">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}


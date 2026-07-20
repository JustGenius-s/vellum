import { lazy, Suspense } from "react";

import { CommandProvider } from "@/app/command-context";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkspaceShell } from "@/features/workspace/workspace-shell";

const CommandPalette = lazy(() =>
  import("@/features/commands/command-palette").then((module) => ({
    default: module.CommandPalette,
  })),
);

export default function App() {
  return (
    <TooltipProvider delayDuration={320}>
      <SidebarProvider defaultOpen>
        <CommandProvider>
          <WorkspaceShell />
          <Suspense fallback={null}>
            <CommandPalette />
          </Suspense>
        </CommandProvider>
      </SidebarProvider>
    </TooltipProvider>
  );
}

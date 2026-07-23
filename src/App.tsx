import { lazy, Suspense } from "react";

import { CommandProvider, useCommands } from "@/app/command-context";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkspaceShell } from "@/features/workspace/workspace-shell";

const CommandPalette = lazy(() =>
  import("@/features/commands/command-palette").then((module) => ({
    default: module.CommandPalette,
  })),
);

function DeferredCommandPalette() {
  const { paletteOpen } = useCommands();
  if (!paletteOpen) return null;
  return (
    <Suspense fallback={null}>
      <CommandPalette />
    </Suspense>
  );
}

export default function App() {
  return (
    <TooltipProvider delayDuration={320}>
      <SidebarProvider defaultOpen>
        <CommandProvider>
          <WorkspaceShell />
          <DeferredCommandPalette />
        </CommandProvider>
      </SidebarProvider>
    </TooltipProvider>
  );
}

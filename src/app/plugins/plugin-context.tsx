import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";

import type { WorkspacePluginRegistry } from "@/app/plugins/plugin-registry";

const WorkspacePluginContext = createContext<WorkspacePluginRegistry | null>(null);

export function WorkspacePluginProvider({
  registry,
  children,
}: {
  registry: WorkspacePluginRegistry;
  children: ReactNode;
}) {
  return (
    <WorkspacePluginContext.Provider value={registry}>
      {children}
    </WorkspacePluginContext.Provider>
  );
}

export function useWorkspacePluginRegistry() {
  const registry = useContext(WorkspacePluginContext);
  if (!registry) throw new Error("WorkspacePluginProvider is missing");
  return registry;
}

export function useWorkspacePlugins() {
  const registry = useWorkspacePluginRegistry();
  return useSyncExternalStore(registry.subscribe, registry.getSnapshot, registry.getSnapshot);
}

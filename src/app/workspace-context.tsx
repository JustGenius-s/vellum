import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";

import { WorkspaceController } from "@/application/workspace-controller";

const WorkspaceContext = createContext<WorkspaceController | null>(null);

export function WorkspaceProvider({
  controller,
  children,
}: {
  controller: WorkspaceController;
  children: ReactNode;
}) {
  useEffect(() => {
    void controller.initialize();
  }, [controller]);

  return <WorkspaceContext.Provider value={controller}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceController() {
  const controller = useContext(WorkspaceContext);
  if (!controller) throw new Error("WorkspaceProvider is missing");
  return controller;
}

export function useWorkspace() {
  const controller = useWorkspaceController();
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return { controller, state };
}

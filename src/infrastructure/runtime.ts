import type { WorkspaceGateway } from "@/application/ports/workspace-gateway";
import { DemoWorkspaceGateway } from "@/infrastructure/demo/demo-workspace-gateway";
import { TauriWorkspaceGateway } from "@/infrastructure/tauri/tauri-workspace-gateway";

export function createWorkspaceGateway(): WorkspaceGateway {
  const isTauri = "__TAURI_INTERNALS__" in window;
  return isTauri ? new TauriWorkspaceGateway() : new DemoWorkspaceGateway();
}

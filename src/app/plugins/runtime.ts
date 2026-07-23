import { builtinWorkspacePlugins } from "@/app/plugins/builtin-plugins";
import { createWorkspaceCapabilityHost } from "@/app/plugins/host-capabilities";
import type { WorkspacePluginManifest } from "@/app/plugins/plugin-api";
import { createWorkspacePluginRegistry } from "@/app/plugins/plugin-registry";
import type { WorkspaceController } from "@/application/workspace-controller";

export function createWorkspacePluginRuntime(controller: WorkspaceController) {
  const registry = createWorkspacePluginRegistry(createWorkspaceCapabilityHost(controller));
  builtinWorkspacePlugins.forEach((plugin) => registry.register(plugin));
  registry.start();

  return {
    registry,
    register(plugin: WorkspacePluginManifest) {
      return registry.register(plugin);
    },
    dispose() {
      registry.stop();
    },
  };
}

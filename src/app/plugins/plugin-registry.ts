import type { Command } from "@/application/commands/registry";
import type {
  WorkspacePluginActivationContext,
  WorkspaceCapability,
  WorkspacePluginCommandContext,
  WorkspacePluginManifest,
  WorkspaceViewContribution,
} from "@/app/plugins/plugin-api";
import { WORKSPACE_PLUGIN_API_VERSION } from "@/app/plugins/plugin-api";

export interface WorkspacePluginSnapshot {
  revision: number;
  plugins: readonly WorkspacePluginManifest[];
  views: readonly WorkspaceViewContribution[];
}

export interface WorkspacePluginRegistry {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => WorkspacePluginSnapshot;
  register(plugin: WorkspacePluginManifest): () => void;
  start(context: Omit<WorkspacePluginActivationContext, "capabilities">): void;
  stop(): void;
  commands(context: WorkspacePluginCommandContext): readonly Command[];
  view(id: string): WorkspaceViewContribution;
}

function validatePlugin(
  plugin: WorkspacePluginManifest,
  availableCapabilities: ReadonlySet<WorkspaceCapability>,
) {
  if (!plugin.id.trim()) throw new Error("Plugin id cannot be empty");
  if (plugin.apiVersion !== WORKSPACE_PLUGIN_API_VERSION) {
    throw new Error(
      `Plugin ${plugin.id} uses API ${plugin.apiVersion}; Vellum supports ${WORKSPACE_PLUGIN_API_VERSION}`,
    );
  }
  const missing = (plugin.requires ?? []).filter(
    (capability) => !availableCapabilities.has(capability),
  );
  if (missing.length) {
    throw new Error(`Plugin ${plugin.id} requires unavailable capabilities: ${missing.join(", ")}`);
  }

  const viewIds = new Set<string>();
  for (const view of plugin.contributes.views ?? []) {
    if (!view.id.trim()) throw new Error(`Plugin ${plugin.id} contributed an empty view id`);
    if (viewIds.has(view.id)) {
      throw new Error(`Plugin ${plugin.id} contributed duplicate view ${view.id}`);
    }
    viewIds.add(view.id);
  }
}

export function createWorkspacePluginRegistry(
  capabilities: readonly WorkspaceCapability[],
): WorkspacePluginRegistry {
  const availableCapabilities = new Set(capabilities);
  const listeners = new Set<() => void>();
  const plugins = new Map<string, WorkspacePluginManifest>();
  const pluginDisposals = new Map<string, () => void>();
  let activationContext: WorkspacePluginActivationContext | null = null;
  let snapshot: WorkspacePluginSnapshot = { revision: 0, plugins: [], views: [] };

  function disposeActivatedPlugins() {
    let firstError: unknown;
    for (const dispose of [...pluginDisposals.values()].reverse()) {
      try {
        dispose();
      } catch (error) {
        firstError ??= error;
      }
    }
    pluginDisposals.clear();
    return firstError;
  }

  function publish() {
    const registered = [...plugins.values()];
    snapshot = {
      revision: snapshot.revision + 1,
      plugins: registered,
      views: registered.flatMap((plugin) => plugin.contributes.views ?? []),
    };
    listeners.forEach((listener) => listener());
  }

  function register(plugin: WorkspacePluginManifest) {
    validatePlugin(plugin, availableCapabilities);
    if (plugins.has(plugin.id)) throw new Error(`Plugin ${plugin.id} is already registered`);

    const existingViews = new Map(snapshot.views.map((view) => [view.id, view]));
    for (const view of plugin.contributes.views ?? []) {
      if (existingViews.has(view.id)) {
        throw new Error(`View ${view.id} is already contributed by another plugin`);
      }
    }

    plugins.set(plugin.id, plugin);
    try {
      if (activationContext) {
        const dispose = plugin.activate?.(activationContext);
        if (dispose) pluginDisposals.set(plugin.id, dispose);
      }
    } catch (error) {
      plugins.delete(plugin.id);
      throw error;
    }
    publish();
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      let disposalError: unknown;
      try {
        pluginDisposals.get(plugin.id)?.();
      } catch (error) {
        disposalError = error;
      }
      pluginDisposals.delete(plugin.id);
      plugins.delete(plugin.id);
      publish();
      if (disposalError) throw disposalError;
    };
  }

  function commands(context: WorkspacePluginCommandContext) {
    const commandIds = new Set<string>();
    return snapshot.plugins.flatMap((plugin) =>
      [...(plugin.contributes.commands?.(context) ?? [])].map((command) => {
        if (!command.id.trim()) {
          throw new Error(`Plugin ${plugin.id} contributed an empty command id`);
        }
        if (commandIds.has(command.id)) {
          throw new Error(`Command ${command.id} is contributed more than once`);
        }
        commandIds.add(command.id);
        return command;
      }),
    );
  }

  function view(id: string) {
    const views = snapshot.views;
    const match = views.find((candidate) => candidate.id === id) ?? views[0];
    if (!match) throw new Error("No workspace views are registered");
    return match;
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    register,
    start(context) {
      if (activationContext) throw new Error("Workspace plugin registry is already started");
      activationContext = { ...context, capabilities: availableCapabilities };
      try {
        for (const plugin of plugins.values()) {
          const dispose = plugin.activate?.(activationContext);
          if (dispose) pluginDisposals.set(plugin.id, dispose);
        }
      } catch (error) {
        disposeActivatedPlugins();
        activationContext = null;
        throw error;
      }
    },
    stop() {
      const disposalError = disposeActivatedPlugins();
      activationContext = null;
      if (disposalError) throw disposalError;
    },
    commands,
    view,
  };
}

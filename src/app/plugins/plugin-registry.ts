import type { Command } from "@/application/commands/registry";
import {
  WORKSPACE_PLUGIN_API_VERSION,
  type CapabilityToken,
  type PluginServiceToken,
  type WorkspaceCapabilityHost,
  type WorkspacePluginCommandContext,
  type WorkspacePluginManifest,
  type WorkspacePluginScope,
  type WorkspaceViewContribution,
} from "@/app/plugins/plugin-api";

export interface RegisteredWorkspaceView extends WorkspaceViewContribution {
  pluginId: string;
}

export interface WorkspacePluginSnapshot {
  revision: number;
  plugins: readonly WorkspacePluginManifest[];
  views: readonly RegisteredWorkspaceView[];
}

export interface WorkspacePluginRegistry {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => WorkspacePluginSnapshot;
  register(plugin: WorkspacePluginManifest): () => void;
  start(): void;
  stop(): void;
  commands(context: Pick<WorkspacePluginCommandContext, "openPalette">): readonly Command[];
  view(id: string): RegisteredWorkspaceView;
  scope(pluginId: string): WorkspacePluginScope;
}

function validatePlugin(plugin: WorkspacePluginManifest, host: WorkspaceCapabilityHost) {
  if (!plugin.id.trim()) throw new Error("Plugin id cannot be empty");
  if (plugin.apiVersion !== WORKSPACE_PLUGIN_API_VERSION) {
    throw new Error(
      `Plugin ${plugin.id} uses API ${plugin.apiVersion}; Vellum supports ${WORKSPACE_PLUGIN_API_VERSION}`,
    );
  }
  const missing = (plugin.requires ?? []).filter((capability) => !host.has(capability));
  if (missing.length) {
    throw new Error(
      `Plugin ${plugin.id} requires unavailable capabilities: ${missing.map((item) => item.id).join(", ")}`,
    );
  }

  const capabilityIds = new Set<string>();
  for (const capability of plugin.requires ?? []) {
    if (capabilityIds.has(capability.id)) {
      throw new Error(`Plugin ${plugin.id} requires duplicate capability ${capability.id}`);
    }
    capabilityIds.add(capability.id);
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
  host: WorkspaceCapabilityHost,
): WorkspacePluginRegistry {
  const listeners = new Set<() => void>();
  const plugins = new Map<string, WorkspacePluginManifest>();
  const pluginDisposals = new Map<string, () => void>();
  const pluginServices = new Map<string, Map<string, unknown>>();
  const scopes = new Map<string, WorkspacePluginScope>();
  let started = false;
  let snapshot: WorkspacePluginSnapshot = { revision: 0, plugins: [], views: [] };

  function publish() {
    const registered = [...plugins.values()];
    snapshot = {
      revision: snapshot.revision + 1,
      plugins: registered,
      views: registered.flatMap((plugin) =>
        (plugin.contributes.views ?? []).map((view) => ({ ...view, pluginId: plugin.id })),
      ),
    };
    listeners.forEach((listener) => listener());
  }

  function pluginScope(plugin: WorkspacePluginManifest): WorkspacePluginScope {
    const cached = scopes.get(plugin.id);
    if (cached) return cached;
    const declared = new Set((plugin.requires ?? []).map((token) => token.id));
    const scope: WorkspacePluginScope = {
      pluginId: plugin.id,
      get<T>(token: CapabilityToken<T>) {
        if (!declared.has(token.id)) {
          throw new Error(`Plugin ${plugin.id} did not declare capability ${token.id}`);
        }
        return host.get(token);
      },
      getService<T>(token: PluginServiceToken<T>) {
        const services = pluginServices.get(plugin.id);
        if (!services?.has(token.id)) {
          throw new Error(`Plugin ${plugin.id} does not provide service ${token.id}`);
        }
        return services.get(token.id) as T;
      },
    };
    scopes.set(plugin.id, scope);
    return scope;
  }

  function provideService<T>(pluginId: string, token: PluginServiceToken<T>, service: T) {
    let services = pluginServices.get(pluginId);
    if (!services) {
      services = new Map();
      pluginServices.set(pluginId, services);
    }
    if (services.has(token.id)) {
      throw new Error(`Plugin ${pluginId} already provides service ${token.id}`);
    }
    services.set(token.id, service);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      if (services?.get(token.id) === service) services.delete(token.id);
      if (services?.size === 0) pluginServices.delete(pluginId);
    };
  }

  function activate(plugin: WorkspacePluginManifest) {
    const scope = pluginScope(plugin);
    try {
      const dispose = plugin.activate?.({
        ...scope,
        provide: (token, service) => provideService(plugin.id, token, service),
      });
      if (dispose) pluginDisposals.set(plugin.id, dispose);
    } catch (error) {
      pluginServices.delete(plugin.id);
      throw error;
    }
  }

  function deactivate(pluginId: string) {
    let disposalError: unknown;
    try {
      pluginDisposals.get(pluginId)?.();
    } catch (error) {
      disposalError = error;
    }
    pluginDisposals.delete(pluginId);
    pluginServices.delete(pluginId);
    return disposalError;
  }

  function register(plugin: WorkspacePluginManifest) {
    validatePlugin(plugin, host);
    if (plugins.has(plugin.id)) throw new Error(`Plugin ${plugin.id} is already registered`);

    const existingViews = new Set(snapshot.views.map((view) => view.id));
    for (const view of plugin.contributes.views ?? []) {
      if (existingViews.has(view.id)) {
        throw new Error(`View ${view.id} is already contributed by another plugin`);
      }
    }

    plugins.set(plugin.id, plugin);
    try {
      if (started) activate(plugin);
    } catch (error) {
      plugins.delete(plugin.id);
      scopes.delete(plugin.id);
      throw error;
    }
    publish();
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const disposalError = deactivate(plugin.id);
      plugins.delete(plugin.id);
      scopes.delete(plugin.id);
      publish();
      if (disposalError) throw disposalError;
    };
  }

  function commands(context: Pick<WorkspacePluginCommandContext, "openPalette">) {
    const commandIds = new Set<string>();
    return snapshot.plugins.flatMap((plugin) => {
      const scope = pluginScope(plugin);
      return [...(plugin.contributes.commands?.({ ...scope, ...context }) ?? [])].map((command) => {
        if (!command.id.trim()) {
          throw new Error(`Plugin ${plugin.id} contributed an empty command id`);
        }
        if (commandIds.has(command.id)) {
          throw new Error(`Command ${command.id} is contributed more than once`);
        }
        commandIds.add(command.id);
        return command;
      });
    });
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
    start() {
      if (started) throw new Error("Workspace plugin registry is already started");
      started = true;
      const activated: string[] = [];
      try {
        for (const plugin of plugins.values()) {
          activate(plugin);
          activated.push(plugin.id);
        }
      } catch (error) {
        for (const pluginId of activated.reverse()) deactivate(pluginId);
        started = false;
        throw error;
      }
    },
    stop() {
      let firstError: unknown;
      for (const pluginId of [...plugins.keys()].reverse()) {
        const error = deactivate(pluginId);
        firstError ??= error;
      }
      started = false;
      if (firstError) throw firstError;
    },
    commands,
    view,
    scope(pluginId) {
      const plugin = plugins.get(pluginId);
      if (!plugin) throw new Error(`Plugin ${pluginId} is not registered`);
      return pluginScope(plugin);
    },
  };
}

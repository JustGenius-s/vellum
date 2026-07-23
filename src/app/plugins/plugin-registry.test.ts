import { describe, expect, it, vi } from "vite-plus/test";

import {
  WORKSPACE_PLUGIN_API_VERSION,
  type WorkspacePluginManifest,
} from "@/app/plugins/plugin-api";
import { createWorkspacePluginRegistry } from "@/app/plugins/plugin-registry";
import type { WorkspaceController } from "@/application/workspace-controller";

const controller = {} as WorkspaceController;

function plugin(
  id: string,
  overrides: Partial<WorkspacePluginManifest> = {},
): WorkspacePluginManifest {
  return {
    id,
    name: id,
    version: "1.0.0",
    apiVersion: WORKSPACE_PLUGIN_API_VERSION,
    contributes: {},
    ...overrides,
  };
}

describe("workspace plugin registry", () => {
  it("registers, activates, disposes, and publishes plugins", () => {
    const registry = createWorkspacePluginRegistry(["files"]);
    const listener = vi.fn();
    const activate = vi.fn(() => vi.fn());
    const disposeSubscription = registry.subscribe(listener);
    const unregister = registry.register(plugin("notes", { activate }));

    expect(registry.getSnapshot().plugins.map((item) => item.id)).toEqual(["notes"]);
    expect(listener).toHaveBeenCalledOnce();

    registry.start({ controller });
    expect(activate).toHaveBeenCalledWith({
      controller,
      capabilities: new Set(["files"]),
    });

    const deactivate = activate.mock.results[0].value;
    unregister();
    expect(deactivate).toHaveBeenCalledOnce();
    expect(registry.getSnapshot().plugins).toEqual([]);
    disposeSubscription();
  });

  it("rejects incompatible plugins and contribution conflicts", () => {
    const registry = createWorkspacePluginRegistry(["files"]);
    expect(() => registry.register(plugin("needs-ai", { requires: ["ai"] }))).toThrow(
      "requires unavailable capabilities: ai",
    );
    expect(() =>
      registry.register({
        ...plugin("future"),
        apiVersion: 2,
      } as unknown as WorkspacePluginManifest),
    ).toThrow("uses API 2");

    const view = {
      id: "notes",
      label: "Notes",
      icon: (() => null) as never,
      location: "panel" as const,
      placement: "primary" as const,
      component: null as never,
    };
    registry.register(plugin("one", { contributes: { views: [view] } }));
    expect(() =>
      registry.register(plugin("two", { contributes: { views: [view] } })),
    ).toThrow("View notes is already contributed");
  });

  it("rejects duplicate command ids across plugins", () => {
    const registry = createWorkspacePluginRegistry([]);
    const command = {
      id: "notes.open",
      title: "Open notes",
      group: "Navigate" as const,
      handler: vi.fn(),
    };
    registry.register(plugin("one", { contributes: { commands: () => [command] } }));
    registry.register(plugin("two", { contributes: { commands: () => [command] } }));

    expect(() =>
      registry.commands({ controller, openPalette: vi.fn(), problemsOpen: false }),
    ).toThrow("Command notes.open is contributed more than once");
  });

  it("rolls back a failed registry start", () => {
    const deactivate = vi.fn();
    const registry = createWorkspacePluginRegistry([]);
    registry.register(plugin("one", { activate: () => deactivate }));
    const unregisterBroken = registry.register(
      plugin("broken", {
        activate: () => {
          throw new Error("activation failed");
        },
      }),
    );

    expect(() => registry.start({ controller })).toThrow("activation failed");
    expect(deactivate).toHaveBeenCalledOnce();

    unregisterBroken();
    expect(() => registry.start({ controller })).not.toThrow();
    registry.stop();
    expect(deactivate).toHaveBeenCalledTimes(2);
  });

  it("does not retain a plugin when live activation fails", () => {
    const registry = createWorkspacePluginRegistry([]);
    registry.start({ controller });

    expect(() =>
      registry.register(
        plugin("broken", {
          activate: () => {
            throw new Error("activation failed");
          },
        }),
      ),
    ).toThrow("activation failed");
    expect(registry.getSnapshot().plugins).toEqual([]);
  });
});

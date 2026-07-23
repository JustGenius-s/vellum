import { describe, expect, it, vi } from "vite-plus/test";

import { WorkspaceCapabilityRegistry } from "@/app/plugins/capability-registry";
import {
  defineCapability,
  definePluginService,
  WORKSPACE_PLUGIN_API_VERSION,
  type WorkspacePluginManifest,
} from "@/app/plugins/plugin-api";
import { createWorkspacePluginRegistry } from "@/app/plugins/plugin-registry";

const FILES = defineCapability<{ name: string }>("test.files");
const AI = defineCapability<{ name: string }>("test.ai");
const NOTES = definePluginService<{ count: number }>("notes.store");

function capabilityHost() {
  const host = new WorkspaceCapabilityRegistry();
  host.provide(FILES, { name: "files" });
  return host;
}

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
  it("registers, scopes, activates, disposes, and publishes plugins", () => {
    const host = capabilityHost();
    const registry = createWorkspacePluginRegistry(host);
    const listener = vi.fn();
    const deactivate = vi.fn();
    const activate = vi.fn((context) => {
      expect(context.pluginId).toBe("notes");
      expect(context.get(FILES)).toBe(host.get(FILES));
      return deactivate;
    });
    const disposeSubscription = registry.subscribe(listener);
    const unregister = registry.register(plugin("notes", { requires: [FILES], activate }));

    expect(registry.getSnapshot().plugins.map((item) => item.id)).toEqual(["notes"]);
    expect(listener).toHaveBeenCalledOnce();

    registry.start();
    expect(activate).toHaveBeenCalledOnce();
    expect(registry.scope("notes").get(FILES)).toBe(host.get(FILES));

    unregister();
    expect(deactivate).toHaveBeenCalledOnce();
    expect(registry.getSnapshot().plugins).toEqual([]);
    disposeSubscription();
  });

  it("rejects incompatible plugins and contribution conflicts", () => {
    const registry = createWorkspacePluginRegistry(capabilityHost());
    expect(() => registry.register(plugin("needs-ai", { requires: [AI] }))).toThrow(
      "requires unavailable capabilities: test.ai",
    );
    expect(() =>
      registry.register({
        ...plugin("future"),
        apiVersion: 3,
      } as unknown as WorkspacePluginManifest),
    ).toThrow("uses API 3");

    const view = {
      id: "notes",
      label: "Notes",
      icon: (() => null) as never,
      location: "panel" as const,
      placement: "primary" as const,
      component: null as never,
    };
    registry.register(plugin("one", { contributes: { views: [view] } }));
    expect(registry.view("notes").pluginId).toBe("one");
    expect(() =>
      registry.register(plugin("two", { contributes: { views: [view] } })),
    ).toThrow("View notes is already contributed");
  });

  it("rejects undeclared capability access", () => {
    const registry = createWorkspacePluginRegistry(capabilityHost());
    registry.start();

    expect(() =>
      registry.register(
        plugin("undeclared", {
          activate: ({ get }) => {
            get(FILES);
          },
        }),
      ),
    ).toThrow("did not declare capability test.files");
    expect(registry.getSnapshot().plugins).toEqual([]);
  });

  it("provides plugin-private services and removes them on stop", () => {
    const registry = createWorkspacePluginRegistry(capabilityHost());
    const view = {
      id: "notes",
      label: "Notes",
      icon: (() => null) as never,
      location: "panel" as const,
      placement: "primary" as const,
      component: null as never,
    };
    registry.register(
      plugin("notes", {
        activate: ({ provide }) => provide(NOTES, { count: 2 }),
        contributes: {
          views: [view],
          commands: ({ getService }) => [
            {
              id: "notes.count",
              title: `Notes (${getService(NOTES).count})`,
              group: "Navigate",
              handler: vi.fn(),
            },
          ],
        },
      }),
    );
    registry.register(plugin("other"));
    registry.start();

    expect(registry.scope("notes").getService(NOTES)).toEqual({ count: 2 });
    expect(registry.view("notes").pluginId).toBe("notes");
    expect(registry.commands({ openPalette: vi.fn() })[0].title).toBe("Notes (2)");
    expect(() => registry.scope("other").getService(NOTES)).toThrow(
      "does not provide service notes.store",
    );
    registry.stop();
    expect(() => registry.scope("notes").getService(NOTES)).toThrow(
      "does not provide service notes.store",
    );
  });

  it("rejects duplicate private service providers within one plugin", () => {
    const registry = createWorkspacePluginRegistry(capabilityHost());
    registry.register(
      plugin("notes", {
        activate: ({ provide }) => {
          provide(NOTES, { count: 1 });
          provide(NOTES, { count: 2 });
        },
      }),
    );

    expect(() => registry.start()).toThrow("already provides service notes.store");
    expect(() => registry.scope("notes").getService(NOTES)).toThrow(
      "does not provide service notes.store",
    );
  });

  it("rejects duplicate command ids across plugins", () => {
    const registry = createWorkspacePluginRegistry(capabilityHost());
    const command = {
      id: "notes.open",
      title: "Open notes",
      group: "Navigate" as const,
      handler: vi.fn(),
    };
    registry.register(plugin("one", { contributes: { commands: () => [command] } }));
    registry.register(plugin("two", { contributes: { commands: () => [command] } }));

    expect(() => registry.commands({ openPalette: vi.fn() })).toThrow(
      "Command notes.open is contributed more than once",
    );
  });

  it("rolls back a failed registry start", () => {
    const deactivate = vi.fn();
    const registry = createWorkspacePluginRegistry(capabilityHost());
    registry.register(plugin("one", { activate: () => deactivate }));
    const unregisterBroken = registry.register(
      plugin("broken", {
        activate: () => {
          throw new Error("activation failed");
        },
      }),
    );

    expect(() => registry.start()).toThrow("activation failed");
    expect(deactivate).toHaveBeenCalledOnce();

    unregisterBroken();
    expect(() => registry.start()).not.toThrow();
    registry.stop();
    expect(deactivate).toHaveBeenCalledTimes(2);
  });

  it("does not retain a plugin when live activation fails", () => {
    const registry = createWorkspacePluginRegistry(capabilityHost());
    registry.start();

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

describe("workspace capability registry", () => {
  it("rejects duplicate providers and removes released capabilities", () => {
    const host = new WorkspaceCapabilityRegistry();
    const release = host.provide(FILES, { name: "files" });
    expect(() => host.provide(FILES, { name: "other" })).toThrow(
      "Capability test.files is already provided",
    );
    release();
    expect(() => host.get(FILES)).toThrow("Capability test.files is unavailable");
  });
});

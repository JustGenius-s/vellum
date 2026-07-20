import { describe, expect, it, vi } from "vite-plus/test";

import { createCommandRegistry } from "@/application/commands/registry";

describe("command registry", () => {
  it("registers, executes, and disposes commands", () => {
    const registry = createCommandRegistry();
    const handler = vi.fn();
    const dispose = registry.register({
      id: "document.save",
      title: "Save",
      group: "Document",
      icon: "save",
      handler,
    });

    void registry.execute("document.save");
    expect(handler).toHaveBeenCalledOnce();
    expect(registry.list()).toHaveLength(1);

    dispose();
    expect(registry.get("document.save")).toBeUndefined();
  });
});

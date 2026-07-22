import { describe, expect, it } from "vite-plus/test";

import {
  WorkspaceMutationCoordinator,
  workspaceContentRevision,
} from "./workspace-mutation-coordinator";

describe("WorkspaceMutationCoordinator", () => {
  it("requires a matching revision before replacing an existing file", async () => {
    let content = "first";
    const coordinator = new WorkspaceMutationCoordinator({
      read: async () => ({ content, exists: true, buffered: false, dirty: false }),
      write: async (_path, next) => {
        content = next;
        return { saved: true };
      },
    });

    await expect(coordinator.write("main.typ", "second")).rejects.toThrow(/read .* before writing/);
    await expect(coordinator.write("main.typ", "second", "stale")).rejects.toThrow(/changed/);
    const result = await coordinator.write(
      "main.typ",
      "second",
      workspaceContentRevision("first"),
    );

    expect(result.revision).toBe(workspaceContentRevision("second"));
    expect(content).toBe("second");
  });

  it("serializes mutations to the same path", async () => {
    const events: string[] = [];
    let releaseFirst: () => void = () => {};
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const coordinator = new WorkspaceMutationCoordinator({
      read: async () => ({ content: "", exists: false, buffered: false, dirty: false }),
      write: async () => ({ saved: true }),
    });

    const first = coordinator.withPaths(["main.typ"], async () => {
      events.push("first-start");
      await firstGate;
      events.push("first-end");
    });
    const second = coordinator.withPaths(["main.typ"], async () => {
      events.push("second-start");
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toEqual(["first-start"]);

    releaseFirst();
    await Promise.all([first, second]);
    expect(events).toEqual(["first-start", "first-end", "second-start"]);
  });
});

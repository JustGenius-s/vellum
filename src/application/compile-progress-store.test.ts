import { describe, expect, it } from "vite-plus/test";

import { CompileProgressStore } from "@/application/compile-progress-store";

describe("CompileProgressStore", () => {
  it("publishes progress through its own subscription boundary", () => {
    const store = new CompileProgressStore();
    let notifications = 0;
    store.subscribe(() => {
      notifications += 1;
    });

    store.publish({
      phase: "compiling",
      progress: { stage: "compiling", value: 42, label: "Compiling", detail: null },
    });

    expect(store.getSnapshot().phase).toBe("compiling");
    expect(notifications).toBe(1);
  });
});

import { describe, expect, it } from "vite-plus/test";

import type { AiTaskRepository } from "@/application/ports/ai-task-repository";
import { emptyDataQuery } from "@/domain/data";
import { emptyAiTaskStore, type AiTaskStore } from "@/domain/ai-task";
import { AiTaskManager } from "./ai-task-manager";

class MemoryTaskRepository implements AiTaskRepository {
  store: AiTaskStore;

  constructor(store = emptyAiTaskStore()) {
    this.store = structuredClone(store);
  }

  async loadAiTasks() {
    return structuredClone(this.store);
  }

  async saveAiTasks(store: AiTaskStore) {
    this.store = structuredClone(store);
  }
}

function source(path: string) {
  return {
    kind: "data-figure" as const,
    vaultPath: "/vault",
    path,
    query: emptyDataQuery(),
  };
}

function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function until(condition: () => boolean) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Timed out waiting for task state");
}

describe("AiTaskManager", () => {
  it("runs different tasks concurrently without a global limit", async () => {
    const repository = new MemoryTaskRepository();
    const gates = new Map<string, ReturnType<typeof deferred>>();
    const started: string[] = [];
    const manager = new AiTaskManager(repository, async ({ taskId }) => {
      started.push(taskId);
      const gate = deferred();
      gates.set(taskId, gate);
      await gate.promise;
    });
    await manager.initialize();
    const first = manager.create(source("/vault/first.csv"));
    const second = manager.create(source("/vault/second.csv"));

    manager.submit(first.id, "First", []);
    manager.submit(second.id, "Second", []);
    await until(() => started.length === 2);

    expect(new Set(started)).toEqual(new Set([first.id, second.id]));
    gates.forEach((gate) => gate.resolve());
    await until(() => manager.getSnapshot().every((task) => task.status === "completed"));
  });

  it("serializes queued messages within one task", async () => {
    const firstGate = deferred();
    const started: string[] = [];
    const manager = new AiTaskManager(new MemoryTaskRepository(), async ({ input }) => {
      started.push(input.text);
      if (input.text === "First") await firstGate.promise;
    });
    await manager.initialize();
    const task = manager.create(source("/vault/data.csv"));

    manager.submit(task.id, "First", []);
    manager.submit(task.id, "Second", []);
    await until(() => started.length === 1);
    expect(started).toEqual(["First"]);

    firstGate.resolve();
    await until(() => started.length === 2);
    expect(started).toEqual(["First", "Second"]);
  });

  it("cancels only the selected task execution", async () => {
    const manager = new AiTaskManager(new MemoryTaskRepository(), async ({ signal }) => {
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    });
    await manager.initialize();
    const task = manager.create(source("/vault/data.csv"));
    manager.submit(task.id, "Run", []);
    await until(() => manager.getTask(task.id)?.status === "running");

    manager.cancel(task.id);
    await until(() => manager.getTask(task.id)?.status === "cancelled");

    expect(manager.getTask(task.id)?.activeInput?.text).toBe("Run");
  });

  it("restores active work as interrupted and persists its queue", async () => {
    const repository = new MemoryTaskRepository();
    const manager = new AiTaskManager(repository, async () => {});
    await manager.initialize();
    const task = manager.create(source("/vault/data.csv"));
    manager.updateTask(task.id, (current) => ({
      ...current,
      status: "running",
      activeInput: {
        id: "input-active",
        text: "Continue",
        contextPaths: [],
        userMessageId: "message-user",
        createdAt: 1,
      },
    }));
    await manager.flushPersistence();

    const restored = new AiTaskManager(repository, async () => {});
    await restored.initialize();
    const restoredTask = restored.getTask(task.id);

    expect(restoredTask?.status).toBe("interrupted");
    expect(restoredTask?.activeInput).toBeNull();
    expect(restoredTask?.pendingInputs[0]?.text).toBe("Continue");
  });

  it("supports persistent workspace editing tasks without figure state", async () => {
    const manager = new AiTaskManager(new MemoryTaskRepository(), async () => {});
    await manager.initialize();
    const task = manager.create({
      kind: "workspace",
      vaultPath: "/vault",
      path: "/vault/main.typ",
      diagnostics: [],
    });

    manager.submit(task.id, "Repair the document", []);
    await until(() => manager.getTask(task.id)?.status === "completed");

    expect(manager.getTask(task.id)).toMatchObject({
      title: "Repair the document",
      result: null,
      source: { kind: "workspace", path: "/vault/main.typ" },
    });
  });
});

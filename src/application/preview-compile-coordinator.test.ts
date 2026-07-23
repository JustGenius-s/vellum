import { describe, expect, it } from "vite-plus/test";

import { PreviewCompileCoordinator } from "@/application/preview-compile-coordinator";
import type { CompileRequest } from "@/application/ports/workspace-gateway";
import type { CompileSvgResult } from "@/domain/workspace";

function request(requestId: string): CompileRequest {
  return {
    requestId,
    intent: "preview",
    vaultPath: "/vault",
    mainFile: "/vault/main.typ",
    latinFont: "",
    cjkFont: "",
    packageCachePath: null,
    packageDataPath: null,
    cachedPageIds: [],
    overlays: [{ path: "/vault/main.typ", revision: 1, content: requestId }],
  };
}

function result(requestId: string): CompileSvgResult {
  return {
    requestId,
    diagnostics: [],
    pageOrder: [],
    changedPages: [],
    metrics: {
      timings: { queueMs: 0, prepareMs: 0, compileMs: 0, renderMs: 0, totalMs: 0 },
      fileCacheHits: 0,
      fileCacheMisses: 0,
      renderedPages: 0,
      reusedPages: 0,
      svgBytes: 0,
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function tick() {
  await new Promise((resolve) => setTimeout(resolve, 5));
}

describe("PreviewCompileCoordinator", () => {
  it("debounces edits and keeps only the newest scheduled request", async () => {
    const started: string[] = [];
    const completed: string[] = [];
    const coordinator = new PreviewCompileCoordinator({
      delay: 0,
      run: async (value) => result(value.requestId),
      onStart: (value) => started.push(value.requestId),
      onProgress: () => {},
      onResult: (value) => completed.push(value.requestId),
      onError: () => {},
    });

    coordinator.schedule(() => request("first"));
    coordinator.schedule(() => request("latest"));
    await tick();

    expect(started).toEqual(["latest"]);
    expect(completed).toEqual(["latest"]);
  });

  it("runs one active compile and replaces the single pending request", async () => {
    const first = deferred<CompileSvgResult>();
    const started: string[] = [];
    const completed: string[] = [];
    const coordinator = new PreviewCompileCoordinator({
      delay: 0,
      run: (value) => (value.requestId === "first" ? first.promise : Promise.resolve(result(value.requestId))),
      onStart: (value) => started.push(value.requestId),
      onProgress: () => {},
      onResult: (value) => completed.push(value.requestId),
      onError: () => {},
    });

    coordinator.runNow(() => request("first"));
    coordinator.runNow(() => request("second"));
    coordinator.runNow(() => request("latest"));
    expect(started).toEqual(["first"]);

    first.resolve(result("first"));
    await tick();

    expect(started).toEqual(["first", "latest"]);
    expect(completed).toEqual(["latest"]);
  });
});

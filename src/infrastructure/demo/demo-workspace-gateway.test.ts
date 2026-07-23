import { describe, expect, it } from "vite-plus/test";

import type { CompileRequest } from "@/application/ports/workspace-gateway";
import { DemoWorkspaceGateway } from "@/infrastructure/demo/demo-workspace-gateway";

function request(requestId: string, cachedPageIds: string[]): CompileRequest {
  return {
    requestId,
    intent: "preview",
    vaultPath: "/Vellum Demo",
    mainFile: "/Vellum Demo/main.typ",
    latinFont: "",
    cjkFont: "",
    packageCachePath: null,
    packageDataPath: null,
    cachedPageIds,
    overlays: [
      {
        path: "/Vellum Demo/main.typ",
        revision: 1,
        content: "= Cache handshake",
      },
    ],
  };
}

describe("DemoWorkspaceGateway SVG patches", () => {
  it("returns a cached backend SVG when the frontend does not declare the page", async () => {
    const gateway = new DemoWorkspaceGateway();
    const first = await gateway.compileSvg(request("first", []), () => {});
    const pageId = first.pageOrder[0].id;

    expect(first.changedPages).toHaveLength(1);

    const frontendHit = await gateway.compileSvg(request("frontend-hit", [pageId]), () => {});
    expect(frontendHit.changedPages).toEqual([]);

    const frontendMiss = await gateway.compileSvg(request("frontend-miss", []), () => {});
    expect(frontendMiss.changedPages).toEqual([{ id: pageId, svg: first.changedPages[0].svg }]);
    expect(frontendMiss.metrics.renderedPages).toBe(0);
    expect(frontendMiss.metrics.reusedPages).toBe(1);
  });
});

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { WorkspaceFileChange } from "@/application/ports/workspace-gateway";
import { WorkspaceController } from "@/application/workspace-controller";
import type { BacklinkIndex, TreeNode } from "@/domain/workspace";
import { DemoWorkspaceGateway } from "@/infrastructure/demo/demo-workspace-gateway";

const ROOT = "/Vellum Demo";

function file(name: string): TreeNode {
  return { name, path: `${ROOT}/${name}`, isDir: false, children: [] };
}

class RefreshTestGateway extends DemoWorkspaceGateway {
  tree = [file("before.typ")];
  openTabs: string[] = [];
  contents = new Map<string, string>();
  backlinkRequests = 0;
  watchListener: ((change: WorkspaceFileChange) => void) | null = null;

  override async loadSession() {
    const session = await super.loadSession();
    return {
      ...session,
      openTabs: this.openTabs,
      activeTabPath: this.openTabs[0] ?? null,
    };
  }

  override async watchWorkspace(
    _vaultPath: string,
    listener: (change: WorkspaceFileChange) => void,
  ) {
    this.watchListener = listener;
    return () => {
      if (this.watchListener === listener) this.watchListener = null;
    };
  }

  override async listTree() {
    return this.tree;
  }

  override async readFile(path: string) {
    const content = this.contents.get(path);
    if (content != null) return content;
    return super.readFile(path);
  }

  override async indexBacklinks(): Promise<BacklinkIndex> {
    this.backlinkRequests += 1;
    if (this.backlinkRequests === 1) return { links: {} };
    return new Promise(() => {});
  }

  emit(change: WorkspaceFileChange) {
    this.watchListener?.(change);
  }
}

afterEach(() => vi.unstubAllGlobals());

describe("WorkspaceController file tree refresh", () => {
  it("publishes the new tree without waiting for backlink indexing", async () => {
    vi.stubGlobal("window", {
      clearTimeout: globalThis.clearTimeout,
      setTimeout: globalThis.setTimeout,
    });
    const gateway = new RefreshTestGateway();
    const controller = new WorkspaceController(gateway);
    await controller.initialize();

    gateway.tree = [file("after.typ")];
    await controller.refreshTree();

    expect(controller.getSnapshot().tree).toEqual([file("after.typ")]);
    expect(controller.getSnapshot().statusText).toBe("Files refreshed");
    expect(gateway.backlinkRequests).toBe(2);
  });

  it("reloads clean open documents from disk", async () => {
    vi.stubGlobal("window", {
      clearTimeout: globalThis.clearTimeout,
      setTimeout: globalThis.setTimeout,
    });
    const path = `${ROOT}/library.bib`;
    const gateway = new RefreshTestGateway();
    gateway.tree = [file("library.bib")];
    gateway.openTabs = [path];
    gateway.contents.set(path, "@book{before, title = {Before}}");
    const controller = new WorkspaceController(gateway);
    await controller.initialize();

    gateway.contents.set(path, "@book{after, title = {After}}");
    await controller.refreshTree();

    expect(controller.documentBuffers.getString(path)).toContain("@book{after");
    expect(controller.getSnapshot().tabs[0]).toMatchObject({ dirty: false, revision: 1 });
  });

  it("automatically reloads external changes and preserves dirty documents", async () => {
    vi.stubGlobal("window", {
      clearTimeout: globalThis.clearTimeout,
      setTimeout: globalThis.setTimeout,
    });
    const path = `${ROOT}/library.bib`;
    const gateway = new RefreshTestGateway();
    gateway.tree = [file("library.bib")];
    gateway.openTabs = [path];
    gateway.contents.set(path, "@book{before, title = {Before}}");
    const controller = new WorkspaceController(gateway);
    await controller.initialize();
    await vi.waitFor(() => expect(gateway.watchListener).not.toBeNull());

    gateway.contents.set(path, "@book{external, title = {External}}");
    gateway.tree = [file("library.bib"), file("new.typ")];
    gateway.emit({ paths: [path] });
    await vi.waitFor(() =>
      expect(controller.documentBuffers.getString(path)).toContain("@book{external"),
    );
    expect(controller.getSnapshot().tree).toEqual([file("library.bib"), file("new.typ")]);

    controller.updateSource("@book{local, title = {Unsaved}}");
    gateway.contents.set(path, "@book{second, title = {Second external change}}");
    gateway.emit({ paths: [path] });
    await vi.waitFor(() => expect(controller.getSnapshot().statusText).toContain("unsaved changes"));

    expect(controller.documentBuffers.getString(path)).toContain("@book{local");
    expect(controller.getSnapshot().tabs[0].dirty).toBe(true);
  });
});

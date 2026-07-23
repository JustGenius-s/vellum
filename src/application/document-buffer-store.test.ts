import { Text } from "@codemirror/state";
import { describe, expect, it } from "vite-plus/test";

import {
  collectCompileOverlays,
  DocumentBufferStore,
} from "@/application/document-buffer-store";

describe("DocumentBufferStore", () => {
  it("keeps CodeMirror Text authoritative and only materializes strings on demand", () => {
    const store = new DocumentBufferStore();
    const initial = store.open("/vault/main.typ", "hello");
    const edited = initial.replace(5, 5, Text.of([" world"]));
    const revision = store.replace("/vault/main.typ", edited);

    expect(store.getText("/vault/main.typ")).toBe(edited);
    expect(store.getString("/vault/main.typ")).toBe("hello world");
    expect(revision).toBe(1);
  });

  it("collects the main file and every dirty text tab as overlays", () => {
    const store = new DocumentBufferStore();
    store.open("/vault/main.typ", "main");
    store.open("/vault/include.typ", "include");
    store.open("/vault/clean.typ", "clean");
    store.open("/vault/data.csv", "1,2");

    const overlays = collectCompileOverlays(
      [
        { path: "/vault/main.typ", name: "main.typ", dirty: false, revision: 2 },
        { path: "/vault/include.typ", name: "include.typ", dirty: true, revision: 4 },
        { path: "/vault/clean.typ", name: "clean.typ", dirty: false, revision: 0 },
        { path: "/vault/data.csv", name: "data.csv", dirty: true, revision: 1 },
      ],
      store,
      "/vault/main.typ",
    );

    expect(overlays).toEqual([
      { path: "/vault/main.typ", revision: 2, content: "main" },
      { path: "/vault/include.typ", revision: 4, content: "include" },
    ]);
  });
});

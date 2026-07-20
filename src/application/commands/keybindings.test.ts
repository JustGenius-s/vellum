import { describe, expect, it } from "vite-plus/test";

import { createKeybindingManager, evaluateWhen } from "@/application/commands/keybindings";

const key = (
  value: string,
  modifiers: Partial<{
    metaKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
  }> = {},
) => ({
  key: value,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...modifiers,
});

describe("keybinding manager", () => {
  it("maps Mod to the active platform modifier", () => {
    const manager = createKeybindingManager("Cmd");
    manager.bind({ keys: "Mod+S", command: "file.save" });
    expect(manager.resolve(key("s", { metaKey: true }), {})).toEqual({
      kind: "found",
      command: "file.save",
    });
  });

  it("resolves multi-chord bindings", () => {
    const manager = createKeybindingManager("Ctrl");
    manager.bind({ keys: "Ctrl+K Ctrl+O", command: "workspace.open" });
    const first = manager.resolve(key("k", { ctrlKey: true }), {});
    expect(first.kind).toBe("more");
    if (first.kind !== "more") throw new Error("expected a chord prefix");
    expect(manager.resolve(key("o", { ctrlKey: true }), {}, first.chords)).toEqual({
      kind: "found",
      command: "workspace.open",
    });
  });

  it("supports positive and negated contexts", () => {
    expect(evaluateWhen("hasVault && !paletteOpen", { hasVault: true, paletteOpen: false })).toBe(
      true,
    );
    expect(evaluateWhen("hasVault && !paletteOpen", { hasVault: false, paletteOpen: false })).toBe(
      false,
    );
  });
});

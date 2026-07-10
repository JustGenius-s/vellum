import { describe, expect, it, vi } from "vitest";
import { createCommandRegistry } from "./commands/registry";
import {
  createKeybindingManager,
  ResolveResultKind,
  type KeyEvent,
} from "./commands/keybinding";
import { parseOutline } from "./outline";

function keyEvent(key: string, overrides: Partial<KeyEvent> = {}): KeyEvent {
  return {
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides,
  };
}

describe("command registry", () => {
  it("registers, executes, and disposes commands", () => {
    const registry = createCommandRegistry();
    const handler = vi.fn();
    const dispose = registry.registerCommand({
      id: "file.save",
      label: "Save",
      handler,
    });

    registry.executeCommand("file.save", "draft.typ");
    expect(handler).toHaveBeenCalledWith("draft.typ");

    dispose();
    registry.executeCommand("file.save");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("notifies listeners when commands register", () => {
    const registry = createCommandRegistry();
    const listener = vi.fn();
    const unsubscribe = registry.onDidRegisterCommand(listener);

    registry.registerCommand({ id: "view.graph", handler: vi.fn() });
    expect(listener).toHaveBeenCalledWith("view.graph");

    unsubscribe();
    registry.registerCommand({ id: "view.editor", handler: vi.fn() });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("keybinding manager", () => {
  it("normalizes platform modifiers and evaluates context", () => {
    const manager = createKeybindingManager();
    manager.bind({
      keys: "Cmd+Shift+P",
      command: "palette.open",
      when: "editorFocus && !modalOpen",
    });

    expect(
      manager.resolve(
        keyEvent("p", { metaKey: true, shiftKey: true }),
        { editorFocus: true, modalOpen: false },
      ),
    ).toEqual({ kind: ResolveResultKind.Found, command: "palette.open" });

    expect(
      manager.resolve(
        keyEvent("p", { metaKey: true, shiftKey: true }),
        { editorFocus: true, modalOpen: true },
      ),
    ).toEqual({ kind: ResolveResultKind.NoMatch });
  });

  it("resolves multi-chord shortcuts", () => {
    const manager = createKeybindingManager();
    manager.bind({ keys: "Ctrl+K Ctrl+S", command: "keys.open" });

    const first = manager.resolve(
      keyEvent("k", { ctrlKey: true }),
      {},
    );
    expect(first.kind).toBe(ResolveResultKind.MoreChords);

    expect(
      manager.resolve(
        keyEvent("s", { ctrlKey: true }),
        {},
        ["Ctrl+K"],
      ),
    ).toEqual({ kind: ResolveResultKind.Found, command: "keys.open" });
  });
});

describe("outline parser", () => {
  it("extracts Typst headings with source positions", () => {
    const source = [
      "= Overview <overview>",
      "Body",
      "== 中文章节 #label(\"section\")",
    ].join("\n");

    expect(parseOutline(source)).toEqual([
      { level: 1, title: "Overview", line: 1, from: 2 },
      { level: 2, title: "中文章节", line: 3, from: 30 },
    ]);
  });

  it("ignores invalid heading levels and empty headings", () => {
    expect(parseOutline("======= Too deep\n=   \nPlain text")).toEqual([]);
  });
});

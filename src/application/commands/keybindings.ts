export type PrimaryModifier = "Cmd" | "Ctrl";

export interface Keybinding {
  keys: string;
  command: string;
  when?: string | null;
}

interface ResolvedBinding {
  chords: string[];
  command: string;
  when: string | null;
}

export type KeyEventLike = Pick<
  KeyboardEvent,
  "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "key"
>;

export type ResolveResult =
  | { kind: "none" }
  | { kind: "more"; chords: string[] }
  | { kind: "found"; command: string };

const modifierKeys = new Set(["Meta", "Control", "Alt", "Shift"]);

function normalizeEvent(event: KeyEventLike): string | null {
  if (modifierKeys.has(event.key)) return null;
  const parts: string[] = [];
  if (event.metaKey) parts.push("Cmd");
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");

  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  parts.push(key.charAt(0).toUpperCase() + key.slice(1));
  return parts.join("+");
}

function normalizeChord(keys: string, primary: PrimaryModifier) {
  return keys.split(/\s+/).map((chord) =>
    chord
      .split("+")
      .map((part) => {
        const value = part.trim();
        if (value === "Mod") return primary;
        if (["Cmd", "Ctrl", "Alt", "Shift"].includes(value)) return value;
        if (value.length === 1) return value.toUpperCase();
        return value.charAt(0).toUpperCase() + value.slice(1);
      })
      .join("+"),
  );
}

export function evaluateWhen(condition: string | null, context: Record<string, boolean>) {
  if (!condition) return true;
  return condition.split(/\s*&&\s*/).every((part) => {
    const negate = part.startsWith("!");
    const key = negate ? part.slice(1).trim() : part.trim();
    return negate ? !context[key] : Boolean(context[key]);
  });
}

export interface KeybindingManager {
  bind(binding: Keybinding): () => void;
  resolve(
    event: KeyEventLike,
    context: Record<string, boolean>,
    currentChords?: string[],
  ): ResolveResult;
  forCommand(commandId: string): string | undefined;
}

export function createKeybindingManager(primary: PrimaryModifier): KeybindingManager {
  const bindings: ResolvedBinding[] = [];

  return {
    bind(binding) {
      const resolved = {
        chords: normalizeChord(binding.keys, primary),
        command: binding.command,
        when: binding.when ?? null,
      };
      bindings.push(resolved);
      return () => {
        const index = bindings.indexOf(resolved);
        if (index >= 0) bindings.splice(index, 1);
      };
    },
    resolve(event, context, currentChords = []) {
      const chord = normalizeEvent(event);
      if (!chord) return { kind: "none" };
      const allChords = [...currentChords, chord];
      let exact: ResolvedBinding | null = null;
      let hasLongerMatch = false;

      for (const binding of bindings) {
        if (!evaluateWhen(binding.when, context)) continue;
        const prefixMatches = allChords.every(
          (candidate, index) => binding.chords[index] === candidate,
        );
        if (!prefixMatches) continue;
        if (binding.chords.length === allChords.length) exact = binding;
        if (binding.chords.length > allChords.length) hasLongerMatch = true;
      }

      if (exact) return { kind: "found", command: exact.command };
      if (hasLongerMatch) return { kind: "more", chords: allChords };
      return { kind: "none" };
    },
    forCommand(commandId) {
      return bindings.find((binding) => binding.command === commandId)?.chords.join(" ");
    },
  };
}

export function displayKeybinding(keys: string, primary: PrimaryModifier) {
  return normalizeChord(keys, primary)
    .join(" ")
    .replaceAll("Cmd", "⌘")
    .replaceAll("Ctrl", "Ctrl")
    .replaceAll("Shift", "⇧")
    .replaceAll("Alt", "⌥")
    .replaceAll("+", "");
}

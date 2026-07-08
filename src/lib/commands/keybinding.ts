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

export type KeyEvent = {
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  key: string;
};

export const enum ResolveResultKind {
  NoMatch,
  MoreChords,
  Found,
}

export type ResolveResult =
  | { kind: ResolveResultKind.NoMatch }
  | { kind: ResolveResultKind.MoreChords }
  | { kind: ResolveResultKind.Found; command: string };

const MODIFIER_KEY = new Set(["Meta", "Control", "Alt", "Shift"]);

function normalizeKey(event: KeyEvent): string | null {
  const parts: string[] = [];
  if (event.metaKey) parts.push("Cmd");
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey && !MODIFIER_KEY.has(event.key)) parts.push("Shift");

  const key = event.key;
  if (MODIFIER_KEY.has(key)) return parts.length > 0 ? null : null;

  let normalizedKey = key;
  if (key.length === 1) {
    normalizedKey = key.toUpperCase();
  } else {
    normalizedKey = key.charAt(0).toUpperCase() + key.slice(1);
  }

  parts.push(normalizedKey);
  return parts.join("+");
}

function normalizeChords(keys: string): string[] {
  return keys.split(/\s+/).map((chord) => {
    return chord
      .split("+")
      .map((p) => {
        const t = p.trim();
        if (t === "Cmd" || t === "Ctrl" || t === "Alt" || t === "Shift") return t;
        return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
      })
      .join("+");
  });
}

function evaluateWhen(condition: string | null, context: Record<string, unknown>): boolean {
  if (!condition) return true;
  const parts = condition.split(/\s*&&\s*/);
  for (const part of parts) {
    const negate = part.startsWith("!");
    const key = negate ? part.slice(1).trim() : part.trim();
    const val = context[key];
    if (negate ? val : !val) return false;
  }
  return true;
}

export interface KeybindingManager {
  bind(keybinding: Keybinding): () => void;
  unbindByCommand(commandId: string): void;
  resolve(event: KeyEvent, context: Record<string, unknown>, currentChords?: string[]): ResolveResult;
  getKeybindingForCommand(commandId: string): string | undefined;
  getContextValue(key: string): boolean;
  setContextValue(key: string, value: boolean): void;
}

export function createKeybindingManager(): KeybindingManager {
  const bindings: ResolvedBinding[] = [];
  const contextValues = new Map<string, boolean>();

  return {
    bind(kb) {
      const binding: ResolvedBinding = {
        chords: normalizeChords(kb.keys),
        command: kb.command,
        when: kb.when ?? null,
      };
      bindings.push(binding);
      return () => {
        const idx = bindings.indexOf(binding);
        if (idx >= 0) bindings.splice(idx, 1);
      };
    },

    unbindByCommand(commandId) {
      for (let i = bindings.length - 1; i >= 0; i--) {
        if (bindings[i].command === commandId) bindings.splice(i, 1);
      }
    },

    resolve(event, context, currentChords?: string[]) {
      const chord = normalizeKey(event);
      if (!chord) return { kind: ResolveResultKind.NoMatch };

      const prevChords = currentChords ?? [];
      const allChords = [...prevChords, chord];

      let bestMatch: ResolvedBinding | null = null;
      let hasMoreChords = false;

      for (const binding of bindings) {
        if (!evaluateWhen(binding.when, context)) continue;

        let prefixMatch = true;
        for (let i = 0; i < allChords.length; i++) {
          if (binding.chords.length <= i || binding.chords[i] !== allChords[i]) {
            prefixMatch = false;
            break;
          }
        }
        if (!prefixMatch) continue;

        if (binding.chords.length === allChords.length) {
          bestMatch = binding;
        } else if (binding.chords.length > allChords.length) {
          hasMoreChords = true;
        }
      }

      if (bestMatch) return { kind: ResolveResultKind.Found, command: bestMatch.command };
      if (hasMoreChords) return { kind: ResolveResultKind.MoreChords };
      return { kind: ResolveResultKind.NoMatch };
    },

    getKeybindingForCommand(commandId) {
      for (const b of bindings) {
        if (b.command === commandId) return b.chords.join(" ");
      }
      return undefined;
    },

    getContextValue(key) {
      return !!contextValues.get(key);
    },

    setContextValue(key, value) {
      contextValues.set(key, value);
    },
  };
}

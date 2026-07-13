export interface EditorPreferences {
  fontSize: number;
  lineNumbers: boolean;
  wordWrap: boolean;
  autoSave: boolean;
  autoSaveDelayMs: number;
}

interface PersistedSettings {
  schemaVersion: 1;
  editor: EditorPreferences;
}

const STORAGE_KEY = "vellum-settings";
const DEFAULT_EDITOR: EditorPreferences = {
  fontSize: 14,
  lineNumbers: true,
  wordWrap: true,
  autoSave: true,
  autoSaveDelayMs: 2000,
};

function normalizeEditor(value: Partial<EditorPreferences>): EditorPreferences {
  const fontSize = Number(value.fontSize);
  const autoSaveDelayMs = Number(value.autoSaveDelayMs);
  return {
    fontSize:
      Number.isFinite(fontSize) && fontSize >= 12 && fontSize <= 22
        ? fontSize
        : DEFAULT_EDITOR.fontSize,
    lineNumbers:
      typeof value.lineNumbers === "boolean"
        ? value.lineNumbers
        : DEFAULT_EDITOR.lineNumbers,
    wordWrap:
      typeof value.wordWrap === "boolean"
        ? value.wordWrap
        : DEFAULT_EDITOR.wordWrap,
    autoSave:
      typeof value.autoSave === "boolean"
        ? value.autoSave
        : DEFAULT_EDITOR.autoSave,
    autoSaveDelayMs:
      Number.isFinite(autoSaveDelayMs) &&
      autoSaveDelayMs >= 500 &&
      autoSaveDelayMs <= 10000
        ? autoSaveDelayMs
        : DEFAULT_EDITOR.autoSaveDelayMs,
  };
}

export function createSettings() {
  let editor = $state<EditorPreferences>({ ...DEFAULT_EDITOR });

  function persist() {
    const payload: PersistedSettings = {
      schemaVersion: 1,
      editor,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  function init() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<PersistedSettings>;
      if (saved.schemaVersion === 1 && saved.editor) {
        editor = normalizeEditor(saved.editor);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  function updateEditor(patch: Partial<EditorPreferences>) {
    editor = normalizeEditor({ ...editor, ...patch });
    persist();
  }

  function resetEditor() {
    editor = { ...DEFAULT_EDITOR };
    persist();
  }

  return {
    get editor() { return editor; },
    init,
    updateEditor,
    resetEditor,
  };
}

export type Settings = ReturnType<typeof createSettings>;

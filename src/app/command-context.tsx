import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  createCommandRegistry,
  type Command,
  type CommandRegistry,
} from "@/application/commands/registry";
import {
  createKeybindingManager,
  type KeybindingManager,
  type PrimaryModifier,
} from "@/application/commands/keybindings";
import { useWorkspace } from "@/app/workspace-context";

export type PaletteMode = "commands" | "files";

interface CommandContextValue {
  registry: CommandRegistry;
  keybindings: KeybindingManager;
  primaryModifier: PrimaryModifier;
  paletteOpen: boolean;
  paletteMode: PaletteMode;
  paletteQuery: string;
  setPaletteOpen(open: boolean): void;
  setPaletteQuery(query: string): void;
  openPalette(mode?: PaletteMode, query?: string): void;
  register(command: Command): () => void;
  execute(id: string): void;
}

const CommandContext = createContext<CommandContextValue | null>(null);

function detectPrimaryModifier(): PrimaryModifier {
  return /Mac|iPhone|iPad/.test(navigator.platform) ? "Cmd" : "Ctrl";
}

export function CommandProvider({ children }: { children: ReactNode }) {
  const { controller, state } = useWorkspace();
  const primaryModifier = useMemo(detectPrimaryModifier, []);
  const registry = useMemo(createCommandRegistry, []);
  const keybindings = useMemo(() => createKeybindingManager(primaryModifier), [primaryModifier]);
  const disposals = useRef(new Map<string, () => void>());
  const chords = useRef<string[]>([]);
  const chordTimer = useRef<number | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteMode, setPaletteMode] = useState<PaletteMode>("commands");
  const [paletteQuery, setPaletteQuery] = useState("");

  const openPalette = useCallback((mode: PaletteMode = "commands", query = "") => {
    setPaletteMode(mode);
    setPaletteQuery(query);
    setPaletteOpen(true);
  }, []);

  const register = useCallback(
    (command: Command) => {
      disposals.current.get(command.id)?.();
      const disposeCommand = registry.register(command);
      const disposeBinding = command.keybinding
        ? keybindings.bind({
            keys: command.keybinding,
            command: command.id,
            when: command.when,
          })
        : () => undefined;
      const dispose = () => {
        disposeBinding();
        disposeCommand();
        disposals.current.delete(command.id);
      };
      disposals.current.set(command.id, dispose);
      return dispose;
    },
    [keybindings, registry],
  );

  const execute = useCallback(
    (id: string) => {
      void registry.execute(id);
    },
    [registry],
  );

  useEffect(() => {
    const commands: Command[] = [
      {
        id: "palette.open",
        title: "Open command palette",
        description: "Search every registered action",
        group: "Navigate",
        icon: "command",
        keybinding: "Mod+K",
        handler: () => openPalette("commands"),
      },
      {
        id: "file.quick-open",
        title: "Quick open document",
        description: "Jump to any Typst file in the vault",
        group: "Navigate",
        icon: "document",
        keybinding: "Mod+P",
        when: "hasVault",
        handler: () => openPalette("files"),
      },
      {
        id: "workspace.open",
        title: "Open vault",
        description: "Choose a local folder as the active workspace",
        group: "Workspace",
        icon: "folder",
        keybinding: "Mod+O",
        handler: () => controller.openVault(),
      },
      {
        id: "file.save",
        title: "Save active document",
        group: "Document",
        icon: "save",
        keybinding: "Mod+S",
        when: "hasActiveFile",
        handler: () => controller.saveActive(),
      },
      {
        id: "file.export-pdf",
        title: "Export active document as PDF",
        group: "Document",
        icon: "export",
        keybinding: "Mod+Shift+P",
        when: "hasActiveFile",
        handler: () => controller.exportPdf(),
      },
      {
        id: "document.compile",
        title: "Compile preview now",
        group: "Document",
        icon: "compile",
        keybinding: "Mod+Enter",
        when: "hasActiveFile",
        handler: () => controller.compileActive(),
      },
      {
        id: "view.problems",
        title: state.problemsOpen ? "Hide problems" : "Show problems",
        group: "View",
        icon: "problems",
        keybinding: "Mod+J",
        when: "hasActiveFile",
        handler: () => controller.setProblemsOpen(!state.problemsOpen),
      },
      {
        id: "view.editor",
        title: "Focus editor",
        group: "View",
        icon: "document",
        keybinding: "Mod+1",
        when: "hasActiveFile",
        handler: () => controller.setCompactSurface("editor"),
      },
      {
        id: "view.preview",
        title: "Focus preview",
        group: "View",
        icon: "panel",
        keybinding: "Mod+2",
        when: "hasActiveFile",
        handler: () => controller.setCompactSurface("preview"),
      },
    ];

    const dispose = commands.map(register);
    return () => dispose.forEach((release) => release());
  }, [controller, openPalette, register, state.problemsOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (isTyping && !event.metaKey && !event.ctrlKey && !event.altKey) return;

      const result = keybindings.resolve(
        event,
        {
          hasVault: Boolean(state.vaultPath),
          hasActiveFile: Boolean(state.activePath),
          paletteOpen,
          problemsOpen: state.problemsOpen,
        },
        chords.current,
      );

      if (result.kind === "none") {
        chords.current = [];
        return;
      }

      event.preventDefault();
      if (result.kind === "more") {
        chords.current = result.chords;
        if (chordTimer.current) window.clearTimeout(chordTimer.current);
        chordTimer.current = window.setTimeout(() => {
          chords.current = [];
        }, 1200);
        return;
      }

      chords.current = [];
      execute(result.command);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [execute, keybindings, paletteOpen, state.activePath, state.problemsOpen, state.vaultPath]);

  const value = useMemo<CommandContextValue>(
    () => ({
      registry,
      keybindings,
      primaryModifier,
      paletteOpen,
      paletteMode,
      paletteQuery,
      setPaletteOpen,
      setPaletteQuery,
      openPalette,
      register,
      execute,
    }),
    [
      execute,
      keybindings,
      openPalette,
      paletteMode,
      paletteOpen,
      paletteQuery,
      primaryModifier,
      register,
      registry,
    ],
  );

  return <CommandContext.Provider value={value}>{children}</CommandContext.Provider>;
}

export function useCommands() {
  const context = useContext(CommandContext);
  if (!context) throw new Error("CommandProvider is missing");
  return context;
}

export function useCommandRegistration(command: Command) {
  const { register } = useCommands();
  useEffect(() => register(command), [command, register]);
}

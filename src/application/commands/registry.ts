export type CommandGroup = "Workspace" | "Document" | "View" | "Navigate" | "Developer";

export interface Command {
  id: string;
  title: string;
  description?: string;
  group: CommandGroup;
  keywords?: string[];
  keybinding?: string;
  when?: string | null;
  handler: () => void | Promise<void>;
}

export interface CommandRegistry {
  register(command: Command): () => void;
  get(id: string): Command | undefined;
  list(): Command[];
  execute(id: string): void | Promise<void>;
  subscribe(listener: () => void): () => void;
}

export function createCommandRegistry(): CommandRegistry {
  const commands = new Map<string, Command>();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());

  return {
    register(command) {
      commands.set(command.id, command);
      emit();
      return () => {
        if (commands.get(command.id) === command) {
          commands.delete(command.id);
          emit();
        }
      };
    },
    get(id) {
      return commands.get(id);
    },
    list() {
      return [...commands.values()].sort((a, b) => a.title.localeCompare(b.title));
    },
    execute(id) {
      return commands.get(id)?.handler();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

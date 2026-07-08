export interface Command {
  id: string;
  handler: (...args: unknown[]) => void | Promise<void>;
  label?: string;
  description?: string;
  icon?: unknown;
}

export interface CommandRegistry {
  readonly onDidRegisterCommand: (cb: (id: string) => void) => () => void;
  registerCommand(command: Command): () => void;
  getCommand(id: string): Command | undefined;
  getCommands(): Command[];
  executeCommand(id: string, ...args: unknown[]): void | Promise<void>;
}

export function createCommandRegistry(): CommandRegistry {
  const commands = new Map<string, Command>();
  const listeners = new Set<(id: string) => void>();

  return {
    onDidRegisterCommand(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    registerCommand(command) {
      commands.set(command.id, command);
      for (const cb of listeners) cb(command.id);
      return () => commands.delete(command.id);
    },

    getCommand(id) {
      return commands.get(id);
    },

    getCommands() {
      return Array.from(commands.values());
    },

    executeCommand(id, ...args) {
      const cmd = commands.get(id);
      if (!cmd) return;
      return cmd.handler(...args);
    },
  };
}

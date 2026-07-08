import type { CommandRegistry } from "$lib/commands/registry";
import type { KeybindingManager, ResolveResult, KeyEvent } from "$lib/commands/keybinding";

export { ResolveResultKind } from "$lib/commands/keybinding";

export interface CommandService {
  readonly registry: CommandRegistry;
  readonly keybindings: KeybindingManager;
  executeCommand(id: string, ...args: unknown[]): void | Promise<void>;
  resolveKeyEvent(event: KeyEvent): ResolveResult;
}

export function createCommandService(registry: CommandRegistry, keybindings: KeybindingManager): CommandService {
  return {
    registry,
    keybindings,

    executeCommand(id, ...args) {
      return registry.executeCommand(id, ...args);
    },

    resolveKeyEvent(event) {
      return keybindings.resolve(event, {});
    },
  };
}

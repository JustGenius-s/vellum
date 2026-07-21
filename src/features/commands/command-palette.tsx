import { useEffect, useMemo, useState } from "react";

import { evaluateWhen, displayKeybinding } from "@/application/commands/keybindings";
import type { Command as CommandDescriptor, CommandGroup } from "@/application/commands/registry";
import { useCommands } from "@/app/command-context";
import { useWorkspace } from "@/app/workspace-context";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup as CommandGroupView,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { fileStem, flattenFiles } from "@/domain/workspace";

const groupOrder: CommandGroup[] = ["Navigate", "Document", "View", "Workspace", "Developer"];

export function CommandPalette() {
  const {
    registry,
    primaryModifier,
    paletteOpen,
    paletteMode,
    paletteQuery,
    setPaletteOpen,
    setPaletteQuery,
    execute,
  } = useCommands();
  const { controller, state } = useWorkspace();
  const [commands, setCommands] = useState<CommandDescriptor[]>(() => registry.list());

  useEffect(() => registry.subscribe(() => setCommands(registry.list())), [registry]);

  const commandContext = useMemo(
    () => ({
      hasVault: Boolean(state.vaultPath),
      hasActiveFile: Boolean(state.activePath),
      problemsOpen: state.problemsOpen,
      paletteOpen,
    }),
    [paletteOpen, state.activePath, state.problemsOpen, state.vaultPath],
  );
  const availableCommands = commands.filter((command) =>
    evaluateWhen(command.when ?? null, commandContext),
  );
  const visibleCommands = availableCommands.filter((command) => command.id !== "palette.open");
  const files = flattenFiles(state.tree);

  function run(id: string) {
    setPaletteOpen(false);
    execute(id);
  }

  function openFile(path: string) {
    setPaletteOpen(false);
    void controller.openFile(path);
  }

  return (
    <CommandDialog
      open={paletteOpen}
      onOpenChange={setPaletteOpen}
      title={paletteMode === "files" ? "Quick open" : "Command palette"}
      description={
        paletteMode === "files" ? "Search local documents" : "Search available commands"
      }
      className="sm:max-w-[40rem]"
    >
      <Command>
        <CommandInput
          value={paletteQuery}
          onValueChange={setPaletteQuery}
          placeholder={paletteMode === "files" ? "Search documents..." : "Search commands..."}
        />
        <CommandList className="max-h-[min(32rem,70dvh)] px-1 pb-1">
          <CommandEmpty>No results found.</CommandEmpty>

          {paletteMode === "files" && files.length ? (
            <CommandGroupView heading="Documents">
              {files.map((file) => (
                <CommandItem
                  key={file.path}
                  value={`file ${file.name} ${file.path}`}
                  onSelect={() => openFile(file.path)}
                >
                  <span className="truncate">{fileStem(file.name)}</span>
                </CommandItem>
              ))}
            </CommandGroupView>
          ) : null}

          {paletteMode === "commands"
            ? groupOrder.map((group) => {
                const items = visibleCommands.filter((command) => command.group === group);
                if (!items.length) return null;
                return (
                  <CommandGroupView key={group} heading={group}>
                    {items.map((command) => (
                      <CommandItem
                        key={command.id}
                        value={`${command.title} ${command.description ?? ""} ${(command.keywords ?? []).join(" ")}`}
                        onSelect={() => run(command.id)}
                      >
                        <span className="min-w-0 flex-1 truncate">{command.title}</span>
                        {command.keybinding ? (
                          <CommandShortcut>
                            {displayKeybinding(command.keybinding, primaryModifier)}
                          </CommandShortcut>
                        ) : null}
                      </CommandItem>
                    ))}
                  </CommandGroupView>
                );
              })
            : null}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

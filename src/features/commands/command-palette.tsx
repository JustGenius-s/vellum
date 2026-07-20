import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  BracketsCurlyIcon,
  CommandIcon,
  DownloadSimpleIcon,
  FileTextIcon,
  FloppyDiskIcon,
  FolderOpenIcon,
  ListBulletsIcon,
  MagnifyingGlassIcon,
  ColumnsIcon,
  SidebarSimpleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";

import { evaluateWhen, displayKeybinding } from "@/application/commands/keybindings";
import type {
  Command as CommandDescriptor,
  CommandGroup,
  CommandIcon as CommandIconName,
} from "@/application/commands/registry";
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
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { flattenFiles } from "@/domain/workspace";

const icons: Record<CommandIconName, ComponentType<{ className?: string }>> = {
  command: CommandIcon,
  compile: BracketsCurlyIcon,
  document: FileTextIcon,
  export: DownloadSimpleIcon,
  folder: FolderOpenIcon,
  outline: ListBulletsIcon,
  panel: ColumnsIcon,
  problems: WarningCircleIcon,
  save: FloppyDiskIcon,
  search: MagnifyingGlassIcon,
  sidebar: SidebarSimpleIcon,
};

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
      description="Search commands and local Typst files"
      className="max-w-2xl border bg-popover shadow-lg"
    >
      <Command className="rounded-xl bg-transparent">
        <CommandInput
          value={paletteQuery}
          onValueChange={setPaletteQuery}
          placeholder={
            paletteMode === "files" ? "Open a document..." : "Run a command or open a file..."
          }
        />
        <CommandList className="max-h-[min(29rem,66dvh)] px-1.5 pb-1.5">
          <CommandEmpty>
            <div className="mx-auto flex max-w-56 flex-col items-center gap-2 py-4 text-muted-foreground">
              <MagnifyingGlassIcon className="size-5" />
              <span>No matching command or document.</span>
            </div>
          </CommandEmpty>

          {files.length ? (
            <CommandGroupView heading={paletteMode === "files" ? "Documents" : "Open document"}>
              {files.map((file) => (
                <CommandItem
                  key={file.path}
                  value={`file ${file.name} ${file.path}`}
                  onSelect={() => openFile(file.path)}
                  className="min-h-10"
                >
                  <FileTextIcon className="text-muted-foreground" />
                  <span className="truncate">{file.name.replace(/\.typ$/i, "")}</span>
                  <span className="ml-auto max-w-52 truncate font-mono text-[10px] text-muted-foreground">
                    {file.path.replace(state.vaultPath, "").replace(/^[/\\]/, "")}
                  </span>
                </CommandItem>
              ))}
            </CommandGroupView>
          ) : null}

          {paletteMode === "commands" && files.length && availableCommands.length ? (
            <CommandSeparator />
          ) : null}

          {paletteMode === "commands"
            ? groupOrder.map((group) => {
                const items = availableCommands.filter((command) => command.group === group);
                if (!items.length) return null;
                return (
                  <CommandGroupView key={group} heading={group}>
                    {items.map((command) => {
                      const Icon = icons[command.icon];
                      return (
                        <CommandItem
                          key={command.id}
                          value={`${command.title} ${command.description ?? ""} ${(command.keywords ?? []).join(" ")}`}
                          onSelect={() => run(command.id)}
                          className="min-h-10"
                        >
                          <Icon className="text-muted-foreground" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{command.title}</span>
                            {command.description ? (
                              <span className="block truncate text-[10px] text-muted-foreground">
                                {command.description}
                              </span>
                            ) : null}
                          </span>
                          {command.keybinding ? (
                            <CommandShortcut>
                              {displayKeybinding(command.keybinding, primaryModifier)}
                            </CommandShortcut>
                          ) : null}
                        </CommandItem>
                      );
                    })}
                  </CommandGroupView>
                );
              })
            : null}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

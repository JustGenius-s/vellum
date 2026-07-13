<script lang="ts">
  import { Command, CornerDownLeft, FileText, Hash, Search } from "lucide-svelte";
  import type { Component } from "svelte";
  import { getVault, getRegistry, getKeybindings, getUI } from "$lib/stores.svelte";
  import type { VaultFileEntry } from "$lib/vault.svelte";

  const vault = getVault();
  const registry = getRegistry();
  const keybindings = getKeybindings();
  const ui = getUI();

  interface FileItem extends VaultFileEntry {
    type: "file";
    score: number;
  }

  interface CommandItem {
    type: "command";
    id: string;
    label: string;
    icon: Component | undefined;
    shortcut: string;
    score: number;
  }

  interface LineItem {
    type: "line";
    line: number;
  }

  type Item = FileItem | CommandItem | LineItem;

  let query = $state("");
  let selectedIndex = $state(0);
  let inputEl = $state<HTMLInputElement>();
  let registryVersion = $state(0);

  function fuzzyScore(value: string, needle: string): number | null {
    if (!needle) return 0;
    const text = value.toLocaleLowerCase();
    const queryText = needle.toLocaleLowerCase();
    const directIndex = text.indexOf(queryText);
    if (directIndex >= 0) {
      return 300 - directIndex * 2 - (text.length - queryText.length) * 0.1;
    }

    let score = 0;
    let cursor = 0;
    let previousIndex = -2;
    for (const character of queryText) {
      const index = text.indexOf(character, cursor);
      if (index < 0) return null;
      if (index === previousIndex + 1) score += 8;
      if (index === 0 || "/\\ _-.".includes(text[index - 1])) score += 5;
      score -= index * 0.15;
      previousIndex = index;
      cursor = index + 1;
    }
    return score;
  }

  $effect(() => {
    return registry.onDidRegisterCommand(() => {
      registryVersion++;
    });
  });

  let mode = $derived(
    query.startsWith(">") ? "commands" : query.startsWith(":") ? "line" : "files",
  );
  let searchText = $derived(
    mode === "files" ? query.trim() : query.slice(1).trim(),
  );

  let fileItems = $derived.by((): FileItem[] => {
    if (mode !== "files") return [];
    if (!searchText) {
      return vault.tabs
        .map((tab) => vault.fileEntries.find((file) => file.path === tab.path))
        .filter((file): file is VaultFileEntry => !!file)
        .map((file) => ({ ...file, type: "file" as const, score: 0 }))
        .slice(0, 10);
    }

    return vault.fileEntries
      .map((file) => ({
        ...file,
        type: "file" as const,
        score: fuzzyScore(file.relativePath, searchText),
      }))
      .filter((file): file is VaultFileEntry & { type: "file"; score: number } =>
        file.score != null
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
  });

  let commandItems = $derived.by((): CommandItem[] => {
    void registryVersion;
    if (mode !== "commands") return [];
    const cmds = registry.getCommands().filter((c) => c.label);
    return cmds
      .map((command) => ({
        type: "command" as const,
        id: command.id,
        label: command.label ?? command.id,
        icon: command.icon as Component | undefined,
        shortcut: keybindings.getKeybindingForCommand(command.id) ?? "",
        score: fuzzyScore(`${command.label ?? ""} ${command.id}`, searchText),
      }))
      .filter((command): command is CommandItem => command.score != null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
  });

  let lineItems = $derived.by((): LineItem[] => {
    if (mode !== "line" || !vault.hasActiveFile || !/^\d+$/.test(searchText)) {
      return [];
    }
    const line = Number(searchText);
    return line > 0 ? [{ type: "line", line }] : [];
  });

  let items = $derived(
    mode === "files"
      ? fileItems
      : mode === "commands"
        ? commandItems
        : lineItems,
  );
  let safeIndex = $derived(Math.min(selectedIndex, Math.max(0, items.length - 1)));
  let placeholder = $derived(
    mode === "commands"
      ? "Search commands"
      : mode === "line"
        ? "Go to line"
        : "Search files by name or path",
  );
  let modeLabel = $derived(
    mode === "commands" ? "Commands" : mode === "line" ? "Line" : "Files",
  );

  function parentDirectory(path: string): string {
    const separatorIndex = path.lastIndexOf("/");
    return separatorIndex < 0 ? "" : path.slice(0, separatorIndex);
  }

  $effect(() => {
    if (ui.paletteOpen) {
      query = ui.paletteQuery;
      selectedIndex = 0;
      setTimeout(() => inputEl?.focus(), 50);
    }
  });

  $effect(() => {
    query;
    selectedIndex = 0;
  });

  async function selectItem(item: Item) {
    ui.paletteOpen = false;
    if (item.type === "file") {
      await vault.openFile(item.path);
    } else if (item.type === "command") {
      await registry.executeCommand(item.id);
    } else {
      ui.currentView = "editor";
      ui.gotoLine = item.line;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (items[safeIndex]) void selectItem(items[safeIndex]);
    } else if (e.key === "Escape") {
      ui.paletteOpen = false;
    }
  }
</script>

{#if ui.paletteOpen}
  <div class="modal modal-open items-start pt-3 sm:pt-[12dvh]" role="dialog" aria-modal="true" aria-label="Quick open">
    <div class="modal-box max-h-[min(34rem,calc(100dvh-1rem))] w-[min(35rem,calc(100vw-1rem))] max-w-none overflow-hidden border border-base-300 p-0">
      <div class="flex h-12 items-center gap-3 border-b border-base-300 px-3">
        {#if mode === "commands"}
          <Command class="ui-icon text-base-content/40" />
        {:else if mode === "line"}
          <Hash class="ui-icon text-base-content/40" />
        {:else}
          <Search class="ui-icon text-base-content/40" />
        {/if}
        <input
          bind:this={inputEl}
          type="text"
          {placeholder}
          bind:value={query}
          onkeydown={handleKeydown}
          class="input input-ghost min-w-0 flex-1 border-0 px-0 text-sm focus:outline-none"
        />
        <span class="ui-caption shrink-0 font-semibold uppercase tracking-wider text-base-content/35">
          {modeLabel}
        </span>
      </div>

      {#if items.length > 0}
        <div
          class="max-h-[min(22rem,60dvh)] overflow-y-auto p-1.5"
          role="listbox"
          aria-label={`${modeLabel} results`}
        >
          {#each items as item, idx}
            <button
              type="button"
              class="ui-interactive flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left {idx === safeIndex ? 'bg-base-200 text-base-content' : 'text-base-content/70'}"
              role="option"
              aria-selected={idx === safeIndex}
              onmouseenter={() => (selectedIndex = idx)}
              onclick={() => void selectItem(item)}
            >
              {#if item.type === "file"}
                <FileText class="ui-icon text-base-content/45" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium">{item.name}</span>
                  {#if parentDirectory(item.relativePath)}
                    <span class="ui-caption mt-0.5 block truncate text-base-content/40">
                      {parentDirectory(item.relativePath)}
                    </span>
                  {/if}
                </span>
              {:else if item.type === "command"}
                {#if item.icon}
                  <item.icon class="ui-icon text-base-content/45" />
                {:else}
                  <Command class="ui-icon text-base-content/45" />
                {/if}
                <span class="min-w-0 flex-1 truncate text-sm">{item.label}</span>
                {#if item.shortcut}
                  <kbd class="kbd kbd-sm shrink-0 text-[10px]">{item.shortcut}</kbd>
                {/if}
              {:else}
                <Hash class="ui-icon text-base-content/45" />
                <span class="min-w-0 flex-1 truncate text-sm">
                  Go to line {item.line}
                </span>
              {/if}
            </button>
          {/each}
        </div>
      {:else}
        <div class="flex min-h-28 items-center justify-center px-8 text-center text-sm text-base-content/40">
          {#if mode === "files" && !vault.vaultPath}
            Open a vault to search files.
          {:else if mode === "files" && !searchText}
            Type to search all files in this vault.
          {:else if mode === "line" && !vault.hasActiveFile}
            Open a document before jumping to a line.
          {:else if mode === "line"}
            Enter a positive line number.
          {:else}
            No results.
          {/if}
        </div>
      {/if}

      <div class="flex h-8 items-center gap-3 border-t border-base-300 px-3 text-[11px] text-base-content/40">
        <span class="min-w-0 flex-1 truncate">
          {#if mode === "files"}
            Type <kbd class="kbd kbd-xs">&gt;</kbd> for commands or
            <kbd class="kbd kbd-xs">:</kbd> for a line
          {:else}
            <kbd class="kbd kbd-xs">Backspace</kbd> to return to files
          {/if}
        </span>
        <span><CornerDownLeft class="ui-icon ui-icon--sm mr-1 inline" />select</span>
        <span class="hidden sm:inline">↑↓ navigate</span>
        <span class="hidden sm:inline">esc close</span>
      </div>
    </div>
    <button
      class="modal-backdrop bg-neutral/35 backdrop-blur-[2px]"
      onclick={() => (ui.paletteOpen = false)}
      aria-label="Close command palette"
    ></button>
  </div>
{/if}
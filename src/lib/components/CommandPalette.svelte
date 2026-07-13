<script lang="ts">
  import { Command, CornerDownLeft, FileText, Hash, Search } from "lucide-svelte";
  import type { Component } from "svelte";
  import { getVault, getRegistry, getKeybindings, getUI } from "$lib/stores.svelte";
  import type { VaultFileEntry } from "$lib/vault.svelte";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import EmptyState from "$lib/components/ui/EmptyState.svelte";
  import IconBadge from "$lib/components/ui/IconBadge.svelte";
  import ListRow from "$lib/components/ui/ListRow.svelte";
  import SegmentedControl, {
    type SegmentOption,
  } from "$lib/components/ui/SegmentedControl.svelte";
  import SharedHighlight from "$lib/components/ui/SharedHighlight.svelte";
  import StatusBadge from "$lib/components/ui/StatusBadge.svelte";
  import TextField from "$lib/components/ui/TextField.svelte";
  import { staggerChildren } from "$lib/motion/actions";

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
  let resultStack = $state<HTMLDivElement>();

  const modeOptions: SegmentOption[] = [
    { value: "files", label: "Files", icon: Search },
    { value: "commands", label: "Commands", icon: Command },
    { value: "line", label: "Line", icon: Hash },
  ];

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

  function switchMode(nextMode: "files" | "commands" | "line") {
    const value = searchText;
    query = nextMode === "commands" ? `>${value}` : nextMode === "line" ? `:${value}` : value;
    setTimeout(() => inputEl?.focus(), 0);
  }

  function itemKey(item: Item): string {
    return item.type === "file"
      ? item.path
      : item.type === "command"
        ? item.id
        : `line-${item.line}`;
  }
</script>

<Dialog
  open={ui.paletteOpen}
  label="Quick open"
  onclose={() => (ui.paletteOpen = false)}
>
    <div class="command-island max-h-[min(40rem,calc(100dvh-1rem))] overflow-hidden">
      <header class="island-header">
        <div class="mb-3 flex items-center justify-between gap-4">
          <span class="ui-kicker">Command island</span>
          <SegmentedControl
            value={mode}
            options={modeOptions}
            label="Palette mode"
            onchange={(value) => switchMode(value as "files" | "commands" | "line")}
          />
        </div>
        <TextField
          bind:input={inputEl}
          bind:value={query}
          size="lg"
          {placeholder}
          label={placeholder}
          controls="command-palette-results"
          activedescendant={items[safeIndex] ? `command-palette-item-${safeIndex}` : undefined}
          autocomplete="off"
          onkeydown={handleKeydown}
        >
          {#snippet leading()}
          <IconBadge size="lg">
            {#if mode === "commands"}
              <Command class="ui-icon ui-icon--lg" />
            {:else if mode === "line"}
              <Hash class="ui-icon ui-icon--lg" />
            {:else}
              <Search class="ui-icon ui-icon--lg" />
            {/if}
          </IconBadge>
          {/snippet}
          {#snippet trailing()}
            <StatusBadge>{modeLabel}</StatusBadge>
          {/snippet}
        </TextField>
      </header>

      {#if items.length > 0}
        <div
          use:staggerChildren={{ dependency: items, limit: 12 }}
          bind:this={resultStack}
          id="command-palette-results"
          class="result-stack relative max-h-[min(26rem,60dvh)] overflow-y-auto px-2 py-3"
          role="listbox"
          aria-label={`${modeLabel} results`}
        >
          <SharedHighlight
            container={resultStack}
            selector='[data-highlight-target="true"]'
            dependency={safeIndex}
            inset={3}
          />
          {#each items as item, idx (itemKey(item))}
            <ListRow
              motionItem
              motionDependency={items}
              highlightTarget={idx === safeIndex}
              selected={idx === safeIndex}
              selectionMode="selected"
              density="relaxed"
              id={`command-palette-item-${idx}`}
              class="command-result gap-3"
              role="option"
              onmouseenter={() => (selectedIndex = idx)}
              onclick={() => void selectItem(item)}
            >
              {#if item.type === "file"}
                <IconBadge muted><FileText class="ui-icon" /></IconBadge>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-semibold tracking-[-0.01em]">{item.name}</span>
                  {#if parentDirectory(item.relativePath)}
                    <span class="ui-text-tertiary mt-1 block truncate text-xs">
                      {parentDirectory(item.relativePath)}
                    </span>
                  {/if}
                </span>
              {:else if item.type === "command"}
                {#if item.icon}
                  <IconBadge muted><item.icon class="ui-icon" /></IconBadge>
                {:else}
                  <IconBadge muted><Command class="ui-icon" /></IconBadge>
                {/if}
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium">{item.label}</span>
                  <span class="ui-text-tertiary mt-1 block truncate text-xs">{item.id}</span>
                </span>
                {#if item.shortcut}
                  <kbd class="shortcut shrink-0">{item.shortcut}</kbd>
                {/if}
              {:else}
                <IconBadge muted><Hash class="ui-icon" /></IconBadge>
                <span class="min-w-0 flex-1 truncate text-sm font-medium">
                  Move cursor to line {item.line}
                </span>
              {/if}
            </ListRow>
          {/each}
        </div>
      {:else}
        <EmptyState
          title={mode === "commands" ? "No commands found" : "No results"}
          description={mode === "files" && !vault.vaultPath
            ? "Open a vault to search files."
            : mode === "files" && !searchText
              ? "Type to search all files in this vault."
              : mode === "line" && !vault.hasActiveFile
                ? "Open a document before jumping to a line."
                : mode === "line"
                  ? "Enter a positive line number."
                  : "Try a different command name."}
        />
      {/if}

      <footer class="island-footer ui-text-tertiary">
        <span class="min-w-0 flex-1 truncate">
          {#if mode === "files"}
            Prefix <kbd>&gt;</kbd> for commands or <kbd>:</kbd> for a line
          {:else}
            Remove the prefix to return to files
          {/if}
        </span>
        <span class="footer-key"><CornerDownLeft class="ui-icon ui-icon--sm" /> select</span>
        <span class="footer-key hidden sm:flex">↑↓ navigate</span>
        <span class="footer-key hidden sm:flex">esc close</span>
      </footer>
    </div>
</Dialog>

<style>
  .command-island {
    border-radius: var(--vellum-radius-floating);
    background:
      radial-gradient(
        circle at 84% 0%,
        color-mix(in oklab, var(--color-primary) 9%, transparent),
        transparent 19rem
      ),
      transparent;
  }

  .island-header {
    padding: 1rem 1rem 0.75rem;
  }

  :global(.command-result) {
    min-height: 3.75rem;
    margin-block: 0.2rem;
    border-radius: 1rem;
    padding: 0.6rem 0.75rem;
    background: transparent;
  }

  :global(.command-result[aria-selected="true"]) {
    background: transparent;
    box-shadow: none;
  }

  .shortcut,
  .island-footer kbd {
    border-radius: var(--vellum-radius-xs);
    background: color-mix(in oklab, var(--color-base-content) 6%, transparent);
    padding: 0.2rem 0.4rem;
    color: color-mix(in oklab, var(--color-base-content) 52%, transparent);
    font-family: var(--vellum-font-mono);
    font-size: 0.625rem;
  }

  .island-footer {
    display: flex;
    min-height: 3rem;
    align-items: center;
    gap: 1rem;
    background:
      linear-gradient(180deg, color-mix(in oklab, var(--vellum-glass-edge) 22%, transparent), transparent 1px),
      color-mix(in oklab, var(--vellum-surface-canvas) 38%, transparent);
    padding-inline: 1rem;
    font-size: 0.6875rem;
  }

  .footer-key {
    flex: none;
    align-items: center;
    gap: 0.25rem;
  }

</style>
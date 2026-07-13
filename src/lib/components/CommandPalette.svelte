<script lang="ts">
  import { Command, CornerDownLeft, FileText, Hash, Search } from "lucide-svelte";
  import type { Component } from "svelte";
  import { getVault, getRegistry, getKeybindings, getUI } from "$lib/stores.svelte";
  import type { VaultFileEntry } from "$lib/vault.svelte";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import EmptyState from "$lib/components/ui/EmptyState.svelte";
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
</script>

<Dialog
  open={ui.paletteOpen}
  label="Quick open"
  onclose={() => (ui.paletteOpen = false)}
>
    <div class="command-island max-h-[min(40rem,calc(100dvh-1rem))] overflow-hidden">
      <header class="island-header">
        <div class="mb-3 flex items-center justify-between gap-4">
          <span class="island-kicker">Command island</span>
          <nav class="mode-track" aria-label="Palette mode">
            <button
              type="button"
              class:active={mode === "files"}
              onclick={() => switchMode("files")}
              aria-pressed={mode === "files"}
            >
              <Search class="ui-icon ui-icon--sm" /> Files
            </button>
            <button
              type="button"
              class:active={mode === "commands"}
              onclick={() => switchMode("commands")}
              aria-pressed={mode === "commands"}
            >
              <Command class="ui-icon ui-icon--sm" /> Commands
            </button>
            <button
              type="button"
              class:active={mode === "line"}
              onclick={() => switchMode("line")}
              aria-pressed={mode === "line"}
            >
              <Hash class="ui-icon ui-icon--sm" /> Line
            </button>
          </nav>
        </div>
        <label class="command-input">
          <span class="mode-glyph" aria-hidden="true">
            {#if mode === "commands"}
              <Command class="ui-icon ui-icon--lg" />
            {:else if mode === "line"}
              <Hash class="ui-icon ui-icon--lg" />
            {:else}
              <Search class="ui-icon ui-icon--lg" />
            {/if}
          </span>
          <input
            bind:this={inputEl}
            type="text"
            {placeholder}
            bind:value={query}
            onkeydown={handleKeydown}
            class="min-w-0 flex-1 bg-transparent px-0 text-base outline-none"
            aria-label={placeholder}
            aria-controls="command-palette-results"
            aria-activedescendant={items[safeIndex] ? `command-palette-item-${safeIndex}` : undefined}
          />
          <span class="mode-label">{modeLabel}</span>
        </label>
      </header>

      {#if items.length > 0}
        <div
          use:staggerChildren
          id="command-palette-results"
          class="result-stack max-h-[min(26rem,60dvh)] overflow-y-auto px-2 py-3"
          role="listbox"
          aria-label={`${modeLabel} results`}
        >
          {#each items as item, idx}
            <button
              data-motion-item
              id={`command-palette-item-${idx}`}
              type="button"
              class="command-result ui-list-row ui-interactive gap-3"
              style={`--item-index: ${idx}`}
              role="option"
              aria-selected={idx === safeIndex}
              onmouseenter={() => (selectedIndex = idx)}
              onclick={() => void selectItem(item)}
            >
              {#if item.type === "file"}
                <span class="result-icon"><FileText class="ui-icon" /></span>
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
                  <span class="result-icon"><item.icon class="ui-icon" /></span>
                {:else}
                  <span class="result-icon"><Command class="ui-icon" /></span>
                {/if}
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium">{item.label}</span>
                  <span class="ui-text-tertiary mt-1 block truncate text-xs">{item.id}</span>
                </span>
                {#if item.shortcut}
                  <kbd class="shortcut shrink-0">{item.shortcut}</kbd>
                {/if}
              {:else}
                <span class="result-icon"><Hash class="ui-icon" /></span>
                <span class="min-w-0 flex-1 truncate text-sm font-medium">
                  Move cursor to line {item.line}
                </span>
              {/if}
            </button>
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
    border-radius: 1.5rem;
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

  .island-kicker {
    color: var(--color-primary);
    font-size: 0.625rem;
    font-weight: 750;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  .mode-track {
    display: flex;
    gap: 0.25rem;
  }

  .mode-track button {
    display: flex;
    min-height: 1.9rem;
    align-items: center;
    gap: 0.3rem;
    border-radius: 999px;
    padding-inline: 0.55rem;
    color: color-mix(in oklab, var(--color-base-content) 42%, transparent);
    font-size: 0.625rem;
    font-weight: 650;
    transition:
      transform var(--vellum-motion-fast) var(--vellum-ease-out),
      opacity var(--vellum-motion-fast) var(--vellum-ease-out),
      background-color var(--vellum-motion-fast) var(--vellum-ease-out);
  }

  .mode-track button:not(.active) {
    opacity: 0.66;
  }

  .mode-track button:hover {
    background: color-mix(in oklab, var(--color-base-content) 5%, transparent);
    opacity: 1;
  }

  .mode-track button:active {
    transform: scale(0.96);
  }

  .mode-track button.active {
    background:
      linear-gradient(180deg, color-mix(in oklab, var(--vellum-glass-edge) 42%, transparent), transparent 1px),
      color-mix(in oklab, var(--color-primary) 11%, transparent);
    color: var(--color-primary);
    opacity: 1;
    box-shadow:
      inset 0 1px 0 color-mix(in oklab, var(--vellum-glass-edge) 52%, transparent),
      inset 0 0 0 1px color-mix(in oklab, var(--color-primary) 14%, transparent);
  }

  .command-input {
    display: flex;
    min-height: 4rem;
    align-items: center;
    gap: 0.875rem;
    border-radius: 1rem;
    background:
      linear-gradient(180deg, color-mix(in oklab, var(--vellum-glass-edge) 48%, transparent), transparent 1px),
      color-mix(in oklab, var(--vellum-surface-canvas) 78%, transparent);
    padding: 0.6rem 0.75rem;
    box-shadow:
      inset 0 1px 0 color-mix(in oklab, var(--vellum-glass-edge) 58%, transparent),
      inset 0 0 0 1px var(--vellum-glass-rim),
      0 8px 24px -18px color-mix(in oklab, var(--color-neutral) 28%, transparent);
    transition:
      background-color var(--vellum-motion-fast) var(--vellum-ease-out),
      box-shadow var(--vellum-motion-fast) var(--vellum-ease-out);
  }

  .command-input:focus-within {
    background: color-mix(in oklab, var(--vellum-surface-canvas) 86%, transparent);
    box-shadow:
      inset 0 0 0 1px color-mix(in oklab, var(--color-primary) 32%, transparent),
      0 10px 28px color-mix(in oklab, var(--vellum-surface-app) 24%, transparent);
  }

  .mode-glyph {
    display: grid;
    width: 2.5rem;
    height: 2.5rem;
    flex: none;
    place-items: center;
    border-radius: 0.75rem;
    background: color-mix(in oklab, var(--color-primary) 10%, transparent);
    color: var(--color-primary);
  }

  .mode-label {
    flex: none;
    border-radius: 999px;
    background: color-mix(in oklab, var(--color-primary) 8%, transparent);
    padding: 0.25rem 0.5rem;
    color: var(--color-primary);
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .result-stack {
    scrollbar-gutter: stable;
  }

  .command-result {
    min-height: 3.75rem;
    margin-block: 0.2rem;
    border-radius: 1rem;
    padding: 0.6rem 0.75rem;
    animation: result-enter 260ms var(--vellum-ease-out) both;
    animation-delay: calc(var(--item-index) * 22ms);
    transition:
      background-color var(--vellum-motion-fast) var(--vellum-ease-out),
      transform var(--vellum-motion-fast) var(--vellum-ease-out),
      box-shadow var(--vellum-motion-fast) var(--vellum-ease-out);
  }

  .command-result:hover {
    background: color-mix(in oklab, var(--color-base-content) 4%, transparent);
    transform: translateX(2px);
  }

  .command-result[aria-selected="true"] {
    background:
      linear-gradient(90deg, color-mix(in oklab, var(--color-primary) 12%, transparent), transparent 72%),
      color-mix(in oklab, var(--color-base-content) 4%, transparent);
    box-shadow: inset 0 1px 0 color-mix(in oklab, white 4%, transparent);
  }

  .result-icon {
    display: grid;
    width: 2.25rem;
    height: 2.25rem;
    flex: none;
    place-items: center;
    border-radius: 0.7rem;
    background: color-mix(in oklab, var(--color-base-content) 3%, transparent);
    color: color-mix(in oklab, var(--color-base-content) 48%, transparent);
  }

  .command-result[aria-selected="true"] .result-icon {
    background: color-mix(in oklab, var(--color-primary) 11%, transparent);
    color: var(--color-primary);
  }

  .shortcut,
  .island-footer kbd {
    border-radius: 0.45rem;
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
    background: color-mix(in oklab, var(--vellum-surface-canvas) 32%, transparent);
    padding-inline: 1rem;
    font-size: 0.6875rem;
  }

  .footer-key {
    flex: none;
    align-items: center;
    gap: 0.25rem;
  }

  @keyframes result-enter {
    from {
      opacity: 0;
      transform: translateY(6px) scale(0.99);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @media (max-width: 560px) {
    .mode-track button {
      width: 1.9rem;
      justify-content: center;
      overflow: hidden;
      padding: 0;
      color: transparent;
      font-size: 0;
    }

    .mode-track button :global(svg) {
      color: currentColor;
    }

    .mode-track button.active {
      color: var(--color-primary);
    }

    .mode-label {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .command-result {
      animation: none;
      transition: none;
    }

    .command-result:hover {
      transform: none;
    }
  }
</style>
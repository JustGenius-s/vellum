<script lang="ts">
  import { Search, FileText, CornerDownLeft } from "lucide-svelte";
  import type { Component } from "svelte";
  import { getVault, getRegistry, getKeybindings, getUI } from "$lib/stores.svelte";

  const vault = getVault();
  const registry = getRegistry();
  const keybindings = getKeybindings();
  const ui = getUI();

  interface FileItem {
    type: "file";
    stem: string;
  }

  interface CommandItem {
    type: "command";
    id: string;
    label: string;
    icon: Component | undefined;
    shortcut: string;
  }

  type Item = FileItem | CommandItem;

  let query = $state("");
  let selectedIndex = $state(0);
  let inputEl = $state<HTMLInputElement>();
  let registryVersion = $state(0);

  $effect(() => {
    return registry.onDidRegisterCommand(() => {
      registryVersion++;
    });
  });

  let fileItems = $derived.by(() => {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    return vault.fileNames
      .filter((s) => s.toLowerCase().includes(q))
      .slice(0, 8)
      .map((stem) => ({ type: "file" as const, stem }));
  });

  let commandItems = $derived.by((): CommandItem[] => {
    void registryVersion;
    const q = query.toLowerCase().trim();
    const cmds = registry.getCommands().filter((c) => c.label);
    const filtered = q ? cmds.filter((c) => (c.label ?? "").toLowerCase().includes(q)) : cmds;
    return filtered.map((c) => ({
      type: "command" as const,
      id: c.id,
      label: c.label ?? c.id,
      icon: c.icon as Component | undefined,
      shortcut: keybindings.getKeybindingForCommand(c.id) ?? "",
    }));
  });

  let items = $derived([...fileItems, ...commandItems] as Item[]);
  let safeIndex = $derived(Math.min(selectedIndex, Math.max(0, items.length - 1)));

  $effect(() => {
    if (ui.paletteOpen) {
      query = "";
      selectedIndex = 0;
      setTimeout(() => inputEl?.focus(), 50);
    }
  });

  function selectItem(item: Item) {
    if (item.type === "file") {
      vault.openByStem(item.stem);
    } else {
      registry.executeCommand(item.id);
    }
    ui.paletteOpen = false;
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
      if (items[safeIndex]) selectItem(items[safeIndex]);
    } else if (e.key === "Escape") {
      ui.paletteOpen = false;
    }
  }
</script>

{#if ui.paletteOpen}
  <div class="modal modal-open items-start pt-[15dvh]" role="dialog" aria-modal="true">
    <div class="modal-box w-[min(32rem,calc(100vw-1.5rem))] max-w-none overflow-hidden border border-base-300 p-0">
      <div class="flex items-center gap-2 border-b border-base-300 px-4 py-3">
        <Search class="ui-icon text-base-content/40" />
        <input
          bind:this={inputEl}
          type="text"
          placeholder="Search files or commands..."
          bind:value={query}
          onkeydown={handleKeydown}
          class="input input-ghost input-sm min-w-0 flex-1 border-0 px-0 focus:outline-none"
        />
      </div>

      {#if items.length > 0}
        <ul class="menu menu-sm max-h-72 flex-nowrap overflow-auto p-1.5">
          {#each items as item, idx}
            <li>
              <button
                class:menu-active={idx === safeIndex}
                onmouseenter={() => (selectedIndex = idx)}
                onclick={() => selectItem(item)}
              >
                {#if item.type === "file"}
                  <FileText class="ui-icon text-base-content/50" />
                  <span>{item.stem}.typ</span>
                {:else}
                  {#if item.icon}
                    <item.icon class="ui-icon text-base-content/50" />
                  {:else}
                    <FileText class="ui-icon text-base-content/50" />
                  {/if}
                  <span class="flex-1">{item.label}</span>
                  {#if item.shortcut}
                    <kbd class="kbd kbd-sm text-[10px]">{item.shortcut}</kbd>
                  {/if}
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      {:else if query}
        <div class="p-6 text-sm text-base-content/40 text-center">No results</div>
      {/if}

      <div class="border-t border-base-300 px-4 py-2 flex gap-4 text-[11px] text-base-content/40">
        <span><CornerDownLeft class="ui-icon ui-icon--sm mr-1 inline" />select</span>
        <span>↑↓ navigate</span>
        <span>esc close</span>
      </div>
    </div>
    <button
      class="modal-backdrop bg-neutral/35 backdrop-blur-[2px]"
      onclick={() => (ui.paletteOpen = false)}
      aria-label="Close command palette"
    ></button>
  </div>
{/if}
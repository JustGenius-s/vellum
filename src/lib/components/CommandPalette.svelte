<script lang="ts">
  import { Search, FileText, CornerDownLeft } from "lucide-svelte";
  import type { Component } from "svelte";
  import type { CommandRegistry } from "$lib/commands/registry";
  import type { KeybindingManager } from "$lib/commands/keybinding";
  import type { Vault } from "$lib/vault.svelte";

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

  let {
    open = false,
    onClose = () => {},
    vault,
    registry,
    keybindings,
  }: {
    open: boolean;
    onClose: () => void;
    vault: Vault;
    registry: CommandRegistry;
    keybindings: KeybindingManager;
  } = $props();

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

  $effect(() => {
    if (open) {
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
    onClose();
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
      if (items[selectedIndex]) selectItem(items[selectedIndex]);
    } else if (e.key === "Escape") {
      onClose();
    }
  }
</script>

{#if open}
  <div class="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" role="dialog" aria-modal="true">
    <button class="fixed inset-0 bg-black/30" onclick={onClose} aria-label="Close"></button>

    <div class="relative z-10 w-[520px] max-w-[95vw] rounded-xl border border-base-300 bg-base-100 shadow-2xl overflow-hidden">
      <div class="flex items-center gap-2 border-b border-base-300 px-4 py-3">
        <Search size={16} class="text-base-content/40 shrink-0" />
        <input
          bind:this={inputEl}
          type="text"
          placeholder="Search files or commands..."
          bind:value={query}
          onkeydown={handleKeydown}
          class="flex-1 bg-transparent outline-none text-sm placeholder-base-content/40"
        />
      </div>

      {#if items.length > 0}
        <div class="max-h-72 overflow-auto p-1">
          {#each items as item, idx}
            <button
              class="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm text-left transition-colors {idx === selectedIndex ? 'bg-base-200' : 'hover:bg-base-200'}"
              onmouseenter={() => (selectedIndex = idx)}
              onclick={() => selectItem(item)}
            >
              {#if item.type === "file"}
                <FileText size={16} class="text-base-content/50 shrink-0" />
                <span>{item.stem}.typ</span>
              {:else}
                {#if item.icon}
                  <item.icon size={16} class="text-base-content/50 shrink-0" />
                {:else}
                  <FileText size={16} class="text-base-content/50 shrink-0" />
                {/if}
                <span class="flex-1">{item.label}</span>
                {#if item.shortcut}
                  <kbd class="text-[11px] text-base-content/30">{item.shortcut}</kbd>
                {/if}
              {/if}
            </button>
          {/each}
        </div>
      {:else if query}
        <div class="p-6 text-sm text-base-content/40 text-center">No results</div>
      {/if}

      <div class="border-t border-base-300 px-4 py-2 flex gap-4 text-[11px] text-base-content/40">
        <span><CornerDownLeft size={12} class="inline mr-1" />select</span>
        <span>↑↓ navigate</span>
        <span>esc close</span>
      </div>
    </div>
  </div>
{/if}

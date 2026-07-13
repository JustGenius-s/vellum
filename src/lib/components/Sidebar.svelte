<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { slide } from "svelte/transition";
  import {
    ChevronDown,
    ChevronRight,
    CircleAlert,
    FilePlus,
    FileText,
    FolderOpen,
    FolderPlus,
    Pencil,
    Plus,
    Trash2,
    X,
  } from "lucide-svelte";
  import { getVault, type TreeNode } from "$lib/stores.svelte";
  import EmptyState from "$lib/components/ui/EmptyState.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import IconButton from "$lib/components/ui/IconButton.svelte";

  const vault = getVault();

  let expanded = $state<Set<string>>(new Set());
  let contextMenu = $state<{ x: number; y: number; node: TreeNode | null } | null>(null);
  let renaming = $state<string | null>(null);
  let renameValue = $state("");
  let creating = $state<{ parent: string; isDir: boolean } | null>(null);
  let createValue = $state("");
  let operationError = $state("");

  let vaultName = $derived(
    vault.vaultPath.split(/[/\\]/).filter(Boolean).at(-1) || "No vault",
  );

  function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }

  function parentPath(path: string) {
    const separatorIndex = Math.max(
      path.lastIndexOf("/"),
      path.lastIndexOf("\\"),
    );
    return separatorIndex < 0 ? "" : path.slice(0, separatorIndex);
  }

  function joinPath(parent: string, name: string) {
    const separator = parent.includes("\\") ? "\\" : "/";
    return parent.endsWith(separator)
      ? `${parent}${name}`
      : `${parent}${separator}${name}`;
  }

  function toggle(path: string) {
    if (expanded.has(path)) expanded.delete(path);
    else expanded.add(path);
    expanded = new Set(expanded);
  }

  function onContextMenu(e: MouseEvent, node: TreeNode | null) {
    e.preventDefault();
    e.stopPropagation();
    contextMenu = { x: e.clientX, y: e.clientY, node };
  }

  function openCreateMenu(event: MouseEvent) {
    event.stopPropagation();
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    contextMenu = {
      x: Math.max(8, bounds.right - 160),
      y: bounds.bottom + 4,
      node: null,
    };
  }

  function closeContextMenu() {
    contextMenu = null;
  }

  function startRename(node: TreeNode) {
    operationError = "";
    renaming = node.path;
    renameValue = node.name;
    contextMenu = null;
  }

  async function confirmRename() {
    if (!renaming || !renameValue.trim()) {
      renaming = null;
      return;
    }
    const oldPath = renaming;
    const newPath = joinPath(parentPath(oldPath), renameValue.trim());
    if (oldPath !== newPath) {
      try {
        await vault.renamePath(oldPath, newPath);
      } catch (e) {
        operationError = errorMessage(e);
      }
    }
    renaming = null;
  }

  async function confirmDelete(node: TreeNode) {
    contextMenu = null;
    if (!confirm(`Delete "${node.name}"?`)) return;
    try {
      await vault.deletePath(node.path);
    } catch (e) {
      operationError = errorMessage(e);
    }
  }

  function startCreate(parent: string, isDir: boolean) {
    operationError = "";
    creating = { parent, isDir };
    createValue = "";
    contextMenu = null;
    if (parent && !expanded.has(parent)) {
      expanded.add(parent);
      expanded = new Set(expanded);
    }
  }

  async function confirmCreate() {
    if (!creating || !createValue.trim()) {
      creating = null;
      return;
    }
    const name = createValue.trim();
    const entryName =
      creating.isDir || name.endsWith(".typ") ? name : `${name}.typ`;
    const fullPath = joinPath(creating.parent, entryName);
    try {
      await invoke("create_file", { path: fullPath, vaultPath: vault.vaultPath, isDir: creating.isDir });
      await vault.refreshFiles();
      if (!creating.isDir) {
        await vault.openFile(fullPath);
      }
    } catch (e) {
      operationError = errorMessage(e);
    }
    creating = null;
  }
</script>

<svelte:window onclick={() => { if (contextMenu) closeContextMenu(); }} />

<div
  class="navigator-shell ui-surface-chrome flex h-full flex-col"
  role="tree"
  tabindex="0"
  aria-label="Vault files"
  oncontextmenu={(e) => onContextMenu(e, null)}
>
  <div class="navigator-header">
    <button
      class="vault-identity ui-glass-hover ui-interactive min-w-0 flex-1"
      onclick={() => vault.openVault()}
      title={vault.vaultPath || "Open vault"}
    >
      <span class="vault-mark ui-glass-accent" aria-hidden="true">
        <FolderOpen class="ui-icon" />
      </span>
      <span class="min-w-0 text-left">
        <span class="navigator-kicker">Workspace</span>
        <span class="block truncate text-sm font-semibold tracking-[-0.01em]">{vaultName}</span>
      </span>
    </button>
    {#if vault.vaultPath}
      <IconButton
        label="Create file or folder"
        title="Create"
        compact
        onclick={openCreateMenu}
      >
        <Plus class="ui-icon ui-icon--sm" />
      </IconButton>
    {/if}
  </div>

  {#if operationError}
    <div
      class="operation-error ui-caption m-2 grid grid-cols-[auto_1fr_auto] items-start gap-2 p-2 leading-4"
      transition:slide={{ duration: 160 }}
    >
      <CircleAlert class="ui-icon ui-icon--sm mt-px" />
      <span class="min-w-0 flex-1 wrap-break-word">{operationError}</span>
      <IconButton
        label="Dismiss error"
        compact
        onclick={() => (operationError = "")}
      >
        <X class="ui-icon ui-icon--sm" />
      </IconButton>
    </div>
  {/if}

  <div class="navigator-track min-h-0 flex-1 overflow-y-auto px-2 py-3">
    {#if !vault.vaultPath}
      <EmptyState
        title="Open a vault"
        description="Choose a folder containing your Typst documents."
      >
        {#snippet action()}
        <Button variant="primary" size="sm" onclick={() => vault.openVault()}>
          Choose folder
        </Button>
        {/snippet}
      </EmptyState>
    {:else}
      {#if creating?.parent === vault.vaultPath}
        <div class="create-row flex items-center gap-2 px-3 py-2">
          {#if creating.isDir}
            <FolderPlus class="ui-icon ui-icon--sm ui-text-tertiary" />
          {:else}
            <FilePlus class="ui-icon ui-icon--sm ui-text-tertiary" />
          {/if}
          <input
            type="text"
            bind:value={createValue}
            class="inline-input ui-glass-control min-w-0 flex-1"
            placeholder={creating.isDir ? "folder name" : "note.typ"}
            aria-label={creating.isDir ? "Folder name" : "File name"}
            onkeydown={(e) => { if (e.key === 'Enter') confirmCreate(); if (e.key === 'Escape') creating = null; }}
            onchange={confirmCreate}
          />
        </div>
      {/if}
      {#each vault.files as node}
        {@render renderNode(node, 0)}
      {:else}
        <EmptyState
          title="This vault is empty"
          description="Create a file to begin."
        />
      {/each}
    {/if}
  </div>
</div>

{#snippet renderNode(node: TreeNode, depth: number)}
  <div class="tree-branch" style="padding-left: {depth * 14}px">
    {#if renaming === node.path}
      <div class="create-row flex items-center gap-2 px-3 py-1.5">
        {#if node.is_dir}
          <FolderOpen class="ui-icon ui-icon--sm ui-text-tertiary" />
        {:else}
          <FileText class="ui-icon ui-icon--sm ui-text-tertiary" />
        {/if}
        <input
          type="text"
          bind:value={renameValue}
          class="inline-input ui-glass-control min-w-0 flex-1"
          aria-label="New name"
          onkeydown={(e) => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') renaming = null; }}
          onchange={confirmRename}
        />
      </div>
    {:else if node.is_dir}
      <button
        type="button"
        class="tree-row ui-list-row ui-interactive ui-touch-target font-medium"
        onclick={() => toggle(node.path)}
        oncontextmenu={(e) => onContextMenu(e, node)}
        aria-expanded={expanded.has(node.path)}
      >
        {#if expanded.has(node.path)}
          <ChevronDown class="ui-icon ui-icon--sm ui-text-tertiary" />
        {:else}
          <ChevronRight class="ui-icon ui-icon--sm ui-text-tertiary" />
        {/if}
        <FolderOpen class="ui-icon ui-text-tertiary" />
        <span class="truncate">{node.name}</span>
      </button>
      {#if expanded.has(node.path)}
        <div transition:slide={{ duration: 150 }}>
          {#if creating?.parent === node.path}
            <div class="create-row flex items-center gap-2 px-3 py-1.5" style="padding-left: {(depth + 1) * 14}px">
              {#if creating.isDir}
                <FolderPlus class="ui-icon ui-icon--sm ui-text-tertiary" />
              {:else}
                <FilePlus class="ui-icon ui-icon--sm ui-text-tertiary" />
              {/if}
              <input
                type="text"
                bind:value={createValue}
                class="inline-input ui-glass-control flex-1"
                placeholder={creating.isDir ? "folder name" : "note.typ"}
                onkeydown={(e) => { if (e.key === 'Enter') confirmCreate(); if (e.key === 'Escape') creating = null; }}
                onchange={confirmCreate}
              />
            </div>
          {/if}
          {#each node.children as child}
            {@render renderNode(child, depth + 1)}
          {/each}
        </div>
      {/if}
    {:else}
      <button
        type="button"
        class="tree-row ui-list-row ui-interactive ui-touch-target"
        onclick={() => vault.openFile(node.path)}
        oncontextmenu={(e) => onContextMenu(e, node)}
        aria-current={node.path === vault.activeTabPath ? "page" : undefined}
      >
        <span class="w-3.5 shrink-0"></span>
        <FileText class="ui-icon ui-text-tertiary" />
        <span class="truncate">{node.name}</span>
      </button>
    {/if}
  </div>
{/snippet}

{#if contextMenu}
  <ul
    class="context-island ui-glass-floating fixed z-50 min-w-44 rounded-2xl p-2"
    style="left: min({contextMenu.x}px, calc(100vw - 11rem)); top: min({contextMenu.y}px, calc(100vh - 12rem))"
    role="menu"
    tabindex="-1"
    oncontextmenu={(e) => e.preventDefault()}
  >
    {#if contextMenu.node?.is_dir}
      <li>
        <button role="menuitem" onclick={() => startCreate(contextMenu!.node!.path, false)}>
          <FilePlus class="ui-icon ui-icon--sm" /> New File
        </button>
      </li>
      <li>
        <button role="menuitem" onclick={() => startCreate(contextMenu!.node!.path, true)}>
          <FolderPlus class="ui-icon ui-icon--sm" /> New Folder
        </button>
      </li>
    {/if}
    {#if contextMenu.node}
      <li>
        <button role="menuitem" onclick={() => startRename(contextMenu!.node!)}>
          <Pencil class="ui-icon ui-icon--sm" /> Rename
        </button>
      </li>
      <li>
        <button class="text-error" role="menuitem" onclick={() => confirmDelete(contextMenu!.node!)}>
          <Trash2 class="ui-icon ui-icon--sm" /> Delete
        </button>
      </li>
    {:else}
      <li>
        <button role="menuitem" onclick={() => startCreate(vault.vaultPath, false)}>
          <FilePlus class="ui-icon ui-icon--sm" /> New File
        </button>
      </li>
      <li>
        <button role="menuitem" onclick={() => startCreate(vault.vaultPath, true)}>
          <FolderPlus class="ui-icon ui-icon--sm" /> New Folder
        </button>
      </li>
    {/if}
  </ul>
{/if}

<style>
  .navigator-shell {
    background:
      linear-gradient(
        145deg,
        color-mix(in oklab, var(--vellum-glass-specular) 20%, transparent),
        transparent 26%
      ),
      radial-gradient(
        circle at 20% 0,
        color-mix(in oklab, var(--color-primary) 8%, transparent),
        transparent 13rem
      );
  }

  .navigator-header {
    display: flex;
    min-height: 4.5rem;
    align-items: center;
    gap: 0.375rem;
    padding: 0.625rem 0.75rem;
  }

  .vault-identity {
    display: flex;
    min-height: 3.125rem;
    align-items: center;
    gap: 0.6875rem;
    border-radius: 0.875rem;
    padding: 0.375rem 0.5rem;
  }

  .vault-mark {
    display: grid;
    width: 2.125rem;
    height: 2.125rem;
    flex: none;
    place-items: center;
    border-radius: 0.7rem;
    color: color-mix(in oklab, var(--color-primary) 88%, var(--color-base-content));
  }

  .navigator-kicker {
    display: block;
    margin-bottom: 0.2rem;
    color: color-mix(in oklab, var(--color-base-content) 42%, transparent);
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.16em;
    line-height: 1;
    text-transform: uppercase;
  }

  .navigator-track {
    mask-image: linear-gradient(to bottom, black calc(100% - 1rem), transparent);
  }

  .tree-branch {
    position: relative;
  }

  .tree-row {
    min-height: 2.5rem;
    gap: 0.5625rem;
    margin-block: 0.0625rem;
    padding-inline: 0.6875rem;
    font-size: 0.8125rem;
  }

  .tree-row:hover :global(.ui-text-tertiary) {
    color: color-mix(in oklab, var(--color-base-content) 64%, transparent);
  }

  .tree-row[aria-current="page"] {
    background:
      linear-gradient(180deg, color-mix(in oklab, var(--vellum-glass-specular) 24%, transparent), transparent 1px),
      color-mix(in oklab, var(--color-primary) 12%, transparent);
    color: color-mix(in oklab, var(--color-primary) 82%, var(--color-base-content));
    font-weight: 560;
    box-shadow:
      inset 0 1px 0 color-mix(in oklab, var(--vellum-glass-edge) 40%, transparent),
      inset 0 0 0 1px color-mix(in oklab, var(--color-primary) 10%, transparent);
  }

  .tree-row[aria-current="page"] :global(.ui-text-tertiary) {
    color: var(--color-primary);
  }

  .create-row {
    border-radius: 0.75rem;
    background:
      linear-gradient(180deg, color-mix(in oklab, var(--vellum-glass-edge) 24%, transparent), transparent 1px),
      color-mix(in oklab, var(--color-primary) 7%, transparent);
  }

  .inline-input {
    min-height: 2.25rem;
    border: 0;
    border-radius: 0.65rem;
    outline: 0;
    color: var(--color-base-content);
    padding-inline: 0.65rem;
    font: inherit;
    font-size: var(--vellum-text-ui);
  }

  .inline-input:focus {
    box-shadow:
      inset 0 1px 0 color-mix(in oklab, var(--vellum-glass-edge) 54%, transparent),
      inset 0 0 0 1px color-mix(in oklab, var(--color-primary) 58%, transparent);
  }

  .operation-error {
    border-radius: 0.75rem;
    color: var(--color-error);
    background: color-mix(in oklab, var(--color-error) 10%, transparent);
  }

  .context-island {
    border: 0;
  }

  .context-island :global(button) {
    display: flex;
    width: 100%;
    min-height: 2.5rem;
    align-items: center;
    border: 0;
    border-radius: 0.7rem;
    gap: 0.625rem;
    color: var(--color-base-content);
    background: transparent;
    padding-inline: 0.75rem;
    font: inherit;
    font-size: 0.8125rem;
    text-align: left;
  }

  .context-island :global(button:hover) {
    background: color-mix(in oklab, var(--color-base-content) 7%, transparent);
  }

  .context-island :global(button.text-error:hover) {
    background: color-mix(in oklab, var(--color-error) 9%, transparent);
  }
</style>
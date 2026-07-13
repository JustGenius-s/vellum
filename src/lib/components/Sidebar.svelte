<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
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
  import ContextMenu from "$lib/components/ui/ContextMenu.svelte";
  import IconBadge from "$lib/components/ui/IconBadge.svelte";
  import IconButton from "$lib/components/ui/IconButton.svelte";
  import ListRow from "$lib/components/ui/ListRow.svelte";
  import MenuItem from "$lib/components/ui/MenuItem.svelte";
  import SharedHighlight from "$lib/components/ui/SharedHighlight.svelte";
  import TextField from "$lib/components/ui/TextField.svelte";
  import { expandEnter, surfaceEnter } from "$lib/motion/actions";

  const vault = getVault();

  let expanded = $state<Set<string>>(new Set());
  let contextMenu = $state<{ x: number; y: number; node: TreeNode | null } | null>(null);
  let renaming = $state<string | null>(null);
  let renameValue = $state("");
  let creating = $state<{ parent: string; isDir: boolean } | null>(null);
  let createValue = $state("");
  let operationError = $state("");
  let treeTrack = $state<HTMLDivElement>();

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

<div
  class="navigator-shell ui-surface-chrome ui-surface-chrome--tinted flex h-full flex-col"
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
      <IconBadge>
        <FolderOpen class="ui-icon" />
      </IconBadge>
      <span class="min-w-0 text-left">
        <span class="ui-kicker mb-1 block">Workspace</span>
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
      use:surfaceEnter={{ y: -4, scale: 0.995 }}
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

  <div bind:this={treeTrack} class="navigator-track relative min-h-0 flex-1 overflow-y-auto px-2 py-3">
    <SharedHighlight
      container={treeTrack}
      selector='[data-highlight-target="true"]'
      dependency={vault.activeTabPath}
      inset={1}
    />
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
          <TextField
            bind:value={createValue}
            size="sm"
            placeholder={creating.isDir ? "folder name" : "note.typ"}
            label={creating.isDir ? "Folder name" : "File name"}
            onkeydown={(e) => { if (e.key === 'Enter') confirmCreate(); if (e.key === 'Escape') creating = null; }}
            onblur={confirmCreate}
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
        <TextField
          bind:value={renameValue}
          size="sm"
          label="New name"
          onkeydown={(e) => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') renaming = null; }}
          onblur={confirmRename}
        />
      </div>
    {:else if node.is_dir}
      <ListRow
        class="tree-row ui-touch-target font-medium"
        role="treeitem"
        ariaLevel={depth + 1}
        ariaExpanded={expanded.has(node.path)}
        density="relaxed"
        onclick={() => toggle(node.path)}
        oncontextmenu={(e) => onContextMenu(e, node)}
      >
        <span class="tree-chevron" class:tree-chevron--open={expanded.has(node.path)}>
          <ChevronRight class="ui-icon ui-icon--sm ui-text-tertiary" />
        </span>
        <FolderOpen class="ui-icon ui-text-tertiary" />
        <span class="truncate">{node.name}</span>
      </ListRow>
      {#if expanded.has(node.path)}
        <div use:expandEnter>
          {#if creating?.parent === node.path}
            <div class="create-row flex items-center gap-2 px-3 py-1.5" style="padding-left: {(depth + 1) * 14}px">
              {#if creating.isDir}
                <FolderPlus class="ui-icon ui-icon--sm ui-text-tertiary" />
              {:else}
                <FilePlus class="ui-icon ui-icon--sm ui-text-tertiary" />
              {/if}
              <TextField
                bind:value={createValue}
                size="sm"
                placeholder={creating.isDir ? "folder name" : "note.typ"}
                label={creating.isDir ? "Folder name" : "File name"}
                onkeydown={(e) => { if (e.key === 'Enter') confirmCreate(); if (e.key === 'Escape') creating = null; }}
                onblur={confirmCreate}
              />
            </div>
          {/if}
          {#each node.children as child}
            {@render renderNode(child, depth + 1)}
          {/each}
        </div>
      {/if}
    {:else}
      <ListRow
        class="tree-row ui-touch-target"
        selected={node.path === vault.activeTabPath}
        highlightTarget={node.path === vault.activeTabPath}
        role="treeitem"
        ariaLevel={depth + 1}
        density="relaxed"
        onclick={() => vault.openFile(node.path)}
        oncontextmenu={(e) => onContextMenu(e, node)}
      >
        <span class="w-3.5 shrink-0"></span>
        <FileText class="ui-icon ui-text-tertiary" />
        <span class="truncate">{node.name}</span>
      </ListRow>
    {/if}
  </div>
{/snippet}

<ContextMenu
  open={contextMenu != null}
  x={contextMenu?.x ?? 0}
  y={contextMenu?.y ?? 0}
  label="File actions"
  onclose={closeContextMenu}
>
    {#if contextMenu?.node?.is_dir}
        <MenuItem onclick={() => startCreate(contextMenu!.node!.path, false)}>
          {#snippet leading()}
          <FilePlus class="ui-icon ui-icon--sm" />
          {/snippet}
          New File
        </MenuItem>
        <MenuItem onclick={() => startCreate(contextMenu!.node!.path, true)}>
          {#snippet leading()}
          <FolderPlus class="ui-icon ui-icon--sm" />
          {/snippet}
          New Folder
        </MenuItem>
    {/if}
    {#if contextMenu?.node}
        <MenuItem onclick={() => startRename(contextMenu!.node!)}>
          {#snippet leading()}<Pencil class="ui-icon ui-icon--sm" />{/snippet}
          Rename
        </MenuItem>
        <MenuItem variant="danger" onclick={() => confirmDelete(contextMenu!.node!)}>
          {#snippet leading()}<Trash2 class="ui-icon ui-icon--sm" />{/snippet}
          Delete
        </MenuItem>
    {:else}
        <MenuItem onclick={() => startCreate(vault.vaultPath, false)}>
          {#snippet leading()}<FilePlus class="ui-icon ui-icon--sm" />{/snippet}
          New File
        </MenuItem>
        <MenuItem onclick={() => startCreate(vault.vaultPath, true)}>
          {#snippet leading()}<FolderPlus class="ui-icon ui-icon--sm" />{/snippet}
          New Folder
        </MenuItem>
    {/if}
</ContextMenu>

<style>
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
    border-radius: var(--vellum-radius-md);
    padding: 0.375rem 0.5rem;
  }

  .navigator-track {
    mask-image: linear-gradient(to bottom, black calc(100% - 1rem), transparent);
  }

  .tree-branch {
    position: relative;
  }

  :global(.tree-row) {
    min-height: 2.5rem;
    gap: 0.5625rem;
    margin-block: 0.0625rem;
    padding-inline: 0.6875rem;
    font-size: 0.8125rem;
  }

  :global(.tree-row:hover .ui-text-tertiary) {
    color: color-mix(in oklab, var(--color-base-content) 64%, transparent);
  }

  :global(.tree-row[aria-current="page"]) {
    background: transparent;
    color: color-mix(in oklab, var(--color-primary) 82%, var(--color-base-content));
    box-shadow: none;
    font-weight: 560;
  }

  :global(.tree-row[aria-current="page"] .ui-text-tertiary) {
    color: var(--color-primary);
  }

  .create-row {
    border-radius: var(--vellum-radius-control);
    background:
      linear-gradient(180deg, color-mix(in oklab, var(--vellum-glass-edge) 24%, transparent), transparent 1px),
      color-mix(in oklab, var(--color-primary) 7%, transparent);
  }

  .operation-error {
    border-radius: var(--vellum-radius-control);
    color: var(--color-error);
    background: color-mix(in oklab, var(--color-error) 10%, transparent);
  }

  .tree-chevron {
    display: inline-flex;
    transition: transform var(--vellum-motion-fast) var(--vellum-ease-out);
  }

  .tree-chevron--open {
    transform: rotate(90deg);
  }
</style>
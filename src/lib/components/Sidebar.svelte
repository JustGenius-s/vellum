<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { scale, slide } from "svelte/transition";
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
  class="flex h-full flex-col bg-base-200/35"
  role="tree"
  tabindex="0"
  aria-label="Vault files"
  oncontextmenu={(e) => onContextMenu(e, null)}
>
  <div class="ui-panel-header gap-1 px-2">
    <button
      class="btn btn-ghost h-8 min-h-8 min-w-0 flex-1 justify-start gap-2 px-2 text-xs"
      onclick={() => vault.openVault()}
      title={vault.vaultPath || "Open vault"}
    >
      <FolderOpen class="ui-icon text-primary" />
      <span class="truncate text-xs font-medium">{vaultName}</span>
    </button>
    {#if vault.vaultPath}
      <button
        class="btn btn-ghost ui-icon-button ui-icon-button--compact ui-interactive"
        onclick={openCreateMenu}
        aria-label="Create file or folder"
        title="Create"
      >
        <Plus class="ui-icon ui-icon--sm" />
      </button>
    {/if}
  </div>

  {#if operationError}
    <div
      class="alert alert-error alert-soft m-2 grid grid-cols-[auto_1fr_auto] items-start gap-2 p-2 text-[11px] leading-4"
      transition:slide={{ duration: 160 }}
    >
      <CircleAlert class="ui-icon ui-icon--sm mt-px" />
      <span class="min-w-0 flex-1 wrap-break-word">{operationError}</span>
      <button
        class="btn btn-ghost ui-icon-button ui-icon-button--compact ui-interactive shrink-0"
        onclick={() => (operationError = "")}
        aria-label="Dismiss error"
      >
        <X class="ui-icon ui-icon--sm" />
      </button>
    </div>
  {/if}

  <div class="min-h-0 flex-1 overflow-y-auto p-1.5">
    {#if !vault.vaultPath}
      <div class="px-3 py-8 text-center">
        <p class="text-xs font-medium text-base-content/65">Open a vault</p>
        <p class="mt-1 text-[11px] leading-4 text-base-content/40">
          Choose a folder containing your Typst documents.
        </p>
        <button class="btn btn-primary btn-sm mt-3" onclick={() => vault.openVault()}>
          Choose folder
        </button>
      </div>
    {:else}
      {#if creating?.parent === vault.vaultPath}
        <div class="flex items-center gap-1.5 px-2 py-1">
          {#if creating.isDir}
            <FolderPlus class="ui-icon ui-icon--sm text-base-content/45" />
          {:else}
            <FilePlus class="ui-icon ui-icon--sm text-base-content/45" />
          {/if}
          <input
            type="text"
            bind:value={createValue}
            class="input input-bordered input-xs min-w-0 flex-1"
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
        <div class="px-3 py-8 text-center text-[11px] leading-4 text-base-content/40">
          This vault is empty. Create a file to begin.
        </div>
      {/each}
    {/if}
  </div>
</div>

{#snippet renderNode(node: TreeNode, depth: number)}
  <div style="padding-left: {depth * 12}px">
    {#if renaming === node.path}
      <div class="flex items-center gap-1.5 px-2 py-0.5">
        {#if node.is_dir}
          <FolderOpen class="ui-icon ui-icon--sm text-base-content/45" />
        {:else}
          <FileText class="ui-icon ui-icon--sm text-base-content/45" />
        {/if}
        <input
          type="text"
          bind:value={renameValue}
          class="input input-bordered input-xs min-w-0 flex-1"
          aria-label="New name"
          onkeydown={(e) => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') renaming = null; }}
          onchange={confirmRename}
        />
      </div>
    {:else if node.is_dir}
      <button
        type="button"
        class="ui-interactive ui-touch-target flex min-h-7 w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left text-xs font-medium hover:bg-base-300/70"
        onclick={() => toggle(node.path)}
        oncontextmenu={(e) => onContextMenu(e, node)}
        aria-expanded={expanded.has(node.path)}
      >
        {#if expanded.has(node.path)}
          <ChevronDown class="ui-icon ui-icon--sm text-base-content/50" />
        {:else}
          <ChevronRight class="ui-icon ui-icon--sm text-base-content/50" />
        {/if}
        <FolderOpen class="ui-icon ui-icon--sm text-base-content/50" />
        <span class="truncate">{node.name}</span>
      </button>
      {#if expanded.has(node.path)}
        <div transition:slide={{ duration: 150 }}>
          {#if creating?.parent === node.path}
            <div class="flex items-center gap-1 px-2 py-0.5" style="padding-left: {(depth + 1) * 12}px">
              {#if creating.isDir}
                <FolderPlus class="ui-icon ui-icon--sm text-base-content/50" />
              {:else}
                <FilePlus class="ui-icon ui-icon--sm text-base-content/50" />
              {/if}
              <input
                type="text"
                bind:value={createValue}
                class="input input-bordered input-xs flex-1"
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
        class="ui-interactive ui-touch-target flex min-h-7 w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left text-xs hover:bg-base-300/70 {node.path === vault.activeTabPath ? 'bg-base-300/80 text-primary' : ''}"
        onclick={() => vault.openFile(node.path)}
        oncontextmenu={(e) => onContextMenu(e, node)}
        aria-current={node.path === vault.activeTabPath ? "page" : undefined}
      >
        <span class="w-3.5 shrink-0"></span>
        <FileText class="ui-icon ui-icon--sm text-base-content/50" />
        <span class="truncate">{node.name}</span>
      </button>
    {/if}
  </div>
{/snippet}

{#if contextMenu}
  <ul
    class="menu menu-sm fixed z-50 min-w-40 rounded-box border border-base-300 bg-base-100 p-1.5 shadow-xl"
    style="left: min({contextMenu.x}px, calc(100vw - 11rem)); top: min({contextMenu.y}px, calc(100vh - 12rem))"
    role="menu"
    tabindex="-1"
    oncontextmenu={(e) => e.preventDefault()}
    transition:scale={{ duration: 120, start: 0.96 }}
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
      <li class="my-1 h-px bg-base-300"></li>
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
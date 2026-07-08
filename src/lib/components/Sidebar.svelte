<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { FolderOpen, FileText, ChevronRight, ChevronDown, FilePlus, FolderPlus, Pencil, Trash2 } from "lucide-svelte";

  interface TreeNode {
    name: string;
    path: string;
    is_dir: boolean;
    children: TreeNode[];
  }

  let {
    files = [],
    vaultPath = "",
    onOpenVault = () => {},
    onOpenFile = () => {},
    onVaultChanged = () => {},
  }: {
    files: TreeNode[];
    vaultPath: string;
    onOpenVault: () => void;
    onOpenFile: (path: string) => void;
    onVaultChanged: () => void;
  } = $props();

  let expanded = $state<Set<string>>(new Set());
  let contextMenu = $state<{ x: number; y: number; node: TreeNode | null } | null>(null);
  let renaming = $state<string | null>(null);
  let renameValue = $state("");
  let creating = $state<{ parent: string; isDir: boolean } | null>(null);
  let createValue = $state("");

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

  function closeContextMenu() {
    contextMenu = null;
  }

  function startRename(node: TreeNode) {
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
    const parent = oldPath.split("/").slice(0, -1).join("/");
    const newPath = parent + "/" + renameValue.trim();
    if (oldPath !== newPath) {
      try {
        await invoke("rename_path", { oldPath, newPath });
        onVaultChanged();
      } catch (e) {
        console.error(e);
      }
    }
    renaming = null;
  }

  async function confirmDelete(node: TreeNode) {
    contextMenu = null;
    if (!confirm(`Delete "${node.name}"?`)) return;
    try {
      await invoke("delete_path", { path: node.path });
      onVaultChanged();
    } catch (e) {
      console.error(e);
    }
  }

  function startCreate(parent: string, isDir: boolean) {
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
    const fullPath = creating.isDir
      ? creating.parent + "/" + name
      : creating.parent + "/" + (name.endsWith(".typ") ? name : name + ".typ");
    try {
      await invoke("create_file", { path: fullPath, isDir: creating.isDir });
      onVaultChanged();
    } catch (e) {
      console.error(e);
    }
    creating = null;
  }
</script>

<svelte:window onclick={closeContextMenu} />

<div class="flex flex-col h-full bg-base-200" role="tree" tabindex="0" oncontextmenu={(e) => onContextMenu(e, null)}>
  <div class="p-2 border-b border-base-300">
    <button class="btn btn-outline btn-sm w-full" onclick={onOpenVault}>
      <FolderOpen size={16} />
      Open Vault
    </button>
    {#if vaultPath}
      <div class="flex items-center gap-1 mt-2">
        <p class="text-xs text-base-content/60 flex-1 break-all">{vaultPath}</p>
        <button class="btn btn-ghost btn-xs" title="New file" onclick={() => startCreate(vaultPath, false)}>
          <FilePlus size={12} />
        </button>
        <button class="btn btn-ghost btn-xs" title="New folder" onclick={() => startCreate(vaultPath, true)}>
          <FolderPlus size={12} />
        </button>
      </div>
    {/if}
  </div>

  <div class="flex-1 overflow-y-auto p-1">
    {#each files as node}
      {@render renderNode(node, 0)}
    {/each}
  </div>
</div>

{#snippet renderNode(node: TreeNode, depth: number)}
  <div style="padding-left: {depth * 12}px">
    {#if node.is_dir}
      <button
        class="flex w-full items-center gap-1 rounded px-2 py-1 text-sm text-left hover:bg-base-300 transition-colors"
        onclick={() => toggle(node.path)}
        oncontextmenu={(e) => onContextMenu(e, node)}
      >
        {#if expanded.has(node.path)}
          <ChevronDown size={14} class="shrink-0 text-base-content/50" />
        {:else}
          <ChevronRight size={14} class="shrink-0 text-base-content/50" />
        {/if}
        <FolderOpen size={14} class="shrink-0 text-base-content/50" />
        <span class="truncate font-medium">{node.name}</span>
      </button>
      {#if expanded.has(node.path)}
        {#if creating?.parent === node.path}
          <div class="flex items-center gap-1 px-2 py-0.5" style="padding-left: {(depth + 1) * 12}px">
            {#if creating.isDir}
              <FolderPlus size={12} class="text-base-content/50" />
            {:else}
              <FilePlus size={12} class="text-base-content/50" />
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
      {/if}
    {:else if renaming === node.path}
      <div class="flex items-center gap-1 px-2 py-0.5">
        <FileText size={14} class="text-base-content/50 shrink-0" />
        <input
          type="text"
          bind:value={renameValue}
          class="input input-bordered input-xs flex-1"
          onkeydown={(e) => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') renaming = null; }}
          onchange={confirmRename}
        />
      </div>
    {:else}
      <button
        class="flex w-full items-center gap-1 rounded px-2 py-1 text-sm text-left hover:bg-base-300 transition-colors"
        onclick={() => onOpenFile(node.path)}
        oncontextmenu={(e) => onContextMenu(e, node)}
      >
        <span class="w-3.5 shrink-0"></span>
        <FileText size={14} class="shrink-0 text-base-content/50" />
        <span class="truncate">{node.name}</span>
      </button>
    {/if}
  </div>
{/snippet}

{#if contextMenu}
  <div
    class="fixed z-50 min-w-40 rounded-lg border border-base-300 bg-base-100 shadow-lg py-1"
    style="left: {contextMenu.x}px; top: {contextMenu.y}px"
  >
    {#if contextMenu.node?.is_dir}
      <button class="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-base-200" onclick={() => startCreate(contextMenu!.node!.path, false)}>
        <FilePlus size={14} /> New File
      </button>
      <button class="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-base-200" onclick={() => startCreate(contextMenu!.node!.path, true)}>
        <FolderPlus size={14} /> New Folder
      </button>
      <div class="divider my-0 h-px bg-base-300"></div>
    {/if}
    {#if contextMenu.node}
      <button class="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-base-200" onclick={() => startRename(contextMenu!.node!)}>
        <Pencil size={14} /> Rename
      </button>
      <button class="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-base-200 text-error" onclick={() => confirmDelete(contextMenu!.node!)}>
        <Trash2 size={14} /> Delete
      </button>
    {:else}
      <button class="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-base-200" onclick={() => startCreate(vaultPath, false)}>
        <FilePlus size={14} /> New File
      </button>
      <button class="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-base-200" onclick={() => startCreate(vaultPath, true)}>
        <FolderPlus size={14} /> New Folder
      </button>
    {/if}
  </div>
{/if}
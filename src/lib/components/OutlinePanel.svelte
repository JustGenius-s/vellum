<script lang="ts">
  import { FileText, ListTree, Search } from "lucide-svelte";
  import { parseOutline } from "$lib/outline";
  import { getVault, getUI } from "$lib/stores.svelte";

  let { onnavigate }: { onnavigate?: () => void } = $props();

  const vault = getVault();
  const ui = getUI();

  let query = $state("");
  let headings = $derived(parseOutline(vault.source));
  let visibleHeadings = $derived(
    query.trim()
      ? headings.filter((heading) =>
          heading.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
        )
      : headings,
  );

  function goTo(line: number) {
    ui.currentView = "editor";
    ui.gotoLine = line;
    onnavigate?.();
  }
</script>

<section class="flex h-full min-h-0 flex-col bg-base-200/35" aria-label="Document outline">
  {#if vault.activeTabPath}
    <div class="border-b border-base-300 px-2 py-2">
      <div class="mb-2 flex min-w-0 items-center gap-2 px-1 text-xs text-base-content/55">
        <FileText class="ui-icon ui-icon--sm" />
        <span class="min-w-0 flex-1 truncate">{vault.activeTabName}</span>
        <span class="ui-caption tabular-nums">{headings.length}</span>
      </div>
      <label class="input input-sm h-8 w-full gap-2 bg-base-100 px-2">
        <Search class="ui-icon ui-icon--sm text-base-content/40" />
        <input
          type="search"
          class="min-w-0 grow text-xs"
          placeholder="Filter headings"
          aria-label="Filter outline headings"
          bind:value={query}
        />
      </label>
    </div>

    {#if visibleHeadings.length > 0}
      <div
        id="document-outline"
        class="min-h-0 flex-1 overflow-y-auto px-1.5 py-2"
        role="tree"
        aria-label="Headings"
      >
        {#each visibleHeadings as heading}
          <button
            type="button"
            class="ui-interactive ui-touch-target flex min-h-8 w-full items-center gap-2 rounded-md pr-2 text-left text-xs text-base-content/65 hover:bg-base-300 hover:text-base-content"
            style="padding-left: {(heading.level - 1) * 12 + 8}px"
            onclick={() => goTo(heading.line)}
            title={`${heading.title} · line ${heading.line}`}
            role="treeitem"
            aria-level={heading.level}
            aria-selected="false"
          >
            <span class="ui-caption w-5 shrink-0 font-mono text-base-content/35">
              H{heading.level}
            </span>
            <span class="min-w-0 flex-1 truncate">{heading.title}</span>
            <span class="ui-caption shrink-0 tabular-nums text-base-content/30">
              {heading.line}
            </span>
          </button>
        {/each}
      </div>
    {:else}
      <div class="flex min-h-0 flex-1 items-center justify-center px-5 text-center">
        <div>
          <p class="text-xs font-medium text-base-content/60">
            {query ? "No matching headings" : "No headings"}
          </p>
          <p class="mt-1 text-xs leading-5 text-base-content/40">
            {query
              ? "Try a different filter."
              : "Add a Typst heading such as “= Introduction”."}
          </p>
        </div>
      </div>
    {/if}
  {:else}
    <div class="flex min-h-0 flex-1 items-center justify-center px-5 text-center">
      <div>
        <ListTree class="ui-icon ui-icon--lg mx-auto text-base-content/30" />
        <p class="mt-3 text-xs font-medium text-base-content/60">No document open</p>
        <p class="mt-1 text-xs leading-5 text-base-content/40">
          Select a Typst file to inspect its structure.
        </p>
      </div>
    </div>
  {/if}
</section>

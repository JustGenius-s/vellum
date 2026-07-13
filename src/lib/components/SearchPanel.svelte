<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { FileText, Search } from "lucide-svelte";
  import { getUI, getVault } from "$lib/stores.svelte";

  interface SearchResult {
    path: string;
    relativePath: string;
    line: number;
    column: number;
    preview: string;
  }

  let { onnavigate }: { onnavigate?: () => void } = $props();

  const vault = getVault();
  const ui = getUI();

  let query = $state("");
  let results = $state<SearchResult[]>([]);
  let searching = $state(false);
  let error = $state("");
  let input = $state<HTMLInputElement>();
  let searchToken = 0;

  let groupedResults = $derived.by(() => {
    const groups = new Map<string, SearchResult[]>();
    for (const result of results) {
      const group = groups.get(result.relativePath) ?? [];
      group.push(result);
      groups.set(result.relativePath, group);
    }
    return Array.from(groups, ([relativePath, matches]) => ({
      relativePath,
      matches,
    }));
  });

  $effect(() => {
    setTimeout(() => input?.focus(), 0);
  });

  $effect(() => {
    const value = query.trim();
    const vaultPath = vault.vaultPath;
    const token = ++searchToken;
    error = "";

    if (!vaultPath || value.length < 2) {
      results = [];
      searching = false;
      return;
    }

    searching = true;
    const timer = setTimeout(async () => {
      try {
        const found = await invoke<SearchResult[]>("search_vault", {
          vaultPath,
          query: value,
        });
        if (token === searchToken) results = found;
      } catch (cause) {
        if (token === searchToken) {
          error = String(cause);
          results = [];
        }
      } finally {
        if (token === searchToken) searching = false;
      }
    }, 220);

    return () => clearTimeout(timer);
  });

  async function openResult(result: SearchResult) {
    await vault.openFile(result.path);
    ui.currentView = "editor";
    ui.gotoLine = result.line;
    onnavigate?.();
  }
</script>

<section class="flex h-full min-h-0 flex-col bg-base-200/35" aria-label="Search vault">
  <div class="border-b border-base-300 p-2">
    <label class="input input-sm h-9 w-full gap-2 bg-base-100 px-2">
      {#if searching}
        <span class="loading loading-spinner loading-xs text-primary"></span>
      {:else}
        <Search class="ui-icon ui-icon--sm text-base-content/40" />
      {/if}
      <input
        bind:this={input}
        bind:value={query}
        type="search"
        class="min-w-0 grow text-xs"
        placeholder="Search all Typst files"
        aria-label="Search all Typst files"
      />
      {#if results.length > 0}
        <span class="ui-caption tabular-nums text-base-content/40">
          {results.length}
        </span>
      {/if}
    </label>
  </div>

  <div class="min-h-0 flex-1 overflow-y-auto py-1.5">
    {#if !vault.vaultPath}
      <div class="px-5 py-8 text-center text-xs leading-5 text-base-content/45">
        Open a vault to search its contents.
      </div>
    {:else if query.trim().length < 2}
      <div class="px-5 py-8 text-center text-xs leading-5 text-base-content/45">
        Type at least two characters.
      </div>
    {:else if error}
      <div class="px-4 py-6 text-xs leading-5 text-error/75">{error}</div>
    {:else if !searching && results.length === 0}
      <div class="px-5 py-8 text-center text-xs leading-5 text-base-content/45">
        No matches found.
      </div>
    {:else}
      {#each groupedResults as group}
        <section class="mb-2">
          <div class="flex h-7 items-center gap-2 px-3 text-xs font-medium text-base-content/60">
            <FileText class="ui-icon ui-icon--sm" />
            <span class="min-w-0 flex-1 truncate">{group.relativePath}</span>
            <span class="ui-caption tabular-nums text-base-content/35">
              {group.matches.length}
            </span>
          </div>
          {#each group.matches as match}
            <button
              type="button"
              class="ui-interactive flex min-h-10 w-full gap-2 px-3 py-1.5 text-left hover:bg-base-300/70"
              onclick={() => void openResult(match)}
              title={`${match.relativePath}:${match.line}:${match.column}`}
            >
              <span class="ui-caption w-8 shrink-0 pt-0.5 text-right font-mono tabular-nums text-base-content/35">
                {match.line}
              </span>
              <span class="min-w-0 flex-1 truncate text-xs text-base-content/70">
                {match.preview}
              </span>
            </button>
          {/each}
        </section>
      {/each}
    {/if}
  </div>
</section>

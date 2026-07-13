<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { FileText, Search } from "lucide-svelte";
  import { getUI, getVault } from "$lib/stores.svelte";
  import EmptyState from "$lib/components/ui/EmptyState.svelte";
  import ListRow from "$lib/components/ui/ListRow.svelte";
  import Spinner from "$lib/components/ui/Spinner.svelte";
  import { staggerChildren } from "$lib/motion/actions";

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

<section class="search-shell ui-surface-chrome flex h-full min-h-0 flex-col" aria-label="Search vault">
  <header class="search-header">
    <div class="mb-4 flex items-end justify-between gap-4">
      <div>
        <span class="panel-kicker">Discovery</span>
        <h2 class="mt-1 text-base font-semibold tracking-tight">Search space</h2>
      </div>
      {#if results.length > 0}
        <span class="result-total tabular-nums">{results.length} matches</span>
      {/if}
    </div>
    <label class="search-input ui-search-field ui-glass-control">
      {#if searching}
        <Spinner size="sm" label="Searching" />
      {:else}
        <Search class="ui-icon ui-icon--sm ui-text-muted" />
      {/if}
      <input
        bind:this={input}
        bind:value={query}
        type="search"
        class="min-w-0 grow bg-transparent text-sm outline-none"
        placeholder="Search all Typst files"
        aria-label="Search all Typst files"
      />
    </label>
  </header>

  <div use:staggerChildren class="search-track min-h-0 flex-1 overflow-y-auto px-2 py-3">
    {#if !vault.vaultPath}
      <EmptyState
        title="No vault open"
        description="Open a vault to search its contents."
      />
    {:else if query.trim().length < 2}
      <EmptyState
        title="Search this vault"
        description="Type at least two characters."
      />
    {:else if error}
      <div class="mx-2 rounded-xl bg-error/5 px-4 py-3 text-sm leading-6 text-error">{error}</div>
    {:else if !searching && results.length === 0}
      <EmptyState
        title="No matches found"
        description="Try a different word or phrase."
      />
    {:else}
      {#each groupedResults as group}
        <section class="result-group mb-4">
          <div class="group-header ui-text-secondary flex min-h-10 items-center gap-2.5 px-3">
            <span class="file-node ui-glass-accent" aria-hidden="true">
              <FileText class="ui-icon ui-icon--sm" />
            </span>
            <span class="min-w-0 flex-1 truncate">{group.relativePath}</span>
            <span class="match-count tabular-nums">
              {group.matches.length}
            </span>
          </div>
          {#each group.matches as match}
            <ListRow
              motionItem
              onclick={() => void openResult(match)}
              title={`${match.relativePath}:${match.line}:${match.column}`}
            >
              <span class="line-index w-9 shrink-0 text-right font-mono tabular-nums">
                {match.line}
              </span>
              <span class="min-w-0 flex-1 truncate text-[0.8125rem]">
                {match.preview}
              </span>
            </ListRow>
          {/each}
        </section>
      {/each}
    {/if}
  </div>
</section>

<style>
  .search-shell {
    background:
      linear-gradient(
        145deg,
        color-mix(in oklab, var(--vellum-glass-specular) 18%, transparent),
        transparent 28%
      ),
      radial-gradient(
        circle at 88% 0%,
        color-mix(in oklab, var(--color-primary) 8%, transparent),
        transparent 14rem
      );
  }

  .search-header {
    flex: none;
    padding: 1.125rem 1rem 0.875rem;
  }

  .panel-kicker {
    color: var(--color-primary);
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.17em;
    text-transform: uppercase;
  }

  .result-total {
    color: color-mix(in oklab, var(--color-base-content) 46%, transparent);
    font-size: 0.6875rem;
  }

  .search-input {
    height: 2.75rem;
    border-radius: 0.875rem;
    padding-inline: 0.875rem;
  }

  .result-group {
    position: relative;
    padding-bottom: 0.125rem;
  }

  .group-header {
    margin-bottom: 0.125rem;
    font-size: 0.8125rem;
    font-weight: 620;
    letter-spacing: -0.01em;
  }

  .file-node {
    display: grid;
    width: 1.75rem;
    height: 1.75rem;
    flex: none;
    place-items: center;
    border-radius: 0.55rem;
    color: color-mix(in oklab, var(--color-primary) 84%, var(--color-base-content));
  }

  .match-count {
    border-radius: 999px;
    background: color-mix(in oklab, var(--color-base-content) 5%, transparent);
    padding: 0.15rem 0.5rem;
    color: color-mix(in oklab, var(--color-base-content) 48%, transparent);
    font-size: 0.625rem;
  }

  .line-index {
    color: color-mix(in oklab, var(--color-primary) 70%, transparent);
    font-size: 0.6875rem;
  }

  .result-group :global(.ui-list-row) {
    min-height: 2.625rem;
    margin-block: 0.125rem;
    padding-inline: 0.75rem;
  }

  .result-group :global(.ui-list-row:hover .line-index) {
    color: var(--color-primary);
  }
</style>

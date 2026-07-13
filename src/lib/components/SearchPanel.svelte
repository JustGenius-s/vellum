<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { FileText } from "lucide-svelte";
  import { getUI, getVault } from "$lib/stores.svelte";
  import EmptyState from "$lib/components/ui/EmptyState.svelte";
  import IconBadge from "$lib/components/ui/IconBadge.svelte";
  import ListRow from "$lib/components/ui/ListRow.svelte";
  import PanelSection from "$lib/components/ui/PanelSection.svelte";
  import SearchField from "$lib/components/ui/SearchField.svelte";
  import StatusBadge from "$lib/components/ui/StatusBadge.svelte";
  import { crossfadeEnter, staggerChildren } from "$lib/motion/actions";

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
  let viewState = $derived(
    !vault.vaultPath
      ? "no-vault"
      : query.trim().length < 2
        ? "idle"
        : error
          ? "error"
          : searching
            ? "loading"
            : results.length === 0
              ? "empty"
              : "results",
  );

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

<section class="search-shell ui-surface-chrome ui-surface-chrome--tinted flex h-full min-h-0 flex-col" aria-label="Search vault">
  <PanelSection
    kicker="Discovery"
    title="Search space"
    meta={results.length > 0 ? `${results.length} matches` : undefined}
  >
    {#snippet toolbar()}
      <SearchField
        bind:value={query}
        bind:input
        size="md"
        loading={searching}
        count={results.length}
        placeholder="Search all Typst files"
        label="Search all Typst files"
      />
    {/snippet}
  </PanelSection>

  <div
    use:staggerChildren={{ dependency: results, limit: 30 }}
    class="search-track min-h-0 flex-1 overflow-y-auto px-2 py-3"
  >
    {#key viewState}
    <div use:crossfadeEnter>
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
      {#each groupedResults as group (group.relativePath)}
        <section class="result-group mb-4">
          <div class="group-header ui-text-secondary flex min-h-10 items-center gap-2.5 px-3">
            <IconBadge size="sm">
              <FileText class="ui-icon ui-icon--sm" />
            </IconBadge>
            <span class="min-w-0 flex-1 truncate">{group.relativePath}</span>
            <StatusBadge tone="neutral">
              {group.matches.length}
            </StatusBadge>
          </div>
          {#each group.matches as match}
            <ListRow
              motionItem
              motionDependency={results}
              density="relaxed"
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
    {/key}
  </div>
</section>

<style>
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

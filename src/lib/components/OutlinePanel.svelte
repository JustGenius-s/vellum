<script lang="ts">
  import { FileText, ListTree } from "lucide-svelte";
  import { parseOutline } from "$lib/outline";
  import { getVault, getUI } from "$lib/stores.svelte";
  import { crossfadeEnter, staggerChildren } from "$lib/motion/actions";
  import EmptyState from "$lib/components/ui/EmptyState.svelte";
  import IconBadge from "$lib/components/ui/IconBadge.svelte";
  import ListRow from "$lib/components/ui/ListRow.svelte";
  import PanelSection from "$lib/components/ui/PanelSection.svelte";
  import SearchField from "$lib/components/ui/SearchField.svelte";

  let { onnavigate }: { onnavigate?: () => void } = $props();

  const vault = getVault();
  const ui = getUI();

  let query = $state("");
  let activeLine = $state<number | null>(null);
  let headings = $derived(parseOutline(vault.source));
  let visibleHeadings = $derived(
    query.trim()
      ? headings.filter((heading) =>
          heading.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
        )
      : headings,
  );

  function goTo(line: number) {
    activeLine = line;
    ui.currentView = "editor";
    ui.gotoLine = line;
    onnavigate?.();
    setTimeout(() => {
      if (activeLine === line) activeLine = null;
    }, 900);
  }
</script>

<section class="outline-shell ui-surface-chrome ui-surface-chrome--tinted flex h-full min-h-0 flex-col" aria-label="Document outline">
  {#if vault.activeTabPath}
    <PanelSection
      kicker="Structure"
      title={vault.activeTabName}
      meta={`${headings.length} structural nodes`}
    >
      {#snippet leading()}
        <IconBadge size="lg">
          <FileText class="ui-icon" />
        </IconBadge>
      {/snippet}
      {#snippet toolbar()}
        <SearchField
          bind:value={query}
          size="md"
          placeholder="Filter headings"
          label="Filter outline headings"
        />
      {/snippet}
    </PanelSection>

    {#if visibleHeadings.length > 0}
      <div
        use:staggerChildren={{ dependency: query, limit: 20 }}
        use:crossfadeEnter
        id="document-outline"
        class="outline-track min-h-0 flex-1 overflow-y-auto px-2 py-3"
        role="tree"
        aria-label="Headings"
      >
        {#each visibleHeadings as heading (heading.line)}
          <ListRow
            class="outline-row ui-touch-target pr-3"
            motionItem
            motionDependency={visibleHeadings}
            selected={activeLine === heading.line}
            selectionMode="selected"
            density="relaxed"
            role="treeitem"
            ariaLevel={heading.level}
            indent={(heading.level - 1) * 14 + 11}
            onclick={() => goTo(heading.line)}
            title={`${heading.title} · line ${heading.line}`}
          >
            <IconBadge size="sm" circle>
              <span class="font-mono text-[0.625rem]">{heading.level}</span>
            </IconBadge>
            <span class="min-w-0 flex-1 truncate text-[0.8125rem] font-medium">{heading.title}</span>
            <span class="line-number shrink-0 font-mono tabular-nums">
              {heading.line}
            </span>
          </ListRow>
        {/each}
      </div>
    {:else}
      <div use:crossfadeEnter>
        <EmptyState
          title={query ? "No matching headings" : "No headings"}
          description={query
            ? "Try a different filter."
            : "Add a Typst heading such as “= Introduction”."}
        />
      </div>
    {/if}
  {:else}
    <EmptyState
      title="No document open"
      description="Select a Typst file to inspect its structure."
    >
      {#snippet icon()}
        <ListTree class="ui-icon ui-icon--lg ui-text-muted mx-auto" />
      {/snippet}
    </EmptyState>
  {/if}
</section>

<style>
  :global(.outline-row) {
    min-height: 2.625rem;
    margin-block: 0.125rem;
    gap: 0.625rem;
    padding-left: 0.6875rem;
  }

  :global(.outline-row[aria-level="1"]) {
    color: color-mix(in oklab, var(--color-base-content) 82%, transparent);
  }

  :global(.outline-row[aria-level="1"]) span:nth-child(2) {
    font-weight: 620;
  }

  :global(.outline-row[aria-level="3"]),
  :global(.outline-row[aria-level="4"]),
  :global(.outline-row[aria-level="5"]),
  :global(.outline-row[aria-level="6"]) {
    color: color-mix(in oklab, var(--color-base-content) 58%, transparent);
  }

  .line-number {
    color: color-mix(in oklab, var(--color-base-content) 36%, transparent);
    font-size: 0.625rem;
  }
</style>

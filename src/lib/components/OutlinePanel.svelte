<script lang="ts">
  import { FileText, ListTree } from "lucide-svelte";
  import { parseOutline } from "$lib/outline";
  import { getVault, getUI } from "$lib/stores.svelte";
  import { staggerChildren } from "$lib/motion/actions";
  import EmptyState from "$lib/components/ui/EmptyState.svelte";
  import SearchField from "$lib/components/ui/SearchField.svelte";

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

<section class="outline-shell ui-surface-chrome flex h-full min-h-0 flex-col" aria-label="Document outline">
  {#if vault.activeTabPath}
    <header class="outline-header">
      <span class="panel-kicker">Structure</span>
      <div class="mt-1.5 mb-4 flex min-w-0 items-center gap-3">
        <span class="document-mark" aria-hidden="true">
          <FileText class="ui-icon" />
        </span>
        <div class="min-w-0 flex-1">
          <h2 class="truncate text-base font-semibold tracking-tight">{vault.activeTabName}</h2>
          <p class="ui-text-tertiary mt-0.5 text-xs">{headings.length} structural nodes</p>
        </div>
      </div>
      <SearchField
        bind:value={query}
        placeholder="Filter headings"
        label="Filter outline headings"
      />
    </header>

    {#if visibleHeadings.length > 0}
      <div
        use:staggerChildren
        id="document-outline"
        class="outline-track min-h-0 flex-1 overflow-y-auto px-2 py-3"
        role="tree"
        aria-label="Headings"
      >
        {#each visibleHeadings as heading}
          <button
            data-motion-item
            type="button"
            class="outline-row ui-list-row ui-interactive ui-touch-target pr-3"
            style="margin-left: {(heading.level - 1) * 14}px"
            onclick={() => goTo(heading.line)}
            title={`${heading.title} · line ${heading.line}`}
            role="treeitem"
            aria-level={heading.level}
            aria-selected="false"
          >
            <span class="level-node shrink-0 font-mono" aria-hidden="true">
              {heading.level}
            </span>
            <span class="min-w-0 flex-1 truncate text-[0.8125rem] font-medium">{heading.title}</span>
            <span class="line-number shrink-0 font-mono tabular-nums">
              {heading.line}
            </span>
          </button>
        {/each}
      </div>
    {:else}
      <EmptyState
        title={query ? "No matching headings" : "No headings"}
        description={query
          ? "Try a different filter."
          : "Add a Typst heading such as “= Introduction”."}
      />
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
  .outline-shell {
    background:
      linear-gradient(160deg, color-mix(in oklab, var(--color-primary) 4%, transparent), transparent 14rem),
      var(--vellum-surface-chrome);
  }

  .outline-header {
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

  .document-mark {
    display: grid;
    width: 2.5rem;
    height: 2.5rem;
    flex: none;
    place-items: center;
    border-radius: 0.8rem;
    background: color-mix(in oklab, var(--color-primary) 9%, transparent);
    color: color-mix(in oklab, var(--color-primary) 86%, var(--color-base-content));
  }

  .outline-header :global(.ui-search-field) {
    height: 2.625rem;
    border-radius: 0.875rem;
    padding-inline: 0.8rem;
  }

  .outline-row {
    min-height: 2.625rem;
    margin-block: 0.125rem;
    gap: 0.625rem;
    padding-left: 0.6875rem;
  }

  .outline-row:hover {
    background: color-mix(in oklab, var(--color-base-content) 6%, transparent);
  }

  .outline-row[aria-level="1"] {
    color: color-mix(in oklab, var(--color-base-content) 82%, transparent);
  }

  .outline-row[aria-level="1"] span:nth-child(2) {
    font-weight: 620;
  }

  .outline-row[aria-level="3"],
  .outline-row[aria-level="4"],
  .outline-row[aria-level="5"],
  .outline-row[aria-level="6"] {
    color: color-mix(in oklab, var(--color-base-content) 58%, transparent);
  }

  .level-node {
    display: grid;
    width: 1.6rem;
    height: 1.6rem;
    place-items: center;
    border-radius: 999px;
    background: color-mix(in oklab, var(--color-primary) 8%, transparent);
    color: color-mix(in oklab, var(--color-primary) 78%, var(--color-base-content));
    font-size: 0.625rem;
  }

  .outline-row:hover .level-node {
    background: color-mix(in oklab, var(--color-primary) 12%, transparent);
    color: var(--color-primary);
  }

  .line-number {
    color: color-mix(in oklab, var(--color-base-content) 36%, transparent);
    font-size: 0.625rem;
  }
</style>

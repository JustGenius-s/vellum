<script lang="ts">
  import {
    ChevronsUpDown,
    CircleAlert,
    CircleCheck,
    ListFilter,
    TriangleAlert,
    X,
  } from "lucide-svelte";
  import EmptyState from "$lib/components/ui/EmptyState.svelte";
  import IconButton from "$lib/components/ui/IconButton.svelte";
  import ListRow from "$lib/components/ui/ListRow.svelte";
  import { getVault, getUI } from "$lib/stores.svelte";
  import type { CompileDiagnostic } from "$lib/vault.svelte";
  import { surfaceEnter } from "$lib/motion/actions";

  const vault = getVault();
  const ui = getUI();

  let filter = $state<"all" | "error" | "warning">("all");
  let expanded = $state(false);
  let previousCount = 0;
  let errorCount = $derived(
    vault.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length,
  );
  let warningCount = $derived(vault.diagnostics.length - errorCount);
  let visibleDiagnostics = $derived(
    filter === "all"
      ? vault.diagnostics
      : vault.diagnostics.filter((diagnostic) => diagnostic.severity === filter),
  );

  $effect(() => {
    const count = vault.diagnostics.length;
    if (count > 0 && previousCount === 0) {
      ui.problemsOpen = true;
    }
    previousCount = count;
  });

  async function onSelect(diagnostic: CompileDiagnostic) {
    await vault.openDiagnostic(diagnostic);
    if (diagnostic.line != null) ui.gotoLine = diagnostic.line;
  }

  function close() {
    ui.problemsOpen = false;
  }
</script>

{#if ui.problemsOpen}
  <div
    use:surfaceEnter={{ y: 16, scale: 0.99 }}
    class="problems-hud ui-surface-overlay mx-2 mb-2 flex shrink-0 flex-col overflow-hidden"
    class:problems-hud--expanded={expanded}
    aria-label="Problems panel"
  >
    <div class="hud-header flex min-h-11 shrink-0 items-center gap-2 px-3">
      <span class="hud-signal" aria-hidden="true"></span>
      <CircleAlert class="ui-icon ui-icon--sm text-primary" />
      <h2 class="hud-title">Problems</h2>
      <span class="ui-caption ui-text-tertiary tabular-nums">
        {vault.diagnostics.length} detected
      </span>
      <div class="ml-auto flex items-center gap-1">
        <IconButton
          label={expanded ? "Collapse problems" : "Expand problems"}
          compact
          onclick={() => (expanded = !expanded)}
        >
          <ChevronsUpDown class="ui-icon ui-icon--sm" />
        </IconButton>
        <IconButton label="Close problems" compact onclick={close}>
          <X class="ui-icon ui-icon--sm" />
        </IconButton>
      </div>
    </div>

    <div
      class="hud-filters flex min-h-9 shrink-0 items-center gap-1 px-2"
      role="toolbar"
      aria-label="Filter problems"
    >
      <ListFilter class="ui-icon ui-icon--sm ui-text-tertiary mr-1" />
      <div class="flex min-w-0 flex-1 items-center gap-1">
        <button
          type="button"
          class="hud-filter ui-interactive"
          class:is-active={filter === "all"}
          onclick={() => (filter = "all")}
          aria-pressed={filter === "all"}
        >
          All {vault.diagnostics.length}
        </button>
        <button
          type="button"
          class="hud-filter ui-interactive"
          class:is-active={filter === "error"}
          onclick={() => (filter = "error")}
          aria-pressed={filter === "error"}
        >
          Errors {errorCount}
        </button>
        <button
          type="button"
          class="hud-filter ui-interactive"
          class:is-active={filter === "warning"}
          onclick={() => (filter = "warning")}
          aria-pressed={filter === "warning"}
        >
          Warnings {warningCount}
        </button>
      </div>
    </div>

    <div class="hud-list min-h-0 flex-1 overflow-y-auto p-1.5">
      {#each visibleDiagnostics as diagnostic}
        <ListRow onclick={() => onSelect(diagnostic)}>
          {#if diagnostic.severity === "error"}
            <CircleAlert class="ui-icon ui-icon--sm shrink-0 text-error" />
          {:else}
            <TriangleAlert class="ui-icon ui-icon--sm shrink-0 text-warning" />
          {/if}
          <span class="min-w-0 flex-1 py-1">
            <span class="wrap-break-word block text-base-content">
              {diagnostic.message}
            </span>
            {#if diagnostic.hints.length > 0}
              <span class="ui-text-tertiary mt-0.5 block leading-4">
                {diagnostic.hints.join(" · ")}
              </span>
            {/if}
          </span>
          <span class="ui-text-muted shrink-0 py-1 text-right">
            {#if diagnostic.path}
              <span class="block max-w-52 truncate">{diagnostic.path}</span>
            {/if}
            {#if diagnostic.line != null}
              <span class="ui-caption block tabular-nums">
                {diagnostic.line}{#if diagnostic.column}:{diagnostic.column}{/if}
              </span>
            {/if}
          </span>
        </ListRow>
      {:else}
        <EmptyState
          title={vault.diagnostics.length === 0
            ? "No problems found"
            : "No matching problems"}
          description={vault.diagnostics.length === 0
            ? "The current compilation completed without diagnostics."
            : "Choose another filter to see the remaining diagnostics."}
        >
          {#snippet icon()}
            {#if vault.diagnostics.length === 0}
              <CircleCheck class="ui-icon ui-icon--lg text-success" />
            {:else}
              <ListFilter class="ui-icon ui-icon--lg" />
            {/if}
          {/snippet}
        </EmptyState>
      {/each}
    </div>
  </div>
{/if}

<style>
  .problems-hud {
    height: 12rem;
    max-height: 36dvh;
    border-radius: 0.875rem;
    background: color-mix(in oklab, var(--vellum-surface-overlay) 92%, transparent);
    backdrop-filter: blur(18px) saturate(108%);
    box-shadow:
      0 10px 30px color-mix(in oklab, var(--vellum-surface-app) 22%, transparent),
      inset 0 1px 0 color-mix(in oklab, white 4%, transparent);
    transition:
      height var(--vellum-motion-normal) var(--vellum-ease-out),
      opacity var(--vellum-motion-fast) var(--vellum-ease-out),
      transform var(--vellum-motion-fast) var(--vellum-ease-out);
  }

  .problems-hud--expanded {
    height: min(24rem, 46dvh);
    max-height: 46dvh;
  }

  .hud-header {
    background: color-mix(in oklab, var(--vellum-surface-chrome) 58%, transparent);
  }

  .hud-signal {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 999px;
    background: var(--color-primary);
    opacity: 0.72;
  }

  .hud-title {
    color: color-mix(in oklab, var(--color-base-content) 82%, transparent);
    font-size: var(--vellum-text-ui);
    font-weight: 650;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .hud-filters {
    margin: 0 0.5rem 0.25rem;
    border-radius: 0.625rem;
    background: color-mix(in oklab, var(--vellum-surface-canvas) 52%, transparent);
  }

  .hud-filter {
    min-height: 1.75rem;
    border-radius: 999px;
    padding-inline: 0.625rem;
    color: color-mix(in oklab, var(--color-base-content) 52%, transparent);
    font-size: var(--vellum-text-caption);
  }

  .hud-filter:hover {
    color: var(--color-base-content);
    background: color-mix(in oklab, var(--color-base-content) 6%, transparent);
  }

  .hud-filter.is-active {
    color: var(--color-primary);
    background: color-mix(in oklab, var(--color-primary) 11%, transparent);
  }

  .hud-list {
    margin-inline: 0.25rem;
    border-radius: 0.625rem;
    background: color-mix(in oklab, var(--vellum-surface-canvas) 88%, transparent);
    scrollbar-color:
      color-mix(in oklab, var(--color-primary) 26%, transparent) transparent;
  }

  .hud-list :global(button:hover) {
    background: color-mix(in oklab, var(--color-base-content) 5%, transparent);
  }

  .hud-list :global(button:active) {
    transform: scale(0.995);
  }

  @media (prefers-reduced-motion: reduce) {
    .problems-hud,
    .hud-list :global(button) {
      transition: none;
    }
  }
</style>

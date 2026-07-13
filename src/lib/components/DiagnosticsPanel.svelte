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
  import SegmentedControl, {
    type SegmentOption,
  } from "$lib/components/ui/SegmentedControl.svelte";
  import StatusDot from "$lib/components/ui/StatusDot.svelte";
  import { getVault, getUI } from "$lib/stores.svelte";
  import type { CompileDiagnostic } from "$lib/vault.svelte";
  import { animateExit, staggerChildren, surfaceEnter } from "$lib/motion/actions";

  const vault = getVault();
  const ui = getUI();

  let filter = $state<"all" | "error" | "warning">("all");
  let expanded = $state(false);
  let previousCount = 0;
  let visible = $state(false);
  let panel = $state<HTMLDivElement>();
  let errorCount = $derived(
    vault.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length,
  );
  let warningCount = $derived(vault.diagnostics.length - errorCount);
  let visibleDiagnostics = $derived(
    filter === "all"
      ? vault.diagnostics
      : vault.diagnostics.filter((diagnostic) => diagnostic.severity === filter),
  );
  let filterOptions = $derived<SegmentOption[]>([
    { value: "all", label: "All", count: vault.diagnostics.length },
    { value: "error", label: "Errors", count: errorCount },
    { value: "warning", label: "Warnings", count: warningCount },
  ]);

  $effect(() => {
    if (ui.problemsOpen) {
      visible = true;
      return;
    }
    if (visible && panel) {
      let cancelled = false;
      void animateExit(panel, { y: 12 }).then(() => {
        if (!cancelled) visible = false;
      });
      return () => {
        cancelled = true;
      };
    }
  });

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

{#if visible}
  <div
    bind:this={panel}
    use:surfaceEnter={{ y: 16, scale: 0.99 }}
    class="problems-hud ui-surface-overlay mx-2 mb-2 flex shrink-0 flex-col overflow-hidden"
    class:problems-hud--expanded={expanded}
    aria-label="Problems panel"
  >
    <div class="hud-header flex min-h-11 shrink-0 items-center gap-2 px-3">
      <StatusDot tone="primary" pulse={vault.compilePhase !== "idle"} />
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

    <div class="hud-filters shrink-0">
      <SegmentedControl
        value={filter}
        options={filterOptions}
        label="Filter problems"
        onchange={(value) => (filter = value as typeof filter)}
      />
    </div>

    <div
      use:staggerChildren={{ dependency: visibleDiagnostics, limit: 24 }}
      class="hud-list ui-glass-control min-h-0 flex-1 overflow-y-auto p-1.5"
    >
      {#each visibleDiagnostics as diagnostic (`${diagnostic.path}:${diagnostic.line}:${diagnostic.column}:${diagnostic.message}`)}
        <ListRow
          motionItem
          motionDependency={visibleDiagnostics}
          onclick={() => onSelect(diagnostic)}
        >
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
    border-radius: var(--vellum-radius-md);
    transition:
      height var(--vellum-motion-normal) var(--vellum-ease-out),
      opacity var(--vellum-motion-fast) var(--vellum-ease-out);
  }

  .problems-hud--expanded {
    height: min(24rem, 46dvh);
    max-height: 46dvh;
  }

  .hud-header {
    background: linear-gradient(
      180deg,
      color-mix(in oklab, var(--vellum-glass-specular) 18%, transparent),
      transparent
    );
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
  }

  .hud-list {
    margin-inline: 0.25rem;
    border-radius: var(--vellum-radius-sm);
  }

</style>

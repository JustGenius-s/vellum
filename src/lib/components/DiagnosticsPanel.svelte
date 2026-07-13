<script lang="ts">
  import { slide } from "svelte/transition";
  import { CircleAlert, TriangleAlert, X } from "lucide-svelte";
  import { getVault, getUI } from "$lib/stores.svelte";
  import type { CompileDiagnostic } from "$lib/vault.svelte";

  const vault = getVault();
  const ui = getUI();

  let filter = $state<"all" | "error" | "warning">("all");
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
    class="flex h-48 max-h-[40dvh] shrink-0 flex-col border-t border-base-300 bg-base-200"
    transition:slide={{ duration: 180 }}
    aria-label="Problems panel"
  >
    <div class="flex h-9 shrink-0 items-center gap-2 border-b border-base-300 px-3">
      <CircleAlert class="ui-icon ui-icon--sm text-error" />
      <span class="mr-2 text-xs font-semibold">
        Problems
      </span>
      <div class="flex min-w-0 flex-1 items-center gap-1">
        <button
          class="btn btn-ghost btn-xs h-7 min-h-7 px-2 text-xs"
          class:btn-active={filter === "all"}
          onclick={() => (filter = "all")}
        >
          All {vault.diagnostics.length}
        </button>
        <button
          class="btn btn-ghost btn-xs h-7 min-h-7 px-2 text-xs"
          class:btn-active={filter === "error"}
          onclick={() => (filter = "error")}
        >
          Errors {errorCount}
        </button>
        <button
          class="btn btn-ghost btn-xs h-7 min-h-7 px-2 text-xs"
          class:btn-active={filter === "warning"}
          onclick={() => (filter = "warning")}
        >
          Warnings {warningCount}
        </button>
      </div>
      <button
        class="btn btn-ghost ui-icon-button ui-icon-button--compact"
        onclick={close}
        aria-label="Close problems"
      >
        <X class="ui-icon ui-icon--sm" />
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
      {#each visibleDiagnostics as diagnostic}
        <button
          class="ui-interactive flex w-full items-start gap-2 border-b border-base-300/50 px-3 py-2 text-left text-xs last:border-0 hover:bg-base-300"
          onclick={() => onSelect(diagnostic)}
        >
          {#if diagnostic.severity === "error"}
            <CircleAlert class="ui-icon ui-icon--sm mt-0.5 text-error" />
          {:else}
            <TriangleAlert class="ui-icon ui-icon--sm mt-0.5 text-warning" />
          {/if}
          <span class="min-w-0 flex-1">
            <span class="wrap-break-word">{diagnostic.message}</span>
            {#if diagnostic.hints.length > 0}
              <span class="mt-1 block text-base-content/50">
                {diagnostic.hints.join(" · ")}
              </span>
            {/if}
          </span>
          <span class="shrink-0 text-right text-base-content/40">
            {#if diagnostic.path}
              <span class="block max-w-52 truncate">{diagnostic.path}</span>
            {/if}
            {#if diagnostic.line != null}
              <span class="ui-caption block tabular-nums">
                {diagnostic.line}{#if diagnostic.column}:{diagnostic.column}{/if}
              </span>
            {/if}
          </span>
        </button>
      {:else}
        <div class="flex h-full items-center justify-center px-4 text-xs text-base-content/45">
          {vault.diagnostics.length === 0
            ? "No problems in the current compilation."
            : "No problems match this filter."}
        </div>
      {/each}
    </div>
  </div>
{/if}

<script lang="ts">
  import { X, CircleAlert, TriangleAlert } from "lucide-svelte";
  import { getVault, getUI } from "$lib/stores.svelte";

  const vault = getVault();
  const ui = getUI();

  function onSelect(line: number | null) {
    if (line != null) {
      ui.gotoLine = line;
    }
  }

  function close() {
    ui.diagnosticsDismissed = true;
  }
</script>

{#if vault.diagnostics.length > 0 && !ui.diagnosticsDismissed}
  <div class="border-t border-base-300 bg-base-200 flex flex-col shrink-0 max-h-40">
    <div class="flex items-center gap-2 px-3 py-1.5 border-b border-base-300 shrink-0">
      <CircleAlert size={14} class="text-error shrink-0" />
      <span class="text-xs font-medium flex-1">
        Problems
        <span class="text-base-content/50 font-normal ml-1">
          {vault.diagnostics.length}
        </span>
      </span>
      <button class="btn btn-ghost btn-xs btn-square" onclick={close} title="Close">
        <X size={14} />
      </button>
    </div>
    <div class="overflow-y-auto flex-1">
      {#each vault.diagnostics as diag}
        <button
          class="flex w-full items-start gap-2 px-3 py-1.5 text-left text-xs hover:bg-base-300 transition-colors border-b border-base-300/50 last:border-0"
          onclick={() => onSelect(diag.line)}
        >
          {#if diag.severity === "error"}
            <CircleAlert size={12} class="text-error shrink-0 mt-0.5" />
          {:else}
            <TriangleAlert size={12} class="text-warning shrink-0 mt-0.5" />
          {/if}
          <span class="flex-1 min-w-0">
            <span class="wrap-break-word">{diag.message}</span>
            {#if diag.hints.length > 0}
              <span class="block text-base-content/50 mt-0.5">
                {diag.hints.join(" · ")}
              </span>
            {/if}
          </span>
          {#if diag.line != null}
            <span class="text-base-content/40 tabular-nums shrink-0">
              :{diag.line}{#if diag.column}:{diag.column}{/if}
            </span>
          {/if}
        </button>
      {/each}
    </div>
  </div>
{/if}

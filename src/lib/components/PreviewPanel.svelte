<script lang="ts">
  import { getVault, getUI } from "$lib/stores.svelte";

  const vault = getVault();
  const ui = getUI();

  let scrollEl = $state<HTMLDivElement>();
  let applyingScroll = false;

  function onScroll() {
    if (!scrollEl || applyingScroll) return;
    const max = scrollEl.scrollHeight - scrollEl.clientHeight;
    const ratio = max > 0 ? scrollEl.scrollTop / max : 0;
    ui.scrollSource = "preview";
    ui.scrollRatio = ratio;
  }

  // Sync scroll from editor
  $effect(() => {
    const ratio = ui.scrollRatio;
    const source = ui.scrollSource;
    if (!scrollEl || source !== "editor") return;
    applyingScroll = true;
    const max = scrollEl.scrollHeight - scrollEl.clientHeight;
    scrollEl.scrollTop = max > 0 ? ratio * max : 0;
    requestAnimationFrame(() => {
      applyingScroll = false;
    });
  });
</script>

<div class="relative flex h-full flex-col overflow-hidden">
  {#if vault.compilePhase !== "idle"}
    <div
      class="absolute right-3 top-3 z-10 flex h-8 items-center gap-2 rounded-md border border-base-300 bg-base-100/95 px-3 text-xs shadow-sm"
      role="status"
      aria-live="polite"
    >
      <span class="loading loading-spinner loading-xs text-primary"></span>
      {vault.compilePhase === "pending" ? "Updating preview" : "Compiling"}
    </div>
  {/if}

  <div class="flex-1 overflow-auto" bind:this={scrollEl} onscroll={onScroll}>
    <div class="flex flex-col items-center p-4 bg-base-100 min-h-full">
      {#if vault.svg}
        <div class="w-full max-w-2xl shadow-md rounded overflow-hidden bg-white preview-svg">
          {@html vault.svg}
        </div>
      {:else if vault.compilePhase !== "idle"}
        <div class="flex min-h-72 w-full max-w-2xl items-center justify-center rounded border border-base-300 bg-white">
          <span class="loading loading-spinner loading-md text-primary"></span>
        </div>
      {:else if vault.diagnostics.some((d) => d.severity === "error")}
        <p class="text-sm text-error/70 py-8">Preview unavailable — see problems below</p>
      {:else}
        <p class="text-sm text-base-content/40 py-8">No preview</p>
      {/if}
    </div>
  </div>
</div>

<style>
  .preview-svg :global(svg) {
    width: 100%;
    height: auto;
    display: block;
  }
</style>

<script lang="ts">
  import { ListTree } from "lucide-svelte";
  import { parseOutline } from "$lib/outline";
  import { getVault, getUI } from "$lib/stores.svelte";

  const vault = getVault();
  const ui = getUI();

  let headings = $derived(parseOutline(vault.source));

  function goTo(line: number) {
    ui.gotoLine = line;
  }
</script>

{#if headings.length > 0}
  <div class="border-b border-base-300 bg-base-200/60 shrink-0 max-h-48 flex flex-col">
    <div class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-base-content/60 shrink-0">
      <ListTree size={12} />
      Outline
    </div>
    <div class="overflow-y-auto flex-1 px-1 pb-1">
      {#each headings as h}
        <button
          class="flex w-full items-center gap-1 rounded px-2 py-0.5 text-left text-xs hover:bg-base-300 transition-colors truncate"
          style="padding-left: {(h.level - 1) * 10 + 8}px"
          onclick={() => goTo(h.line)}
          title={h.title}
        >
          <span class="truncate">{h.title}</span>
        </button>
      {/each}
    </div>
  </div>
{/if}

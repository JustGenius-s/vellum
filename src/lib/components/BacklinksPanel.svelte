<script lang="ts">
  import { Link2, Search } from "lucide-svelte";

  let {
    backlinks = [],
    searchQuery = "",
    searchResults = [],
    onOpenByStem = () => {},
    onOpenFile = () => {},
    onSearchInput = () => {},
  }: {
    backlinks: string[];
    searchQuery: string;
    searchResults: { path: string; stem: string; line: number; snippet: string }[];
    onOpenByStem: (stem: string) => void;
    onOpenFile: (path: string) => void;
    onSearchInput: () => void;
  } = $props();
</script>

<div class="flex flex-col h-full bg-base-200 overflow-hidden">
  <div class="flex items-center gap-1.5 border-b border-base-300 bg-base-200/50 px-3 py-2">
    <Link2 size={14} />
    <span class="text-sm font-medium">Backlinks</span>
  </div>
  <div class="flex-1 overflow-y-auto p-1">
    {#if backlinks.length === 0}
      <p class="text-xs text-base-content/40 text-center py-4">No backlinks</p>
    {:else}
      {#each backlinks as bl}
        <button
          class="block w-full text-left rounded px-2 py-1 text-sm text-primary hover:bg-base-300 hover:underline transition-colors"
          onclick={() => onOpenByStem(bl)}
        >
          {bl}
        </button>
      {/each}
    {/if}
  </div>

  <div class="divider my-0"></div>

  <div class="flex flex-col max-h-[40%] p-2 gap-2">
    <label class="relative">
      <Search size={14} class="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40" />
      <input
        type="text"
        placeholder="Search vault..."
        bind:value={searchQuery}
        oninput={onSearchInput}
        class="input input-bordered input-sm w-full pl-8"
      />
    </label>
    <div class="flex-1 overflow-y-auto">
      <div class="space-y-0.5">
        {#each searchResults.slice(0, 30) as r}
          <button
            class="flex flex-col w-full text-left rounded px-2 py-1 hover:bg-base-300 transition-colors gap-0.5"
            onclick={() => onOpenFile(r.path)}
          >
            <span class="text-xs font-semibold text-primary">{r.stem}:{r.line}</span>
            <span class="text-xs text-base-content/50 truncate">{r.snippet}</span>
          </button>
        {/each}
      </div>
    </div>
  </div>
</div>
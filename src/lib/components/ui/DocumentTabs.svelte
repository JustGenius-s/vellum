<script lang="ts">
  import { Circle, X } from "lucide-svelte";
  import { press } from "$lib/motion/actions";
  import { flipLayout } from "$lib/motion/flip";

  interface Tab {
    path: string;
    name: string;
    dirty: boolean;
  }

  let {
    tabs,
    activePath,
    compact = false,
    onswitch,
    onclose,
  }: {
    tabs: Tab[];
    activePath: string;
    compact?: boolean;
    onswitch: (path: string) => void;
    onclose: (path: string) => void;
  } = $props();
</script>

<div
  class="flex min-w-0 flex-1 gap-0.5 overflow-x-auto px-1.5"
  class:h-9={compact}
  class:h-10={!compact}
  role="tablist"
  aria-label="Open documents"
>
  {#each tabs as tab}
    <div
      use:flipLayout={tabs.map((entry) => entry.path).join("|")}
      class="ui-interactive group my-1 flex min-w-28 max-w-48 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs {tab.path === activePath ? 'bg-base-content/6 text-base-content' : ''}"
      class:ui-text-tertiary={tab.path !== activePath}
      role="tab"
      tabindex="0"
      aria-selected={tab.path === activePath}
      onclick={() => onswitch(tab.path)}
      onkeydown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onswitch(tab.path);
        }
      }}
    >
      {#if tab.dirty}
        <Circle class="size-1.5 shrink-0 fill-current text-primary" />
      {/if}
      <span class="min-w-0 flex-1 truncate">{tab.name}</span>
      <button
        use:press
        type="button"
        class="ui-interactive flex size-6 shrink-0 items-center justify-center rounded-md hover:bg-base-300 {tab.path === activePath ? '' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}"
        onclick={(event) => {
          event.stopPropagation();
          onclose(tab.path);
        }}
        aria-label={`Close ${tab.name}`}
      >
        <X class="ui-icon ui-icon--sm" />
      </button>
    </div>
  {/each}
</div>

<script lang="ts">
  import { Circle, X } from "lucide-svelte";
  import { crossfadeEnter, press } from "$lib/motion/actions";
  import { flipLayout } from "$lib/motion/flip";
  import IconButton from "./IconButton.svelte";
  import SharedHighlight from "./SharedHighlight.svelte";

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

  let tablist = $state<HTMLDivElement>();
</script>

<div
  bind:this={tablist}
  class="tab-list relative flex min-w-0 flex-1 gap-0.5 overflow-x-auto px-1.5"
  class:h-9={compact}
  class:h-10={!compact}
  role="tablist"
  aria-label="Open documents"
>
  <SharedHighlight
    container={tablist}
    selector='[data-highlight-target="true"]'
    dependency={activePath}
    inset={4}
  />
  {#each tabs as tab (tab.path)}
    <div
      use:flipLayout={tabs.map((entry) => entry.path).join("|")}
      use:crossfadeEnter={{ x: 5 }}
      class="document-tab ui-interactive group my-1 flex min-w-28 max-w-48 shrink-0 items-center rounded-lg text-xs {tab.path === activePath ? 'text-base-content' : ''}"
      class:ui-text-tertiary={tab.path !== activePath}
      data-highlight-target={tab.path === activePath ? "true" : undefined}
    >
      <button
        use:press
        type="button"
        class="tab-main min-w-0 flex-1"
        role="tab"
        aria-selected={tab.path === activePath}
        onclick={() => onswitch(tab.path)}
      >
        {#if tab.dirty}
          <Circle class="size-1.5 shrink-0 fill-current text-primary" />
        {/if}
        <span class="min-w-0 flex-1 truncate">{tab.name}</span>
      </button>
      <IconButton
        label={`Close ${tab.name}`}
        compact
        class="tab-close {tab.path === activePath ? '' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}"
        onclick={(event) => {
          event.stopPropagation();
          onclose(tab.path);
        }}
      >
        <X class="ui-icon ui-icon--sm" />
      </IconButton>
    </div>
  {/each}
</div>

<style>
  .document-tab {
    position: relative;
    z-index: 1;
    padding-inline: 0.25rem;
  }

  .tab-main {
    display: flex;
    height: 100%;
    align-items: center;
    gap: 0.375rem;
    border: 0;
    padding-left: 0.375rem;
    color: inherit;
    background: transparent;
    text-align: left;
  }
</style>

<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    title,
    description,
    icon,
    action,
  }: {
    title: string;
    description?: string;
    icon?: Snippet;
    action?: Snippet;
  } = $props();
</script>

<div class="ui-empty-state">
  <div class="max-w-xs">
    {#if icon}<div class="ui-empty-icon">{@render icon()}</div>{/if}
    <p class="text-xs font-semibold">{title}</p>
    {#if description}
      <p class="ui-text-tertiary mt-1.5 text-xs leading-5">{description}</p>
    {/if}
    {#if action}<div class="mt-4">{@render action()}</div>{/if}
  </div>
</div>

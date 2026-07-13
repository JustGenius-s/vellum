<script lang="ts">
  import type { Snippet } from "svelte";
  import { surfaceEnter } from "$lib/motion/actions";

  let {
    label,
    children,
  }: {
    label: string;
    children: Snippet;
  } = $props();
</script>

<div use:surfaceEnter={{ y: 6, scale: 0.98 }} class="menu-surface ui-glass-floating" role="menu" aria-label={label}>
  {@render children()}
</div>

<style>
  .menu-surface {
    min-width: 11rem;
    border-radius: 1rem;
    padding: 0.45rem;
  }

  :global(.menu-surface > button) {
    display: flex;
    width: 100%;
    min-height: 2.4rem;
    align-items: center;
    gap: 0.6rem;
    border: 0;
    border-radius: 0.7rem;
    padding-inline: 0.7rem;
    color: var(--color-base-content);
    background: transparent;
    font: inherit;
    font-size: var(--vellum-text-ui);
    text-align: left;
  }

  :global(.menu-surface > button:hover) {
    background: color-mix(in oklab, var(--color-base-content) 7%, transparent);
  }
</style>

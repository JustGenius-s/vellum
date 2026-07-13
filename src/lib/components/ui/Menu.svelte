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

<div use:surfaceEnter={{ y: 6, scale: 0.98 }} class="menu-surface" role="menu" aria-label={label}>
  {@render children()}
</div>

<style>
  .menu-surface {
    min-width: 11rem;
    border-radius: 1rem;
    background:
      linear-gradient(
        145deg,
        color-mix(in oklab, var(--vellum-glass-specular) 34%, transparent),
        transparent 38%
      ),
      var(--vellum-surface-overlay);
    padding: 0.45rem;
    box-shadow:
      inset 0 1px 0 var(--vellum-glass-edge),
      inset 0 0 0 1px var(--vellum-glass-rim),
      var(--vellum-shadow-overlay);
    -webkit-backdrop-filter: blur(var(--vellum-blur-floating)) saturate(1.38);
    backdrop-filter: blur(var(--vellum-blur-floating)) saturate(1.38);
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

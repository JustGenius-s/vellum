<script lang="ts">
  import type { Snippet } from "svelte";
  import { press } from "$lib/motion/actions";

  let {
    label,
    title = label,
    compact = false,
    touch = false,
    active = false,
    disabled = false,
    onclick,
    children,
  }: {
    label: string;
    title?: string;
    compact?: boolean;
    touch?: boolean;
    active?: boolean;
    disabled?: boolean;
    onclick?: (event: MouseEvent) => void;
    children: Snippet;
  } = $props();
</script>

<button
  use:press
  type="button"
  class="icon-button ui-icon-button {active ? 'is-active' : ''}"
  class:ui-icon-button--compact={compact}
  class:ui-touch-target={touch}
  {disabled}
  {onclick}
  aria-label={label}
  aria-pressed={active || undefined}
  {title}
>
  {@render children()}
</button>

<style>
  .icon-button {
    display: inline-grid;
    place-items: center;
    border: 0;
    color: color-mix(in oklab, var(--color-base-content) 62%, transparent);
    background: transparent;
    transition:
      color var(--vellum-motion-fast) var(--vellum-ease-out),
      background-color var(--vellum-motion-fast) var(--vellum-ease-out);
  }

  .icon-button:hover {
    color: var(--color-base-content);
    background:
      linear-gradient(180deg, color-mix(in oklab, var(--vellum-glass-edge) 44%, transparent), transparent 1px),
      color-mix(in oklab, var(--vellum-surface-overlay) 56%, transparent);
    box-shadow:
      inset 0 1px 0 color-mix(in oklab, var(--vellum-glass-edge) 54%, transparent),
      inset 0 0 0 1px color-mix(in oklab, var(--vellum-glass-rim) 70%, transparent);
  }

  .icon-button.is-active {
    color: var(--color-primary);
    background:
      linear-gradient(180deg, color-mix(in oklab, var(--vellum-glass-specular) 28%, transparent), transparent 1px),
      color-mix(in oklab, var(--color-primary) 14%, transparent);
    box-shadow:
      inset 0 1px 0 color-mix(in oklab, var(--vellum-glass-edge) 58%, transparent),
      inset 0 0 0 1px color-mix(in oklab, var(--color-primary) 18%, transparent);
  }
</style>

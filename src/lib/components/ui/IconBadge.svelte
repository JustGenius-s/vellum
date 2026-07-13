<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    size = "md",
    circle = false,
    muted = false,
    children,
  }: {
    size?: "sm" | "md" | "lg";
    circle?: boolean;
    muted?: boolean;
    children: Snippet;
  } = $props();
</script>

<span
  class="ui-mark ui-glass-accent"
  class:ui-mark--sm={size === "sm"}
  class:ui-mark--lg={size === "lg"}
  class:icon-badge--circle={circle}
  class:icon-badge--muted={muted}
  aria-hidden="true"
>
  {@render children()}
</span>

<style>
  .icon-badge--circle {
    border-radius: var(--vellum-radius-pill);
  }

  .icon-badge--muted {
    color: color-mix(in oklab, var(--color-base-content) 52%, transparent);
    background: color-mix(in oklab, var(--vellum-surface-canvas) 48%, transparent);
  }
</style>

<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    tone = "primary",
    floating = false,
    children,
  }: {
    tone?: "primary" | "success" | "warning" | "error" | "neutral";
    floating?: boolean;
    children: Snippet;
  } = $props();
</script>

<span class="status-badge status-badge--{tone} {floating ? 'ui-glass-floating' : 'ui-glass-control'}">
  {@render children()}
</span>

<style>
  .status-badge {
    display: inline-flex;
    min-height: var(--vellum-control-compact);
    align-items: center;
    gap: 0.4rem;
    border-radius: var(--vellum-radius-pill);
    padding-inline: 0.625rem;
    font-size: var(--vellum-text-caption);
  }

  .status-badge--primary {
    color: var(--color-primary);
  }

  .status-badge--success {
    color: var(--color-success);
  }

  .status-badge--warning {
    color: var(--color-warning);
  }

  .status-badge--error {
    color: var(--color-error);
  }

  .status-badge--neutral {
    color: color-mix(in oklab, var(--color-base-content) 58%, transparent);
  }
</style>

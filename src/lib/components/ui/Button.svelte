<script lang="ts">
  import type { Snippet } from "svelte";
  import { press } from "$lib/motion/actions";

  let {
    variant = "ghost",
    size = "md",
    active = false,
    disabled = false,
    type = "button",
    class: className = "",
    onclick,
    children,
  }: {
    variant?: "primary" | "ghost" | "soft" | "danger";
    size?: "sm" | "md";
    active?: boolean;
    disabled?: boolean;
    type?: "button" | "submit";
    class?: string;
    onclick?: (event: MouseEvent) => void;
    children: Snippet;
  } = $props();
</script>

<button
  use:press
  {type}
  {disabled}
  {onclick}
  class="control-button control-button--{variant} control-button--{size} {variant === 'ghost' ? 'ui-glass-hover' : variant === 'soft' ? 'ui-glass-control' : ''} {active ? 'is-active ui-glass-control--active' : ''} {className}"
>
  {@render children()}
</button>

<style>
  .control-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    border: 0;
    border-radius: var(--vellum-radius-control);
    font: inherit;
    font-weight: 620;
    letter-spacing: -0.01em;
    white-space: nowrap;
    box-shadow:
      inset 0 1px 0 transparent,
      inset 0 0 0 1px transparent;
    transition:
      color var(--vellum-motion-fast) var(--vellum-ease-out),
      background-color var(--vellum-motion-fast) var(--vellum-ease-out),
      opacity var(--vellum-motion-fast) var(--vellum-ease-out);
  }

  .control-button--sm {
    min-height: 2rem;
    padding-inline: 0.75rem;
    font-size: var(--vellum-text-ui);
  }

  .control-button--md {
    min-height: var(--vellum-control-default);
    padding-inline: 0.9rem;
    font-size: var(--vellum-text-body);
  }

  .control-button--ghost {
    color: color-mix(in oklab, var(--color-base-content) 64%, transparent);
    background: transparent;
  }

  .control-button--ghost:hover,
  .control-button--ghost.is-active {
    color: var(--color-base-content);
  }

  .control-button--ghost.is-active {
    color: var(--color-primary);
  }

  .control-button--primary {
    color: var(--color-primary-content);
    background:
      linear-gradient(180deg, color-mix(in oklab, white 14%, transparent), transparent 48%),
      var(--color-primary);
    box-shadow:
      inset 0 1px 0 color-mix(in oklab, white 34%, transparent),
      inset 0 -1px 0 color-mix(in oklab, var(--color-neutral) 16%, transparent),
      0 8px 18px -14px color-mix(in oklab, var(--color-primary) 72%, transparent);
  }

  .control-button--primary:hover {
    background: color-mix(in oklab, var(--color-primary) 86%, white);
  }

  .control-button--soft {
    color: var(--color-base-content);
  }

  .control-button--danger {
    color: var(--color-error);
    background: color-mix(in oklab, var(--color-error) 10%, transparent);
  }

  .control-button:disabled {
    cursor: not-allowed;
    opacity: 0.38;
  }
</style>

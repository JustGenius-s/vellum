<script lang="ts">
  import { ChevronDown } from "lucide-svelte";
  import type { Snippet } from "svelte";

  let {
    value,
    label,
    onchange,
    children,
  }: {
    value: string | number;
    label: string;
    onchange?: (value: string) => void;
    children: Snippet;
  } = $props();
</script>

<span class="select-shell ui-glass-control">
  <select
    {value}
    aria-label={label}
    onchange={(event) => onchange?.(event.currentTarget.value)}
  >
    {@render children()}
  </select>
  <ChevronDown class="ui-icon ui-icon--sm" aria-hidden="true" />
</span>

<style>
  .select-shell {
    position: relative;
    display: inline-flex;
    align-items: center;
    min-width: 8rem;
    border-radius: var(--vellum-radius-control);
  }

  select {
    width: 100%;
    min-height: var(--vellum-control-default);
    appearance: none;
    border: 0;
    outline: 0;
    color: var(--color-base-content);
    background: transparent;
    padding: 0 2rem 0 0.75rem;
    font: inherit;
    font-size: var(--vellum-text-ui);
  }

  :global(.select-shell svg) {
    position: absolute;
    right: 0.65rem;
    pointer-events: none;
    color: color-mix(in oklab, var(--color-base-content) 48%, transparent);
  }

  .select-shell:focus-within {
    box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--color-primary) 55%, transparent);
  }
</style>

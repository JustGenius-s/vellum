<script lang="ts">
  import type { ComponentType } from "svelte";
  import { press } from "$lib/motion/actions";
  import SharedHighlight from "./SharedHighlight.svelte";

  export interface SegmentOption {
    value: string;
    label: string;
    icon?: ComponentType;
    count?: number;
  }

  let {
    value,
    options,
    label,
    variant = "pill",
    onchange,
  }: {
    value: string;
    options: SegmentOption[];
    label: string;
    variant?: "pill" | "tab" | "card";
    onchange: (value: string) => void;
  } = $props();

  let container = $state<HTMLDivElement>();
</script>

<div
  bind:this={container}
  class="segment-control segment-control--{variant} ui-glass-control"
  role={variant === "tab" ? "tablist" : "group"}
  aria-label={label}
  style={`--segment-count: ${options.length}`}
>
  <SharedHighlight {container} selector='[data-active="true"]' dependency={value} inset={3} />
  {#each options as option}
    <button
      use:press
      type="button"
      class="segment-option segment-option--{variant} ui-glass-hover {value === option.value ? 'is-active' : ''}"
      role={variant === "tab" ? "tab" : undefined}
      aria-selected={variant === "tab" ? value === option.value : undefined}
      aria-pressed={variant !== "tab" ? value === option.value : undefined}
      onclick={() => onchange(option.value)}
      data-segment-value={option.value}
      data-active={value === option.value ? "true" : undefined}
    >
      {#if option.icon}
        <option.icon class="ui-icon ui-icon--sm" />
      {/if}
      <span>{option.label}</span>
      {#if option.count != null}
        <span class="segment-count tabular-nums">{option.count}</span>
      {/if}
    </button>
  {/each}
</div>

<style>
  .segment-control {
    position: relative;
    display: flex;
    gap: 0.25rem;
    padding: 0.2rem;
    border-radius: var(--vellum-radius-md);
  }

  .segment-control--tab,
  .segment-control--card {
    display: grid;
    grid-template-columns: repeat(var(--segment-count, 2), minmax(0, 1fr));
  }

  .segment-option {
    position: relative;
    z-index: 1;
    display: inline-flex;
    min-height: var(--vellum-control-compact);
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    border: 0;
    border-radius: var(--vellum-radius-pill);
    padding-inline: 0.625rem;
    color: color-mix(in oklab, var(--color-base-content) 52%, transparent);
    background: transparent;
    font: inherit;
    font-size: var(--vellum-text-caption);
    font-weight: 620;
  }

  .segment-option--tab {
    border-radius: var(--vellum-radius-control);
  }

  .segment-option--card {
    min-height: 5.5rem;
    flex-direction: column;
    align-items: flex-start;
    border-radius: var(--vellum-radius-md);
    padding: 0.875rem;
  }

  .segment-option.is-active {
    color: var(--color-primary);
  }

  .segment-count {
    color: color-mix(in oklab, currentColor 70%, transparent);
  }
</style>

<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLInputAttributes } from "svelte/elements";

  let {
    value = $bindable(""),
    input = $bindable(),
    placeholder = "",
    label,
    size = "md",
    type = "text",
    controls,
    activedescendant,
    autocomplete,
    leading,
    trailing,
    onkeydown,
    onblur,
  }: {
    value?: string;
    input?: HTMLInputElement;
    placeholder?: string;
    label: string;
    size?: "sm" | "md" | "lg";
    type?: "text" | "search";
    controls?: string;
    activedescendant?: string;
    autocomplete?: HTMLInputAttributes["autocomplete"];
    leading?: Snippet;
    trailing?: Snippet;
    onkeydown?: (event: KeyboardEvent) => void;
    onblur?: (event: FocusEvent) => void;
  } = $props();
</script>

<label
  class="text-field ui-input-field ui-glass-control"
  class:ui-input-field--relaxed={size !== "sm"}
  class:text-field--lg={size === "lg"}
>
  {#if leading}{@render leading()}{/if}
  <input
    bind:this={input}
    bind:value
    {type}
    {placeholder}
    aria-label={label}
    aria-controls={controls}
    aria-activedescendant={activedescendant}
    {autocomplete}
    class="ui-input-element"
    {onkeydown}
    {onblur}
  />
  {#if trailing}{@render trailing()}{/if}
</label>

<style>
  .text-field--lg {
    min-height: 4rem;
    border-radius: var(--vellum-radius-lg);
    padding-inline: 0.75rem;
  }
</style>

<script lang="ts">
  import type { Snippet } from "svelte";
  import { press } from "$lib/motion/actions";

  let {
    variant = "default",
    disabled = false,
    onclick,
    leading,
    children,
  }: {
    variant?: "default" | "danger";
    disabled?: boolean;
    onclick?: (event: MouseEvent) => void;
    leading?: Snippet;
    children: Snippet;
  } = $props();
</script>

<button
  use:press
  type="button"
  role="menuitem"
  class="ui-menu-item {variant === 'danger' ? 'ui-menu-item--danger' : ''}"
  {disabled}
  {onclick}
>
  {#if leading}{@render leading()}{/if}
  {@render children()}
</button>

<script lang="ts">
  import type { Snippet } from "svelte";
  import { press } from "$lib/motion/actions";

  let {
    selected = false,
    motionItem = false,
    title,
    onclick,
    children,
  }: {
    selected?: boolean;
    motionItem?: boolean;
    title?: string;
    onclick?: (event: MouseEvent) => void;
    children: Snippet;
  } = $props();
</script>

<button
  use:press
  type="button"
  class="ui-list-row ui-interactive"
  aria-current={selected ? "page" : undefined}
  data-motion-item={motionItem ? "" : undefined}
  {title}
  {onclick}
>
  {@render children()}
</button>

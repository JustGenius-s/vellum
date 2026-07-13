<script lang="ts">
  import type { Snippet } from "svelte";
  import { press } from "$lib/motion/actions";
  import { flipLayout } from "$lib/motion/flip";

  let {
    selected = false,
    selectionMode = "page",
    density = "default",
    role,
    indent = 0,
    ariaLevel,
    ariaExpanded,
    motionItem = false,
    motionDependency,
    highlightTarget = false,
    id,
    class: className = "",
    title,
    onclick,
    onmouseenter,
    oncontextmenu,
    children,
  }: {
    selected?: boolean;
    selectionMode?: "page" | "selected";
    density?: "compact" | "default" | "relaxed";
    role?: "option" | "treeitem";
    indent?: number;
    ariaLevel?: number;
    ariaExpanded?: boolean;
    motionItem?: boolean;
    motionDependency?: unknown;
    highlightTarget?: boolean;
    id?: string;
    class?: string;
    title?: string;
    onclick?: (event: MouseEvent) => void;
    onmouseenter?: (event: MouseEvent) => void;
    oncontextmenu?: (event: MouseEvent) => void;
    children: Snippet;
  } = $props();
</script>

<button
  use:press
  use:flipLayout={motionDependency}
  type="button"
  {id}
  {role}
  class="ui-list-row ui-list-row--{density} ui-interactive {className}"
  style:padding-left={indent ? `${indent}px` : undefined}
  aria-current={selectionMode === "page" && selected ? "page" : undefined}
  aria-selected={selectionMode === "selected" ? selected : undefined}
  aria-level={role === "treeitem" ? ariaLevel : undefined}
  aria-expanded={ariaExpanded}
  data-motion-item={motionItem ? "" : undefined}
  data-highlight-target={highlightTarget ? "true" : undefined}
  {title}
  {onclick}
  {onmouseenter}
  {oncontextmenu}
>
  {@render children()}
</button>

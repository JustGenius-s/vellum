<script lang="ts">
  import type { Snippet } from "svelte";
  import { surfaceEnter } from "$lib/motion/actions";

  let {
    open,
    x,
    y,
    label,
    onclose,
    children,
  }: {
    open: boolean;
    x: number;
    y: number;
    label: string;
    onclose: () => void;
    children: Snippet;
  } = $props();

  let menu = $state<HTMLElement>();
  let restoreTarget: HTMLElement | null = null;

  $effect(() => {
    if (!open) {
      restoreTarget?.focus();
      restoreTarget = null;
      return;
    }
    restoreTarget ??= document.activeElement as HTMLElement | null;
    if (!menu) return;
    requestAnimationFrame(() => {
      menu?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    });
  });

  function pointerDown(event: PointerEvent) {
    if (open && menu && !menu.contains(event.target as Node)) onclose();
  }

  function keydown(event: KeyboardEvent) {
    if (!open) return;
    if (event.key === "Escape") {
      onclose();
      return;
    }
    if (!menu || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const items = Array.from(
      menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'),
    );
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : event.key === "ArrowDown"
            ? (current + 1) % items.length
            : (current - 1 + items.length) % items.length;
    items[next]?.focus();
  }
</script>

<svelte:window onpointerdown={pointerDown} onkeydown={keydown} />

{#if open}
  <div
    class="context-layer"
    style={`left: min(${x}px, calc(100vw - 12rem)); top: min(${y}px, calc(100vh - 14rem))`}
  >
    <div
      use:surfaceEnter={{ y: 6, scale: 0.98 }}
      bind:this={menu}
      class="context-menu ui-glass-floating"
      role="menu"
      tabindex="-1"
      aria-label={label}
      oncontextmenu={(event) => event.preventDefault()}
    >
      {@render children()}
    </div>
  </div>
{/if}

<style>
  .context-layer {
    position: fixed;
    z-index: 80;
  }

  .context-menu {
    min-width: 11rem;
    border-radius: var(--vellum-radius-lg);
    padding: 0.45rem;
  }
</style>

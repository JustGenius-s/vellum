<script lang="ts">
  import type { Snippet } from "svelte";
  import { animateExit, surfaceEnter } from "$lib/motion/actions";
  import Scrim from "./Scrim.svelte";

  let {
    open,
    label,
    onclose,
    children,
  }: {
    open: boolean;
    label: string;
    onclose: () => void;
    children: Snippet;
  } = $props();

  let panel = $state<HTMLElement>();
  let visible = $state(false);

  $effect(() => {
    if (open) {
      visible = true;
      return;
    }
    if (visible && panel) {
      let cancelled = false;
      void animateExit(panel, { y: 8 }).then(() => {
        if (!cancelled) visible = false;
      });
      return () => {
        cancelled = true;
      };
    }
  });

  $effect(() => {
    if (!visible || !panel) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusable = panel.querySelector<HTMLElement>(
      "input, button, select, textarea, [tabindex]:not([tabindex='-1'])",
    );
    requestAnimationFrame(() => focusable?.focus());
    return () => previous?.focus();
  });

  function onKeydown(event: KeyboardEvent) {
    if (open && event.key === "Escape") {
      event.preventDefault();
      onclose();
      return;
    }
    if (!open || event.key !== "Tab" || !panel) return;
    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>(
        "input, button, select, textarea, [tabindex]:not([tabindex='-1'])",
      ),
    ).filter((element) => !element.hasAttribute("disabled"));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if visible}
  <div class="dialog-layer" role="presentation">
    <Scrim label={`Close ${label}`} onclick={onclose} />
    <div
      use:surfaceEnter={{ y: 18, scale: 0.985 }}
      bind:this={panel}
      class="dialog-surface ui-glass-floating"
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      {@render children()}
    </div>
  </div>
{/if}

<style>
  .dialog-layer {
    position: fixed;
    inset: 0;
    z-index: 70;
    display: grid;
    place-items: start center;
    padding: min(11dvh, 6rem) 0.5rem 0.5rem;
  }

  .dialog-surface {
    position: relative;
    z-index: 1;
    width: min(42rem, calc(100vw - 1rem));
    max-height: min(40rem, calc(100dvh - 1rem));
    overflow: hidden;
    border-radius: var(--vellum-radius-floating);
  }
</style>

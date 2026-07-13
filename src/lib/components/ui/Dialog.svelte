<script lang="ts">
  import type { Snippet } from "svelte";
  import { surfaceEnter } from "$lib/motion/actions";

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

  $effect(() => {
    if (!open || !panel) return;
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
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
  <div class="dialog-layer" role="presentation">
    <button
      type="button"
      class="dialog-backdrop"
      aria-label={`Close ${label}`}
      onclick={onclose}
    ></button>
    <div
      use:surfaceEnter={{ y: 18, scale: 0.985 }}
      bind:this={panel}
      class="dialog-surface"
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

  .dialog-backdrop {
    position: absolute;
    inset: 0;
    border: 0;
    background: color-mix(in oklab, var(--color-neutral) 52%, transparent);
    backdrop-filter: blur(4px);
  }

  .dialog-surface {
    position: relative;
    z-index: 1;
    width: min(42rem, calc(100vw - 1rem));
    max-height: min(40rem, calc(100dvh - 1rem));
    overflow: hidden;
    border-radius: 1.5rem;
    background: var(--vellum-surface-overlay);
    box-shadow: var(--vellum-shadow-overlay);
    backdrop-filter: blur(28px) saturate(1.2);
  }
</style>

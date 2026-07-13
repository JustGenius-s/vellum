<script lang="ts">
  import { animate } from "motion";
  import type { Snippet } from "svelte";
  import { motionSprings, prefersReducedMotion } from "$lib/motion/presets";

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
  let startX = 0;
  let startTime = 0;
  let tracking = false;
  let dragging = false;

  $effect(() => {
    if (!open || !panel) return;
    const control = animate(
      panel,
      prefersReducedMotion()
        ? { opacity: [0, 1] }
        : { opacity: [0.8, 1], transform: ["translateX(-24px)", "translateX(0)"] },
      prefersReducedMotion() ? { duration: 0.08 } : motionSprings.surface,
    );
    return () => control.stop();
  });

  function pointerDown(event: PointerEvent) {
    if (!panel) return;
    startX = event.clientX;
    startTime = performance.now();
    tracking = true;
    dragging = false;
  }

  function pointerMove(event: PointerEvent) {
    if (!tracking || !panel) return;
    const offset = Math.min(0, event.clientX - startX);
    if (!dragging && Math.abs(offset) > 6) {
      dragging = true;
      panel.setPointerCapture(event.pointerId);
    }
    if (!dragging) return;
    panel.style.transform = `translateX(${offset}px)`;
  }

  function pointerUp(event: PointerEvent) {
    if (!tracking || !panel) return;
    tracking = false;
    if (!dragging) return;
    dragging = false;
    const offset = Math.min(0, event.clientX - startX);
    const velocity = offset / Math.max(1, performance.now() - startTime);
    if (offset < -panel.clientWidth * 0.32 || velocity < -0.55) {
      onclose();
      return;
    }
    animate(panel, { transform: "translateX(0)" }, motionSprings.surface);
  }

  function onKeydown(event: KeyboardEvent) {
    if (open && event.key === "Escape") onclose();
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
  <div class="drawer-layer">
    <button
      type="button"
      class="drawer-backdrop"
      aria-label={`Close ${label}`}
      onclick={onclose}
    ></button>
    <aside
      bind:this={panel}
      class="drawer-panel ui-glass-floating"
      aria-label={label}
      onpointerdown={pointerDown}
      onpointermove={pointerMove}
      onpointerup={pointerUp}
      onpointercancel={pointerUp}
    >
      {@render children()}
    </aside>
  </div>
{/if}

<style>
  .drawer-layer {
    position: fixed;
    inset: 0;
    z-index: 60;
  }

  .drawer-backdrop {
    position: absolute;
    inset: 0;
    border: 0;
    background: color-mix(in oklab, var(--color-neutral) 38%, transparent);
    -webkit-backdrop-filter: blur(6px) saturate(0.86);
    backdrop-filter: blur(6px) saturate(0.86);
  }

  .drawer-panel {
    position: relative;
    width: min(84vw, 20rem);
    height: 100%;
    overflow: hidden;
    touch-action: pan-y;
  }
</style>

<script lang="ts">
  import { animate } from "motion";
  import type { Snippet } from "svelte";
  import { animateExit } from "$lib/motion/actions";
  import {
    motionDurations,
    motionSprings,
    prefersReducedMotion,
  } from "$lib/motion/presets";
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
  let startX = 0;
  let startTime = 0;
  let tracking = false;
  let dragging = false;

  $effect(() => {
    if (open) {
      visible = true;
      return;
    }
    if (visible && panel) {
      let cancelled = false;
      void animateExit(panel, { x: -panel.clientWidth }).then(() => {
        if (!cancelled) visible = false;
      });
      return () => {
        cancelled = true;
      };
    }
  });

  $effect(() => {
    if (!visible || !panel || !open) return;
    const control = animate(
      panel,
      prefersReducedMotion()
        ? { opacity: [0, 1] }
        : { opacity: [0.8, 1], transform: ["translateX(-24px)", "translateX(0)"] },
      prefersReducedMotion()
        ? { duration: motionDurations.reduced }
        : motionSprings.surface,
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

{#if visible}
  <div class="drawer-layer">
    <Scrim label={`Close ${label}`} onclick={onclose} />
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

  .drawer-panel {
    position: relative;
    width: min(84vw, 20rem);
    height: 100%;
    overflow: hidden;
    touch-action: pan-y;
  }
</style>

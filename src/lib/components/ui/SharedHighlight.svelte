<script lang="ts">
  import { animate } from "motion";
  import {
    motionDurations,
    motionSprings,
    prefersReducedMotion,
  } from "$lib/motion/presets";

  let {
    container,
    selector,
    dependency,
    inset = 0,
  }: {
    container?: HTMLElement;
    selector: string;
    dependency?: unknown;
    inset?: number;
  } = $props();

  let indicator = $state<HTMLSpanElement>();

  $effect(() => {
    dependency;
    if (!container || !indicator) return;
    let frame = 0;
    const position = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
      const target = container?.querySelector<HTMLElement>(selector);
      if (!target || !container || !indicator) {
        animate(
          indicator!,
          { opacity: 0 },
          { duration: motionDurations.micro },
        );
        return;
      }

      const parentRect = container.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      const x = rect.left - parentRect.left + container.scrollLeft + inset;
      const y = rect.top - parentRect.top + container.scrollTop + inset;
      const width = Math.max(1, rect.width - inset * 2);
      const height = Math.max(1, rect.height - inset * 2);
      animate(
        indicator,
        {
          opacity: 1,
          transform: `translate(${x}px, ${y}px) scale(${width}, ${height})`,
        },
        prefersReducedMotion()
          ? { duration: motionDurations.instant }
          : motionSprings.surface,
      );
      });
    };
    const observer = new ResizeObserver(position);
    observer.observe(container);
    container.addEventListener("scroll", position, { passive: true });
    position();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      container?.removeEventListener("scroll", position);
    };
  });
</script>

<span bind:this={indicator} class="shared-highlight" aria-hidden="true"></span>

<style>
  .shared-highlight {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 0;
    width: 1px;
    height: 1px;
    border-radius: var(--vellum-highlight-unit-radius);
    background:
      linear-gradient(
        180deg,
        color-mix(in oklab, var(--vellum-glass-specular) 28%, transparent),
        transparent 1px
      ),
      color-mix(in oklab, var(--color-primary) 12%, transparent);
    box-shadow: inset 0 0 0 0.03rem
      color-mix(in oklab, var(--color-primary) 12%, transparent);
    opacity: 0;
    pointer-events: none;
    transform-origin: top left;
  }
</style>

<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    text,
    placement = "top",
    children,
  }: {
    text: string;
    placement?: "top" | "right";
    children: Snippet;
  } = $props();
</script>

<span class="tooltip-anchor tooltip-anchor--{placement}" data-tooltip={text}>
  {@render children()}
</span>

<style>
  .tooltip-anchor {
    position: relative;
    display: inline-flex;
  }

  .tooltip-anchor::after {
    position: absolute;
    z-index: 80;
    width: max-content;
    max-width: 14rem;
    padding: 0.35rem 0.55rem;
    border-radius: 0.5rem;
    color: var(--color-base-content);
    background:
      linear-gradient(180deg, color-mix(in oklab, var(--vellum-glass-specular) 32%, transparent), transparent 1px),
      var(--vellum-surface-overlay);
    box-shadow:
      inset 0 1px 0 var(--vellum-glass-edge),
      inset 0 0 0 1px var(--vellum-glass-rim),
      var(--vellum-shadow-overlay);
    -webkit-backdrop-filter: blur(var(--vellum-blur-floating)) saturate(1.35);
    backdrop-filter: blur(var(--vellum-blur-floating)) saturate(1.35);
    content: attr(data-tooltip);
    font-size: var(--vellum-text-caption);
    line-height: 1.3;
    opacity: 0;
    pointer-events: none;
    transform: translateY(4px);
    transition:
      opacity var(--vellum-motion-fast) var(--vellum-ease-out),
      transform var(--vellum-motion-fast) var(--vellum-ease-out);
  }

  .tooltip-anchor--top::after {
    bottom: calc(100% + 0.5rem);
    left: 50%;
    transform: translate(-50%, 4px);
  }

  .tooltip-anchor--right::after {
    top: 50%;
    left: calc(100% + 0.5rem);
    transform: translate(4px, -50%);
  }

  .tooltip-anchor:hover::after,
  .tooltip-anchor:focus-within::after {
    opacity: 1;
  }

  .tooltip-anchor--top:hover::after,
  .tooltip-anchor--top:focus-within::after {
    transform: translate(-50%, 0);
  }

  .tooltip-anchor--right:hover::after,
  .tooltip-anchor--right:focus-within::after {
    transform: translate(0, -50%);
  }
</style>

<script lang="ts">
  import { CircleAlert, FileText, LoaderCircle } from "lucide-svelte";
  import EmptyState from "$lib/components/ui/EmptyState.svelte";
  import Spinner from "$lib/components/ui/Spinner.svelte";
  import { getVault, getUI } from "$lib/stores.svelte";
  import {
    crossfadeEnter,
    crossfadeExit,
    surfaceEnter,
  } from "$lib/motion/actions";

  const vault = getVault();
  const ui = getUI();

  let scrollEl = $state<HTMLDivElement>();
  let applyingScroll = false;
  let currentSvg = $state("");
  let previousSvg = $state("");

  $effect(() => {
    const nextSvg = vault.svg;
    if (nextSvg === currentSvg) return;
    previousSvg = currentSvg;
    currentSvg = nextSvg;
    const timer = setTimeout(() => {
      previousSvg = "";
    }, 240);
    return () => clearTimeout(timer);
  });

  function onScroll() {
    if (!scrollEl || applyingScroll) return;
    const max = scrollEl.scrollHeight - scrollEl.clientHeight;
    const ratio = max > 0 ? scrollEl.scrollTop / max : 0;
    ui.scrollSource = "preview";
    ui.scrollRatio = ratio;
  }

  // Sync scroll from editor
  $effect(() => {
    const ratio = ui.scrollRatio;
    const source = ui.scrollSource;
    if (!scrollEl || source !== "editor") return;
    applyingScroll = true;
    const max = scrollEl.scrollHeight - scrollEl.clientHeight;
    scrollEl.scrollTop = max > 0 ? ratio * max : 0;
    requestAnimationFrame(() => {
      applyingScroll = false;
    });
  });
</script>

<div class="preview-shell ui-surface-chrome relative flex h-full flex-col overflow-hidden">
  {#if vault.compilePhase !== "idle"}
    <div
      use:surfaceEnter={{ y: -6, scale: 0.99 }}
      class="compile-status ui-glass-floating absolute right-4 top-4 z-10 flex h-8 items-center gap-2 rounded-full px-3 text-xs"
      role="status"
      aria-live="polite"
    >
      <Spinner size="sm" label="Compiling" />
      {vault.compilePhase === "pending" ? "Updating preview" : "Compiling"}
    </div>
  {/if}

  <div
    class="min-h-0 flex-1 overflow-auto"
    bind:this={scrollEl}
    onscroll={onScroll}
  >
    <div class="preview-canvas relative flex min-h-full flex-col items-center p-5 sm:p-8">
      {#if currentSvg}
        <div class="preview-stack relative w-full max-w-2xl">
          {#if previousSvg}
            {#key previousSvg}
              <div use:crossfadeExit class="absolute inset-x-0 top-0 z-0">
                <div class="ui-paper preview-svg relative w-full overflow-hidden rounded-md">
                  {@html previousSvg}
                </div>
              </div>
            {/key}
          {/if}
          {#key currentSvg}
            <div use:crossfadeEnter={{ y: 5 }} class="relative z-1">
              <div class="ui-paper preview-svg relative w-full overflow-hidden rounded-md">
                {@html currentSvg}
              </div>
            </div>
          {/key}
        </div>
      {:else if vault.compilePhase !== "idle"}
        <div class="ui-paper preview-state w-full max-w-2xl rounded-md" aria-busy="true">
          <EmptyState
            title="Preparing preview"
            description="Vellum is compiling the current document."
          >
            {#snippet icon()}
              <LoaderCircle class="ui-icon ui-icon--lg animate-spin" />
            {/snippet}
          </EmptyState>
        </div>
      {:else if vault.diagnostics.some((d) => d.severity === "error")}
        <div class="ui-paper preview-state w-full max-w-2xl rounded-md">
          <EmptyState
            title="Preview unavailable"
            description="Resolve the compilation errors in Problems to render this document."
          >
            {#snippet icon()}
              <CircleAlert class="ui-icon ui-icon--lg text-error" />
            {/snippet}
          </EmptyState>
        </div>
      {:else}
        <div class="ui-paper preview-state w-full max-w-2xl rounded-md">
          <EmptyState
            title="Nothing to preview"
            description="Open a Typst document to render its pages here."
          >
            {#snippet icon()}
              <FileText class="ui-icon ui-icon--lg" />
            {/snippet}
          </EmptyState>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .preview-shell {
    isolation: isolate;
  }

  .preview-canvas {
    background:
      linear-gradient(
        145deg,
        color-mix(in oklab, var(--vellum-glass-specular) 16%, transparent),
        transparent 28%
      ),
      radial-gradient(
        circle at 50% 0%,
        color-mix(in oklab, var(--color-primary) 7%, transparent),
        transparent 32rem
      ),
      linear-gradient(
        color-mix(in oklab, var(--vellum-surface-chrome) 52%, transparent),
        transparent 11rem
      ),
      color-mix(in oklab, var(--vellum-surface-canvas) 48%, transparent);
  }

  .preview-canvas::before {
    position: absolute;
    top: 0;
    left: 50%;
    width: min(28rem, 54%);
    height: 8rem;
    pointer-events: none;
    background: radial-gradient(
      ellipse at top,
      color-mix(in oklab, var(--color-primary) 5%, transparent),
      transparent 68%
    );
    content: "";
    transform: translateX(-50%);
  }

  .preview-state {
    position: relative;
    min-height: 18rem;
    overflow: hidden;
    background: color-mix(in oklab, var(--vellum-surface-paper) 96%, transparent);
    box-shadow: var(--vellum-shadow-paper);
  }

  .preview-state[aria-busy="true"]::before {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(
      105deg,
      transparent 34%,
      color-mix(in oklab, var(--color-primary) 5%, white 2%) 48%,
      transparent 62%
    );
    content: "";
    transform: translateX(-100%);
    animation: preview-shimmer 1.8s var(--vellum-ease-out) infinite;
  }

  .preview-svg {
    z-index: 1;
    box-shadow: var(--vellum-shadow-paper);
    transition:
      transform var(--vellum-motion-normal) var(--vellum-ease-out),
      box-shadow var(--vellum-motion-normal) var(--vellum-ease-out);
  }

  .preview-svg:hover {
    transform: translateY(-1px);
    box-shadow:
      var(--vellum-shadow-paper),
      0 18px 42px color-mix(in oklab, var(--vellum-surface-app) 16%, transparent);
  }

  .preview-svg::before {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    border-radius: inherit;
    background: linear-gradient(
      135deg,
      color-mix(in oklab, white 3%, transparent),
      transparent 22%
    );
    content: "";
  }

  .preview-svg :global(svg) {
    width: 100%;
    height: auto;
    display: block;
    background: var(--vellum-surface-paper);
  }

  @keyframes preview-shimmer {
    to {
      transform: translateX(100%);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .preview-state[aria-busy="true"]::before {
      animation: none;
    }

    .preview-svg {
      transition: none;
    }

    .preview-svg:hover {
      transform: none;
    }
  }
</style>

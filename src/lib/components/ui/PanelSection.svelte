<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    kicker,
    title,
    meta,
    leading,
    toolbar,
    compact = false,
  }: {
    kicker?: string;
    title: string;
    meta?: string;
    leading?: Snippet;
    toolbar?: Snippet;
    compact?: boolean;
  } = $props();
</script>

<header class="panel-section" class:panel-section--compact={compact}>
  <div class="panel-section__heading">
    {#if leading}{@render leading()}{/if}
    <div class="min-w-0 flex-1">
      {#if kicker}<span class="ui-kicker">{kicker}</span>{/if}
      <div class="panel-section__title-line">
        <h2>{title}</h2>
        {#if meta}<span class="ui-caption ui-text-tertiary">{meta}</span>{/if}
      </div>
    </div>
  </div>
  {#if toolbar}
    <div class="panel-section__toolbar">{@render toolbar()}</div>
  {/if}
</header>

<style>
  .panel-section {
    flex: none;
    padding: 1.125rem 1rem 0.875rem;
  }

  .panel-section--compact {
    padding: 0.75rem;
  }

  .panel-section__heading,
  .panel-section__title-line {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .panel-section__title-line {
    justify-content: space-between;
    margin-top: 0.25rem;
  }

  h2 {
    min-width: 0;
    overflow: hidden;
    font-size: var(--vellum-text-title);
    font-weight: 650;
    letter-spacing: -0.02em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .panel-section__toolbar {
    margin-top: 0.875rem;
  }
</style>

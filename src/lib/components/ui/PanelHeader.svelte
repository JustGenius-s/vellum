<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    title,
    page = false,
    leading,
    actions,
    meta,
  }: {
    title: string;
    page?: boolean;
    leading?: Snippet;
    actions?: Snippet;
    meta?: Snippet;
  } = $props();
</script>

<header class={page ? "ui-page-header" : "ui-panel-header"}>
  {#if leading}{@render leading()}{/if}
  {#if page}
    <h1 class="ui-page-title truncate">{title}</h1>
  {:else}
    <span class="ui-panel-title truncate">{title}</span>
  {/if}
  {#if meta}
    <div class="ui-caption ui-text-tertiary shrink-0">{@render meta()}</div>
  {/if}
  {#if actions}
    <div class="flex shrink-0 items-center gap-1">{@render actions()}</div>
  {/if}
</header>

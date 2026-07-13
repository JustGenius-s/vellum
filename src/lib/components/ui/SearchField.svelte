<script lang="ts">
  import { Search } from "lucide-svelte";
  import Spinner from "./Spinner.svelte";

  let {
    value = $bindable(""),
    placeholder,
    label = placeholder,
    input,
    loading = false,
    count,
  }: {
    value?: string;
    placeholder: string;
    label?: string;
    input?: HTMLInputElement;
    loading?: boolean;
    count?: number;
  } = $props();
</script>

<label class="ui-search-field">
  {#if loading}
    <Spinner size="sm" />
  {:else}
    <Search class="ui-icon ui-icon--sm ui-text-muted" />
  {/if}
  <input
    bind:this={input}
    bind:value
    type="search"
    class="min-w-0 grow bg-transparent text-xs outline-none"
    {placeholder}
    aria-label={label}
  />
  {#if count != null && count > 0}
    <span class="ui-caption ui-text-muted tabular-nums">{count}</span>
  {/if}
</label>

<script lang="ts">
  import { Search } from "lucide-svelte";
  import Spinner from "./Spinner.svelte";
  import TextField from "./TextField.svelte";

  let {
    value = $bindable(""),
    placeholder,
    label = placeholder,
    input = $bindable(),
    loading = false,
    count,
    size = "sm",
  }: {
    value?: string;
    placeholder: string;
    label?: string;
    input?: HTMLInputElement;
    loading?: boolean;
    count?: number;
    size?: "sm" | "md" | "lg";
  } = $props();
</script>

<TextField bind:value bind:input {placeholder} {label} {size} type="search">
  {#snippet leading()}
    {#if loading}
      <Spinner size="sm" />
    {:else}
      <Search class="ui-icon ui-icon--sm ui-text-muted" />
    {/if}
  {/snippet}
  {#snippet trailing()}
    {#if count != null && count > 0}
      <span class="ui-caption ui-text-muted tabular-nums">{count}</span>
    {/if}
  {/snippet}
</TextField>

<script lang="ts">
  let {
    label,
    onclick,
  }: {
    label: string;
    onclick: () => void;
  } = $props();
</script>

<button type="button" class="scrim ui-scrim" aria-label={label} {onclick}></button>

<style>
  .scrim {
    position: absolute;
    inset: 0;
  }
</style>

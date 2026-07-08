<script lang="ts">
  import { getVault } from "$lib/stores.svelte";
  const vault = getVault();
</script>

<div class="flex flex-col h-full overflow-hidden">
  <div class="flex-1 overflow-auto">
    <div class="flex flex-col items-center p-4 bg-base-100 min-h-full">
      {#if vault.svg}
        <div class="w-full max-w-2xl shadow-md rounded overflow-hidden bg-white">
          {@html vault.svg}
        </div>
      {:else}
        <p class="text-sm text-base-content/40 py-8">No preview</p>
      {/if}
    </div>
  </div>
</div>
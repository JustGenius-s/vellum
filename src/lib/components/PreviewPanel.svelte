<script lang="ts">
  let { svg = "" }: { svg: string } = $props();
</script>

<div class="flex flex-col h-full overflow-hidden">
  <div class="flex items-center border-b border-base-300 bg-base-200/50 px-3 py-2">
    <span class="text-sm font-medium">Preview</span>
  </div>
  <div class="flex-1 overflow-auto">
    <div class="flex flex-col items-center p-4 bg-base-100 min-h-full">
      {#if svg}
        <div class="w-full max-w-2xl shadow-md rounded overflow-hidden bg-white">
          {@html svg}
        </div>
      {:else}
        <p class="text-sm text-base-content/40 py-8">No preview</p>
      {/if}
    </div>
  </div>
</div>
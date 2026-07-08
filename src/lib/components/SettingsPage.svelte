<script lang="ts">
  import { ArrowLeft } from "lucide-svelte";
  import { theme, ui } from "$lib/stores.svelte";
</script>

<div class="flex flex-col h-full overflow-hidden">
  <div class="flex items-center gap-3 border-b border-base-300 bg-base-200/50 px-4 py-2 shrink-0">
    <button class="btn btn-ghost btn-sm btn-square" onclick={() => (ui.currentView = "editor")} title="Back">
      <ArrowLeft size={18} />
    </button>
    <h1 class="text-lg font-semibold">Settings</h1>
  </div>

  <div class="flex-1 overflow-auto p-6 max-w-xl">
    <fieldset class="mb-6">
      <legend class="text-sm font-medium mb-2">Appearance</legend>
      <div class="flex gap-2">
        <button
          class="btn btn-sm flex-1 {theme.theme === 'light' ? 'btn-primary' : 'btn-outline'}"
          onclick={() => theme.applyTheme("light")}
        >
          Light
        </button>
        <button
          class="btn btn-sm flex-1 {theme.theme === 'dark' ? 'btn-primary' : 'btn-outline'}"
          onclick={() => theme.applyTheme("dark")}
        >
          Dark
        </button>
      </div>
    </fieldset>
  </div>
</div>
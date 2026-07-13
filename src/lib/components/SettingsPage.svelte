<script lang="ts">
  import { ArrowLeft, RotateCcw } from "lucide-svelte";
  import { getSettings, getTheme, getUI } from "$lib/stores.svelte";

  const theme = getTheme();
  const settings = getSettings();
  const ui = getUI();
</script>

<div class="flex h-full flex-col overflow-hidden">
  <header class="ui-panel-header h-12! shrink-0 bg-base-200/50 px-3">
    <button
      class="btn btn-ghost ui-icon-button"
      onclick={() => (ui.currentView = "editor")}
      aria-label="Back to editor"
    >
      <ArrowLeft class="ui-icon ui-icon--lg" />
    </button>
    <h1 class="min-w-0 flex-1 text-base font-semibold">Settings</h1>
    <button class="btn btn-ghost btn-sm gap-2" onclick={() => settings.resetEditor()}>
      <RotateCcw class="ui-icon ui-icon--sm" />
      Reset editor
    </button>
  </header>

  <div class="min-h-0 flex-1 overflow-y-auto">
    <div class="mx-auto w-full max-w-2xl divide-y divide-base-300 px-5 py-4 sm:px-8">
      <section class="grid gap-4 py-5 sm:grid-cols-[11rem_1fr]">
        <div>
          <h2 class="text-sm font-semibold">Appearance</h2>
          <p class="mt-1 text-xs leading-5 text-base-content/45">
            Application color scheme.
          </p>
        </div>
        <div class="join w-full self-start">
          <button
            class="btn btn-sm join-item flex-1 {theme.theme === 'light' ? 'btn-primary' : 'btn-outline'}"
            onclick={() => theme.applyTheme("light")}
          >
            Light
          </button>
          <button
            class="btn btn-sm join-item flex-1 {theme.theme === 'dark' ? 'btn-primary' : 'btn-outline'}"
            onclick={() => theme.applyTheme("dark")}
          >
            Dark
          </button>
        </div>
      </section>

      <section class="grid gap-5 py-5 sm:grid-cols-[11rem_1fr]">
        <div>
          <h2 class="text-sm font-semibold">Editor</h2>
          <p class="mt-1 text-xs leading-5 text-base-content/45">
            Reading and navigation behavior.
          </p>
        </div>
        <div class="space-y-4">
          <label class="block">
            <span class="mb-2 flex items-center justify-between text-xs font-medium">
              Font size
              <span class="font-mono text-base-content/50">
                {settings.editor.fontSize}px
              </span>
            </span>
            <input
              type="range"
              min="12"
              max="22"
              step="1"
              value={settings.editor.fontSize}
              class="range range-primary range-xs w-full"
              oninput={(event) =>
                settings.updateEditor({
                  fontSize: Number(event.currentTarget.value),
                })}
            />
          </label>

          <label class="flex min-h-10 items-center justify-between gap-4">
            <span>
              <span class="block text-xs font-medium">Line numbers</span>
              <span class="ui-caption text-base-content/45">
                Show the editor gutter.
              </span>
            </span>
            <input
              type="checkbox"
              class="toggle toggle-primary toggle-sm"
              checked={settings.editor.lineNumbers}
              onchange={(event) =>
                settings.updateEditor({
                  lineNumbers: event.currentTarget.checked,
                })}
            />
          </label>

          <label class="flex min-h-10 items-center justify-between gap-4">
            <span>
              <span class="block text-xs font-medium">Word wrap</span>
              <span class="ui-caption text-base-content/45">
                Wrap long lines to the editor width.
              </span>
            </span>
            <input
              type="checkbox"
              class="toggle toggle-primary toggle-sm"
              checked={settings.editor.wordWrap}
              onchange={(event) =>
                settings.updateEditor({
                  wordWrap: event.currentTarget.checked,
                })}
            />
          </label>
        </div>
      </section>

      <section class="grid gap-5 py-5 sm:grid-cols-[11rem_1fr]">
        <div>
          <h2 class="text-sm font-semibold">Files</h2>
          <p class="mt-1 text-xs leading-5 text-base-content/45">
            Control when edits reach disk.
          </p>
        </div>
        <div class="space-y-4">
          <label class="flex min-h-10 items-center justify-between gap-4">
            <span>
              <span class="block text-xs font-medium">Auto save</span>
              <span class="ui-caption text-base-content/45">
                Save after editing stops.
              </span>
            </span>
            <input
              type="checkbox"
              class="toggle toggle-primary toggle-sm"
              checked={settings.editor.autoSave}
              onchange={(event) =>
                settings.updateEditor({
                  autoSave: event.currentTarget.checked,
                })}
            />
          </label>

          {#if settings.editor.autoSave}
            <label class="flex items-center justify-between gap-4">
              <span class="text-xs font-medium">Auto-save delay</span>
              <select
                class="select select-bordered select-sm w-32"
                value={settings.editor.autoSaveDelayMs}
                onchange={(event) =>
                  settings.updateEditor({
                    autoSaveDelayMs: Number(event.currentTarget.value),
                  })}
              >
                <option value="1000">1 second</option>
                <option value="2000">2 seconds</option>
                <option value="5000">5 seconds</option>
              </select>
            </label>
          {/if}
        </div>
      </section>
    </div>
  </div>
</div>
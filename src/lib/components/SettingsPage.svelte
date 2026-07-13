<script lang="ts">
  import { ArrowLeft, Eye, Moon, RotateCcw, Save, Sun, Type } from "lucide-svelte";
  import { getSettings, getTheme, getUI } from "$lib/stores.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import IconButton from "$lib/components/ui/IconButton.svelte";
  import PanelHeader from "$lib/components/ui/PanelHeader.svelte";
  import Range from "$lib/components/ui/Range.svelte";
  import Select from "$lib/components/ui/Select.svelte";
  import Toggle from "$lib/components/ui/Toggle.svelte";

  const theme = getTheme();
  const settings = getSettings();
  const ui = getUI();
</script>

<div class="flex h-full flex-col overflow-hidden">
  <PanelHeader title="Settings" page>
    {#snippet leading()}
      <IconButton label="Back to editor" onclick={() => (ui.currentView = "editor")}>
        <ArrowLeft class="ui-icon ui-icon--lg" />
      </IconButton>
    {/snippet}
    {#snippet actions()}
      <Button size="sm" onclick={() => settings.resetEditor()}>
        <RotateCcw class="ui-icon ui-icon--sm" />
        Reset editor
      </Button>
    {/snippet}
  </PanelHeader>

  <div class="settings-canvas ui-surface-canvas min-h-0 flex-1 overflow-y-auto">
    <main class="mx-auto w-full max-w-5xl px-5 pb-28 pt-8 sm:px-8 sm:pb-28 sm:pt-12">
      <div class="settings-intro">
        <span class="console-kicker">Environment control</span>
        <h2 class="mt-2 max-w-xl text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
          Tune the space around your writing.
        </h2>
        <p class="ui-text-secondary mt-3 max-w-lg text-sm leading-6">
          Shape how Vellum looks, reads, and commits your work without leaving the document flow.
        </p>
      </div>

      <div class="settings-grid mt-10">
        <section class="control-zone appearance-zone" aria-labelledby="appearance-title">
          <div class="zone-heading">
            <span class="zone-icon"><Eye class="ui-icon" /></span>
            <div>
              <p class="zone-index">01 / Interface</p>
              <h3 id="appearance-title">Light field</h3>
            </div>
          </div>
          <p class="zone-description">Switch the visual atmosphere while preserving the same cyan signal layer.</p>
          <div class="theme-switch" aria-label="Application theme">
          <button
            class:active={theme.theme === "light"}
            class="theme-option ui-interactive"
            onclick={() => theme.applyTheme("light")}
            aria-pressed={theme.theme === "light"}
          >
            <Sun class="ui-icon" />
            <span>Light</span>
            <small>Ice</small>
          </button>
          <button
            class:active={theme.theme === "dark"}
            class="theme-option ui-interactive"
            onclick={() => theme.applyTheme("dark")}
            aria-pressed={theme.theme === "dark"}
          >
            <Moon class="ui-icon" />
            <span>Dark</span>
            <small>Void</small>
          </button>
        </div>
      </section>

        <section class="control-zone editor-zone" aria-labelledby="editor-title">
          <div class="zone-heading">
            <span class="zone-icon"><Type class="ui-icon" /></span>
            <div>
              <p class="zone-index">02 / Reading</p>
              <h3 id="editor-title">Editor optics</h3>
            </div>
          </div>
          <p class="zone-description">Calibrate type scale and the visual guides surrounding your text.</p>

          <label class="range-console">
            <span class="flex items-end justify-between gap-4">
              <span>
                <strong>Type scale</strong>
                <small>Editor font size</small>
              </span>
              <output>{settings.editor.fontSize}<span> px</span></output>
            </span>
            <Range
              min={12}
              max={22}
              step={1}
              value={settings.editor.fontSize}
              label="Editor font size"
              oninput={(value) =>
                settings.updateEditor({
                  fontSize: value,
                })}
            />
            <span class="range-limits"><span>12</span><span>22</span></span>
          </label>

          <div class="control-list">
            <label class="control-row">
              <span class="control-copy">
                <strong>Line coordinates</strong>
                <small>Keep line numbers visible beside the document.</small>
              </span>
              <Toggle
                label="Line coordinates"
                checked={settings.editor.lineNumbers}
                onchange={(checked) =>
                  settings.updateEditor({
                    lineNumbers: checked,
                  })}
              />
            </label>

            <label class="control-row">
              <span class="control-copy">
                <strong>Adaptive lines</strong>
                <small>Wrap long passages to the available reading width.</small>
              </span>
              <Toggle
                label="Adaptive lines"
                checked={settings.editor.wordWrap}
                onchange={(checked) =>
                  settings.updateEditor({
                    wordWrap: checked,
                  })}
              />
            </label>
          </div>
        </section>

        <section class="control-zone files-zone" aria-labelledby="files-title">
          <div class="zone-heading">
            <span class="zone-icon"><Save class="ui-icon" /></span>
            <div>
              <p class="zone-index">03 / Persistence</p>
              <h3 id="files-title">Write-through</h3>
            </div>
          </div>
          <p class="zone-description">Decide when the active draft crosses from memory to disk.</p>

          <div class="save-status">
            <span class:online={settings.editor.autoSave} class="status-signal" aria-hidden="true"></span>
            <span>
              <strong>{settings.editor.autoSave ? "Auto save active" : "Manual save"}</strong>
              <small>{settings.editor.autoSave ? "Changes are committed after a quiet interval." : "Changes wait for an explicit save command."}</small>
            </span>
            <Toggle
              label="Auto save"
              checked={settings.editor.autoSave}
              onchange={(checked) =>
                settings.updateEditor({
                  autoSave: checked,
                })}
            />
          </div>

          {#if settings.editor.autoSave}
            <label class="delay-control">
              <span>
                <strong>Quiet interval</strong>
                <small>Wait before writing edits to disk.</small>
              </span>
              <Select
                label="Quiet interval"
                value={settings.editor.autoSaveDelayMs}
                onchange={(value) =>
                  settings.updateEditor({
                    autoSaveDelayMs: Number(value),
                  })}
              >
                <option value="1000">1 second</option>
                <option value="2000">2 seconds</option>
                <option value="5000">5 seconds</option>
              </Select>
            </label>
          {/if}
        </section>
      </div>
    </main>
  </div>
</div>

<style>
  .settings-canvas {
    background:
      radial-gradient(circle at 82% 12%, color-mix(in oklab, var(--color-primary) 9%, transparent), transparent 24rem),
      radial-gradient(circle at 12% 78%, color-mix(in oklab, var(--color-primary) 4%, transparent), transparent 28rem),
      var(--vellum-surface-canvas);
  }

  .settings-intro {
    padding-left: clamp(0rem, 5vw, 3.5rem);
  }

  .console-kicker,
  .zone-index {
    color: var(--color-primary);
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.17em;
    text-transform: uppercase;
  }

  .settings-grid {
    display: grid;
    grid-template-columns: minmax(0, 0.78fr) minmax(0, 1.22fr);
    gap: 1rem;
  }

  .control-zone {
    border-radius: 1.25rem;
    background:
      linear-gradient(
        145deg,
        color-mix(in oklab, var(--vellum-surface-chrome) 74%, transparent),
        color-mix(in oklab, var(--vellum-surface-canvas) 46%, transparent)
      );
    padding: clamp(1.25rem, 3vw, 2rem);
    backdrop-filter: blur(22px) saturate(1.15);
  }

  .editor-zone {
    grid-row: span 2;
  }

  .zone-heading {
    display: flex;
    align-items: center;
    gap: 0.85rem;
  }

  .zone-heading h3 {
    margin-top: 0.25rem;
    font-size: 1.0625rem;
    font-weight: 650;
    letter-spacing: -0.025em;
  }

  .zone-icon {
    display: grid;
    width: 2.5rem;
    height: 2.5rem;
    place-items: center;
    border-radius: 0.8rem;
    background: color-mix(in oklab, var(--color-primary) 9%, transparent);
    color: var(--color-primary);
  }

  .zone-description {
    margin: 1rem 0 1.5rem;
    color: color-mix(in oklab, var(--color-base-content) 52%, transparent);
    font-size: 0.8125rem;
    line-height: 1.65;
  }

  .theme-switch {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.625rem;
  }

  .theme-option {
    display: grid;
    min-height: 5.5rem;
    justify-items: start;
    border-radius: 0.9rem;
    background: color-mix(in oklab, var(--color-base-content) 3%, transparent);
    padding: 0.875rem;
    color: color-mix(in oklab, var(--color-base-content) 58%, transparent);
    text-align: left;
  }

  .theme-option span {
    margin-top: 0.5rem;
    font-size: 0.8125rem;
    font-weight: 650;
  }

  .theme-option small {
    color: color-mix(in oklab, var(--color-base-content) 38%, transparent);
    font-size: 0.625rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .theme-option.active {
    background: color-mix(in oklab, var(--color-primary) 10%, transparent);
    color: var(--color-primary);
    box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--color-primary) 28%, transparent);
  }

  .range-console {
    display: block;
    border-radius: 0.9rem;
    background: color-mix(in oklab, var(--color-base-content) 2.5%, transparent);
    padding: 1.1rem;
  }

  .range-console strong,
  .control-copy strong,
  .save-status strong,
  .delay-control strong {
    display: block;
    font-size: 0.8125rem;
    font-weight: 620;
  }

  .range-console small,
  .control-copy small,
  .save-status small,
  .delay-control small {
    display: block;
    margin-top: 0.25rem;
    color: color-mix(in oklab, var(--color-base-content) 44%, transparent);
    font-size: 0.6875rem;
    line-height: 1.5;
  }

  .range-console output {
    color: var(--color-primary);
    font-family: var(--vellum-font-mono);
    font-size: 1.5rem;
    line-height: 1;
  }

  .range-console output span {
    font-size: 0.625rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .range-limits {
    display: flex;
    justify-content: space-between;
    margin-top: 0.4rem;
    color: color-mix(in oklab, var(--color-base-content) 30%, transparent);
    font-family: var(--vellum-font-mono);
    font-size: 0.6rem;
  }

  .control-list {
    margin-top: 0.75rem;
  }

  .control-row,
  .delay-control {
    display: flex;
    min-height: 4.5rem;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    border-radius: 0.8rem;
    padding-inline: 0.75rem;
    transition: background-color var(--vellum-motion-fast) var(--vellum-ease-out);
  }

  .control-row:hover,
  .delay-control:hover {
    background: color-mix(in oklab, var(--color-base-content) 3%, transparent);
  }

  .save-status {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.875rem;
    border-radius: 0.9rem;
    padding: 1rem;
    background: color-mix(in oklab, var(--color-base-content) 3%, transparent);
  }

  .status-signal {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 999px;
    background: color-mix(in oklab, var(--color-base-content) 25%, transparent);
  }

  .status-signal.online {
    background: var(--color-primary);
  }

  .delay-control {
    margin-top: 0.75rem;
    border-bottom: 0;
  }

  @media (max-width: 720px) {
    .settings-intro {
      padding-left: 0;
    }

    .settings-grid {
      grid-template-columns: 1fr;
    }

    .editor-zone {
      grid-row: auto;
    }
  }
</style>
<script lang="ts">
  import { ArrowLeft, Eye, Moon, RotateCcw, Save, Sun, Type } from "lucide-svelte";
  import { getSettings, getTheme, getUI } from "$lib/stores.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import IconBadge from "$lib/components/ui/IconBadge.svelte";
  import IconButton from "$lib/components/ui/IconButton.svelte";
  import PanelHeader from "$lib/components/ui/PanelHeader.svelte";
  import Range from "$lib/components/ui/Range.svelte";
  import SegmentedControl, {
    type SegmentOption,
  } from "$lib/components/ui/SegmentedControl.svelte";
  import Select from "$lib/components/ui/Select.svelte";
  import StatusDot from "$lib/components/ui/StatusDot.svelte";
  import Toggle from "$lib/components/ui/Toggle.svelte";
  import { crossfadeEnter } from "$lib/motion/actions";

  const theme = getTheme();
  const settings = getSettings();
  const ui = getUI();

  const themeOptions: SegmentOption[] = [
    { value: "light", label: "Light · Ice", icon: Sun },
    { value: "dark", label: "Dark · Void", icon: Moon },
  ];
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

  <div class="settings-canvas ui-surface-canvas ui-surface-canvas--tinted min-h-0 flex-1 overflow-y-auto">
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
        <section class="control-zone ui-surface-chrome appearance-zone" aria-labelledby="appearance-title">
          <div class="zone-heading">
            <IconBadge size="lg"><Eye class="ui-icon" /></IconBadge>
            <div>
              <p class="zone-index">01 / Interface</p>
              <h3 id="appearance-title">Light field</h3>
            </div>
          </div>
          <p class="zone-description">Switch the visual atmosphere while preserving the same cyan signal layer.</p>
          <SegmentedControl
            value={theme.theme}
            options={themeOptions}
            label="Application theme"
            variant="card"
            onchange={(value) => theme.applyTheme(value as "light" | "dark")}
          />
      </section>

        <section class="control-zone ui-surface-chrome editor-zone" aria-labelledby="editor-title">
          <div class="zone-heading">
            <IconBadge size="lg"><Type class="ui-icon" /></IconBadge>
            <div>
              <p class="zone-index">02 / Reading</p>
              <h3 id="editor-title">Editor optics</h3>
            </div>
          </div>
          <p class="zone-description">Calibrate type scale and the visual guides surrounding your text.</p>

          <label class="range-console ui-glass-control">
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
            <label class="control-row ui-glass-hover">
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

            <label class="control-row ui-glass-hover">
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

        <section class="control-zone ui-surface-chrome files-zone" aria-labelledby="files-title">
          <div class="zone-heading">
            <IconBadge size="lg"><Save class="ui-icon" /></IconBadge>
            <div>
              <p class="zone-index">03 / Persistence</p>
              <h3 id="files-title">Write-through</h3>
            </div>
          </div>
          <p class="zone-description">Decide when the active draft crosses from memory to disk.</p>

          <div class="save-status ui-glass-control">
            <StatusDot tone={settings.editor.autoSave ? "success" : "neutral"} />
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
            <label use:crossfadeEnter={{ y: -4 }} class="delay-control ui-glass-hover">
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
    border-radius: var(--vellum-radius-panel);
    padding: clamp(1.25rem, 3vw, 2rem);
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

  .zone-description {
    margin: 1rem 0 1.5rem;
    color: color-mix(in oklab, var(--color-base-content) 52%, transparent);
    font-size: 0.8125rem;
    line-height: 1.65;
  }

  .range-console {
    display: block;
    border-radius: var(--vellum-radius-md);
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
    border-radius: var(--vellum-radius-control);
    padding-inline: 0.75rem;
    transition: background-color var(--vellum-motion-fast) var(--vellum-ease-out);
  }

  .save-status {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.875rem;
    border-radius: var(--vellum-radius-md);
    padding: 1rem;
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
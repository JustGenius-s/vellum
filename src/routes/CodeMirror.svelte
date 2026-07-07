<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { EditorState } from "@codemirror/state";
  import { EditorView, keymap } from "@codemirror/view";
  import { defaultKeymap } from "@codemirror/commands";

  export let value: string;
  export let onchange: (newValue: string) => void = () => {};

  let view: EditorView | null = null;
  let host: HTMLDivElement;

  onMount(() => {
    const updateListener = EditorView.updateListener.of((u) => {
      if (u.docChanged) {
        onchange(u.state.doc.toString());
      }
    });

    view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          keymap.of(defaultKeymap),
          updateListener,
          EditorView.lineWrapping,
          EditorView.theme({
            "&": {
              fontSize: "14px",
              height: "100%",
            },
            ".cm-scroller": {
              overflow: "auto",
              fontFamily: "'SF Mono', Menlo, monospace",
            },
          }),
        ],
      }),
      parent: host,
    });
  });

  onDestroy(() => {
    view?.destroy();
  });

  $: if (view && value !== undefined && value !== view.state.doc.toString()) {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
  }
</script>

<div class="cm-host" bind:this={host}></div>

<style>
  .cm-host {
    flex: 1;
    overflow: hidden;
    height: 100%;
  }
  .cm-host :global(.cm-editor) {
    height: 100%;
  }
  .cm-host :global(.cm-editor .cm-scroller) {
    overflow: auto;
  }
</style>
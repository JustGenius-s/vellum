<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { EditorState } from "@codemirror/state";
  import { EditorView, keymap } from "@codemirror/view";
  import { defaultKeymap } from "@codemirror/commands";
  import { autocompletion, type CompletionContext } from "@codemirror/autocomplete";
  import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
  import { typst } from "$lib/typst-language";

  let {
    source = "",
    onchange = () => {},
    fileNames = [],
  }: {
    source: string;
    onchange: (newValue: string) => void;
    fileNames: string[];
  } = $props();

  let view: EditorView | null = null;
  let host: HTMLDivElement;

  function wikilinkCompletions(context: CompletionContext) {
    const word = context.matchBefore(/\[\[[^\]|]*/);
    if (!word) return null;
    if (word.from === word.to && !context.explicit) return null;
    return {
      from: word.from + 2,
      options: fileNames.map((name) => ({
        label: name,
        type: "file" as const,
        apply: name,
      })),
      validFor: /^\w*$/,
    };
  }

  onMount(() => {
    const updateListener = EditorView.updateListener.of((u) => {
      if (u.docChanged) {
        onchange(u.state.doc.toString());
      }
    });

    view = new EditorView({
      state: EditorState.create({
        doc: source,
        extensions: [
          keymap.of(defaultKeymap),
          updateListener,
          autocompletion({ override: [wikilinkCompletions] }),
          typst,
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
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
            ".cm-tooltip-autocomplete": {
              fontFamily: "inherit",
              borderRadius: "6px",
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

  $effect(() => {
    if (view && source !== undefined && source !== view.state.doc.toString()) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: source },
      });
    }
  });
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
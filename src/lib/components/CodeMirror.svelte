<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { EditorState } from "@codemirror/state";
  import { EditorView, keymap, lineNumbers, highlightActiveLineGutter } from "@codemirror/view";
  import { defaultKeymap } from "@codemirror/commands";
  import { autocompletion, type CompletionContext } from "@codemirror/autocomplete";
  import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
  import { typst } from "$lib/typst-language";
  import { getUI } from "$lib/stores.svelte";

  let {
    source = "",
    onchange = () => {},
    fileNames = [],
    onViewCreated = (_v: EditorView) => {},
  }: {
    source: string;
    onchange: (newValue: string) => void;
    fileNames: string[];
    onViewCreated: (v: EditorView) => void;
  } = $props();

  const ui = getUI();

  let view: EditorView | null = null;
  let host: HTMLDivElement;
  let isProgrammaticChange = false;
  let applyingScroll = false;

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

  function reportScroll() {
    if (!view || applyingScroll) return;
    const scroller = view.scrollDOM;
    const max = scroller.scrollHeight - scroller.clientHeight;
    const ratio = max > 0 ? scroller.scrollTop / max : 0;
    ui.scrollSource = "editor";
    ui.scrollRatio = ratio;
  }

  onMount(() => {
    const updateListener = EditorView.updateListener.of((u) => {
      if (u.docChanged && !isProgrammaticChange) {
        onchange(u.state.doc.toString());
      }
    });

    const scrollHandler = () => reportScroll();

    view = new EditorView({
      state: EditorState.create({
        doc: source,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
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
            ".cm-gutters": {
              backgroundColor: "transparent",
              border: "none",
              color: "color-mix(in oklab, var(--color-base-content) 40%, transparent)",
            },
            ".cm-activeLineGutter": {
              backgroundColor: "transparent",
              color: "var(--color-base-content)",
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
    view.scrollDOM.addEventListener("scroll", scrollHandler, { passive: true });
    onViewCreated(view);

    return () => {
      view?.scrollDOM.removeEventListener("scroll", scrollHandler);
    };
  });

  onDestroy(() => {
    view?.destroy();
  });

  $effect(() => {
    if (view && source !== undefined && source !== view.state.doc.toString()) {
      isProgrammaticChange = true;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: source },
      });
      isProgrammaticChange = false;
    }
  });

  // Jump to line from outline / diagnostics
  $effect(() => {
    const line = ui.gotoLine;
    if (line == null || !view) return;
    const doc = view.state.doc;
    const target = Math.min(Math.max(1, line), doc.lines);
    const lineObj = doc.line(target);
    view.dispatch({
      selection: { anchor: lineObj.from },
      effects: EditorView.scrollIntoView(lineObj.from, { y: "center" }),
    });
    ui.gotoLine = null;
  });

  // Sync scroll from preview
  $effect(() => {
    const ratio = ui.scrollRatio;
    const sourceSide = ui.scrollSource;
    if (!view || sourceSide !== "preview") return;
    applyingScroll = true;
    const scroller = view.scrollDOM;
    const max = scroller.scrollHeight - scroller.clientHeight;
    scroller.scrollTop = max > 0 ? ratio * max : 0;
    requestAnimationFrame(() => {
      applyingScroll = false;
    });
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

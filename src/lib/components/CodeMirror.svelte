<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Compartment, EditorState } from "@codemirror/state";
  import { EditorView, keymap, lineNumbers, highlightActiveLineGutter } from "@codemirror/view";
  import { defaultKeymap } from "@codemirror/commands";
  import { autocompletion, type CompletionContext } from "@codemirror/autocomplete";
  import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
  import { lintGutter, setDiagnostics, type Diagnostic as EditorDiagnostic } from "@codemirror/lint";
  import { openSearchPanel, search, searchKeymap } from "@codemirror/search";
  import { typst } from "$lib/typst-language";
  import { getTheme, getUI } from "$lib/stores.svelte";
  import type { CompileDiagnostic } from "$lib/vault.svelte";

  let {
    source = "",
    onchange = () => {},
    fileNames = [],
    activePath = "",
    diagnostics = [],
    onViewCreated = (_v: EditorView) => {},
  }: {
    source: string;
    onchange: (newValue: string) => void;
    fileNames: string[];
    activePath: string;
    diagnostics: CompileDiagnostic[];
    onViewCreated?: (v: EditorView) => void;
  } = $props();

  const ui = getUI();
  const theme = getTheme();
  const themeCompartment = new Compartment();

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
      validFor: /^[^|\]\n]*$/,
    };
  }

  function editorTheme(isDark: boolean) {
    return EditorView.theme({
      "&": {
        backgroundColor: "var(--color-base-100)",
        color: "var(--color-base-content)",
        fontSize: "14px",
        height: "100%",
      },
      ".cm-content": {
        caretColor: "var(--color-primary)",
      },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: "var(--color-primary)",
      },
      ".cm-scroller": {
        overflow: "auto",
        fontFamily: "var(--vellum-font-mono)",
      },
      ".cm-gutters": {
        backgroundColor: "var(--color-base-100)",
        border: "none",
        color: "color-mix(in oklab, var(--color-base-content) 40%, transparent)",
      },
      ".cm-activeLine, .cm-activeLineGutter": {
        backgroundColor: "color-mix(in oklab, var(--color-base-200) 75%, transparent)",
      },
      ".cm-panels": {
        backgroundColor: "var(--color-base-200)",
        color: "var(--color-base-content)",
      },
      ".cm-panel.cm-search": {
        borderBottom: "1px solid var(--color-base-300)",
        padding: "8px",
      },
      ".cm-textfield": {
        backgroundColor: "var(--color-base-100)",
        border: "1px solid var(--color-base-300)",
        borderRadius: "var(--vellum-radius-control)",
        color: "var(--color-base-content)",
      },
      ".cm-button": {
        backgroundImage: "none",
        backgroundColor: "var(--color-base-100)",
        border: "1px solid var(--color-base-300)",
        borderRadius: "var(--vellum-radius-control)",
        color: "var(--color-base-content)",
      },
      ".cm-tooltip": {
        backgroundColor: "var(--color-base-100)",
        border: "1px solid var(--color-base-300)",
      },
      ".cm-tooltip-autocomplete": {
        fontFamily: "var(--vellum-font-ui)",
        borderRadius: "var(--vellum-radius-control)",
      },
    }, { dark: isDark });
  }

  function editorDiagnostics(): EditorDiagnostic[] {
    if (!view) return [];
    const normalizedActivePath = activePath.replaceAll("\\", "/");
    return diagnostics.flatMap((diagnostic) => {
      const diagnosticPath = diagnostic.path?.replaceAll("\\", "/");
      if (
        diagnosticPath &&
        normalizedActivePath &&
        !normalizedActivePath.endsWith(`/${diagnosticPath}`) &&
        normalizedActivePath !== diagnosticPath
      ) {
        return [];
      }

      const lineNumber = Math.min(
        Math.max(1, diagnostic.line ?? 1),
        view!.state.doc.lines,
      );
      const line = view!.state.doc.line(lineNumber);
      const column = Math.max(1, diagnostic.column ?? 1);
      const from = Math.min(line.to, line.from + column - 1);
      return [{
        from,
        to: Math.min(line.to, from + 1),
        severity: diagnostic.severity === "warning" ? "warning" : "error",
        message: diagnostic.hints.length
          ? `${diagnostic.message}\n${diagnostic.hints.join("\n")}`
          : diagnostic.message,
        source: diagnostic.path ?? "Typst",
      }];
    });
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
          keymap.of([...searchKeymap, ...defaultKeymap]),
          updateListener,
          autocompletion({ override: [wikilinkCompletions] }),
          search({ top: true }),
          lintGutter(),
          typst,
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          EditorView.lineWrapping,
          themeCompartment.of(editorTheme(theme.theme === "dark")),
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

  $effect(() => {
    diagnostics;
    activePath;
    if (view) view.dispatch(setDiagnostics(view.state, editorDiagnostics()));
  });

  $effect(() => {
    const isDark = theme.theme === "dark";
    if (view) {
      view.dispatch({
        effects: themeCompartment.reconfigure(editorTheme(isDark)),
      });
    }
  });

  $effect(() => {
    if (!ui.findPanelOpen || !view) return;
    openSearchPanel(view);
    ui.findPanelOpen = false;
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

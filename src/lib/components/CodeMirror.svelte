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
  import { getSettings, getTheme, getUI } from "$lib/stores.svelte";
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
  const settings = getSettings();
  const themeCompartment = new Compartment();
  const editorSettingsCompartment = new Compartment();

  interface EditorSession {
    state: EditorState;
    scrollTop: number;
    scrollLeft: number;
  }

  let view: EditorView | null = null;
  let host: HTMLDivElement;
  let isProgrammaticChange = false;
  let applyingScroll = false;
  let currentPath = "";
  let createEditorState: ((doc: string) => EditorState) | null = null;
  const sessions = new Map<string, EditorSession>();

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

  function editorTheme(isDark: boolean, fontSize: number) {
    return EditorView.theme({
      "&": {
        backgroundColor: "var(--vellum-surface-canvas)",
        color: "var(--color-base-content)",
        fontSize: `${fontSize}px`,
        height: "100%",
      },
      ".cm-content": {
        caretColor: "var(--color-primary)",
        lineHeight: "1.78",
        paddingBlock: "clamp(1.5rem, 4vh, 3.5rem)",
        paddingInline: "clamp(1.25rem, 4vw, 4rem)",
      },
      ".cm-line": {
        maxWidth: "92ch",
        paddingInline: "0.5rem",
      },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: "var(--color-primary)",
      },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
        backgroundColor:
          "color-mix(in oklab, var(--color-primary) 24%, transparent)",
      },
      ".cm-scroller": {
        overflow: "auto",
        fontFamily: "var(--vellum-font-mono)",
        letterSpacing: "0.006em",
        scrollbarColor:
          "color-mix(in oklab, var(--color-primary) 30%, transparent) transparent",
      },
      ".cm-gutters": {
        backgroundColor:
          "color-mix(in oklab, var(--vellum-surface-canvas) 88%, transparent)",
        borderRight: "1px solid var(--vellum-border-subtle)",
        color:
          "color-mix(in oklab, var(--color-base-content) 30%, transparent)",
        paddingTop: "clamp(1.5rem, 4vh, 3.5rem)",
      },
      ".cm-lineNumbers .cm-gutterElement": {
        minWidth: "3rem",
        paddingInline: "0.75rem 0.625rem",
        textAlign: "right",
      },
      ".cm-activeLine": {
        backgroundColor:
          "color-mix(in oklab, var(--color-primary) 4%, transparent)",
        boxShadow:
          "inset 2px 0 0 color-mix(in oklab, var(--color-primary) 38%, transparent)",
      },
      ".cm-activeLineGutter": {
        backgroundColor:
          "color-mix(in oklab, var(--color-primary) 7%, transparent)",
        color: "var(--color-primary)",
      },
      ".cm-panels": {
        backgroundColor:
          "color-mix(in oklab, var(--vellum-surface-overlay) 94%, transparent)",
        color: "var(--color-base-content)",
        backdropFilter: "blur(24px) saturate(1.1)",
      },
      ".cm-panel.cm-search": {
        alignItems: "center",
        border: "1px solid var(--vellum-border-subtle)",
        borderRadius: "0 0 0.875rem 0.875rem",
        boxShadow:
          "inset 0 1px 0 color-mix(in oklab, white 5%, transparent), var(--vellum-shadow-overlay)",
        gap: "0.5rem",
        marginInline: "clamp(0.75rem, 2vw, 1.5rem)",
        padding: "0.625rem 0.75rem",
      },
      ".cm-panel.cm-search label": {
        color:
          "color-mix(in oklab, var(--color-base-content) 64%, transparent)",
        fontFamily: "var(--vellum-font-ui)",
        fontSize: "var(--vellum-text-ui)",
      },
      ".cm-textfield": {
        backgroundColor:
          "color-mix(in oklab, var(--vellum-surface-canvas) 88%, transparent)",
        border: "1px solid var(--vellum-border-subtle)",
        borderRadius: "0.625rem",
        color: "var(--color-base-content)",
        fontFamily: "var(--vellum-font-ui)",
        minHeight: "var(--vellum-control-compact)",
        outline: "none",
        paddingInline: "0.5rem",
      },
      ".cm-textfield:focus": {
        borderColor:
          "color-mix(in oklab, var(--color-primary) 70%, var(--vellum-border-subtle))",
        boxShadow:
          "0 0 0 2px color-mix(in oklab, var(--color-primary) 16%, transparent)",
      },
      ".cm-button": {
        backgroundImage: "none",
        backgroundColor:
          "color-mix(in oklab, var(--vellum-surface-canvas) 72%, transparent)",
        border: "1px solid var(--vellum-border-subtle)",
        borderRadius: "0.625rem",
        color: "var(--color-base-content)",
        fontFamily: "var(--vellum-font-ui)",
        minHeight: "var(--vellum-control-compact)",
        paddingInline: "0.5rem",
      },
      ".cm-button:hover": {
        backgroundColor:
          "color-mix(in oklab, var(--color-base-300) 58%, transparent)",
      },
      ".cm-searchMatch": {
        backgroundColor:
          "color-mix(in oklab, var(--color-primary) 16%, transparent)",
        outline:
          "1px solid color-mix(in oklab, var(--color-primary) 38%, transparent)",
        borderRadius: "0.2rem",
      },
      ".cm-searchMatch.cm-searchMatch-selected": {
        backgroundColor:
          "color-mix(in oklab, var(--color-primary) 28%, transparent)",
        outline:
          "1px solid color-mix(in oklab, var(--color-primary) 78%, transparent)",
      },
      ".cm-tooltip": {
        backgroundColor:
          "color-mix(in oklab, var(--vellum-surface-overlay) 96%, transparent)",
        border: "1px solid var(--vellum-border-subtle)",
        borderRadius: "0.875rem",
        boxShadow: "var(--vellum-shadow-overlay)",
        color: "var(--color-base-content)",
        backdropFilter: "blur(28px) saturate(1.12)",
        overflow: "hidden",
      },
      ".cm-tooltip-autocomplete": {
        fontFamily: "var(--vellum-font-ui)",
      },
      ".cm-tooltip-autocomplete ul li": {
        minHeight: "var(--vellum-control-default)",
        padding: "0.45rem 0.75rem",
      },
      ".cm-tooltip-autocomplete ul li[aria-selected]": {
        backgroundColor:
          "color-mix(in oklab, var(--color-primary) 14%, transparent)",
        color: "var(--color-primary)",
        boxShadow: "inset 2px 0 0 var(--color-primary)",
      },
      ".cm-completionDetail": {
        color:
          "color-mix(in oklab, var(--color-base-content) 48%, transparent)",
      },
      ".cm-tooltip-lint": {
        fontFamily: "var(--vellum-font-ui)",
        fontSize: "var(--vellum-text-ui)",
        lineHeight: "var(--vellum-leading-normal)",
        padding: "0.5rem 0.625rem",
      },
      ".cm-diagnostic": {
        borderLeftWidth: "2px",
        padding: "0.25rem 0.5rem",
      },
      ".cm-diagnostic-error": {
        borderLeftColor: "var(--color-error)",
      },
      ".cm-diagnostic-warning": {
        borderLeftColor: "var(--color-warning)",
      },
      ".cm-lintRange-error": {
        backgroundImage:
          "linear-gradient(135deg, transparent 46%, var(--color-error) 46%, var(--color-error) 54%, transparent 54%)",
      },
      ".cm-lintRange-warning": {
        backgroundImage:
          "linear-gradient(135deg, transparent 46%, var(--color-warning) 46%, var(--color-warning) 54%, transparent 54%)",
      },
      ".cm-lint-marker-error": {
        content: '""',
        backgroundColor: "var(--color-error)",
      },
      ".cm-lint-marker-warning": {
        content: '""',
        backgroundColor: "var(--color-warning)",
      },
    }, { dark: isDark });
  }

  function editorSettingsExtensions() {
    return [
      settings.editor.lineNumbers ? lineNumbers() : [],
      settings.editor.wordWrap ? EditorView.lineWrapping : [],
    ];
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
    if (currentPath) {
      sessions.set(currentPath, {
        state: view.state,
        scrollTop: scroller.scrollTop,
        scrollLeft: scroller.scrollLeft,
      });
    }
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
      if (currentPath) {
        sessions.set(currentPath, {
          state: u.state,
          scrollTop: view?.scrollDOM.scrollTop ?? 0,
          scrollLeft: view?.scrollDOM.scrollLeft ?? 0,
        });
      }
    });

    const scrollHandler = () => reportScroll();
    const extensions = [
      highlightActiveLineGutter(),
      keymap.of([...searchKeymap, ...defaultKeymap]),
      updateListener,
      autocompletion({ override: [wikilinkCompletions] }),
      search({ top: true }),
      lintGutter(),
      typst,
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      editorSettingsCompartment.of(editorSettingsExtensions()),
      themeCompartment.of(
        editorTheme(theme.theme === "dark", settings.editor.fontSize),
      ),
    ];
    createEditorState = (doc) => EditorState.create({ doc, extensions });
    currentPath = activePath;

    view = new EditorView({
      state: createEditorState(source),
      parent: host,
    });
    if (currentPath) {
      sessions.set(currentPath, {
        state: view.state,
        scrollTop: 0,
        scrollLeft: 0,
      });
    }
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
    const nextPath = activePath;
    const nextSource = source;
    if (!view || !createEditorState || !nextPath || nextPath === currentPath) return;

    if (currentPath) {
      sessions.set(currentPath, {
        state: view.state,
        scrollTop: view.scrollDOM.scrollTop,
        scrollLeft: view.scrollDOM.scrollLeft,
      });
    }

    const existing = sessions.get(nextPath);
    const nextState =
      existing?.state.doc.toString() === nextSource
        ? existing.state
        : createEditorState(nextSource);
    isProgrammaticChange = true;
    view.setState(nextState);
    isProgrammaticChange = false;
    currentPath = nextPath;
    view.dispatch({
      effects: [
        themeCompartment.reconfigure(
          editorTheme(theme.theme === "dark", settings.editor.fontSize),
        ),
        editorSettingsCompartment.reconfigure(editorSettingsExtensions()),
      ],
    });

    requestAnimationFrame(() => {
      if (!view || currentPath !== nextPath) return;
      view.scrollDOM.scrollTop = existing?.scrollTop ?? 0;
      view.scrollDOM.scrollLeft = existing?.scrollLeft ?? 0;
      view.focus();
    });
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
    const fontSize = settings.editor.fontSize;
    if (view) {
      view.dispatch({
        effects: themeCompartment.reconfigure(
          editorTheme(isDark, fontSize),
        ),
      });
    }
  });

  $effect(() => {
    settings.editor.lineNumbers;
    settings.editor.wordWrap;
    if (view) {
      view.dispatch({
        effects: editorSettingsCompartment.reconfigure(
          editorSettingsExtensions(),
        ),
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

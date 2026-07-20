import { useEffect, useRef } from "react";
import { autocompletion, type CompletionContext } from "@codemirror/autocomplete";
import { defaultKeymap } from "@codemirror/commands";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { lintGutter, setDiagnostics, type Diagnostic as EditorDiagnostic } from "@codemirror/lint";
import { search, searchKeymap } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { basicSetup } from "codemirror";

import type { CompileDiagnostic } from "@/domain/workspace";
import { typstLanguage } from "@/features/editor/typst-language";

interface EditorSession {
  state: EditorState;
  scrollTop: number;
  scrollLeft: number;
}

const editorTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      backgroundColor: "transparent",
      color: "var(--foreground)",
      fontSize: "14px",
    },
    ".cm-scroller": {
      fontFamily: "var(--font-mono)",
      lineHeight: "1.74",
      overflow: "auto",
    },
    ".cm-content": {
      caretColor: "var(--foreground)",
      padding: "0.5rem 0.5rem 4rem",
    },
    ".cm-line": {
      maxWidth: "92ch",
      paddingInline: "0",
    },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--foreground)" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
      backgroundColor: "var(--accent)",
    },
    ".cm-gutters": {
      backgroundColor: "var(--background)",
      borderRight: "none",
      color: "var(--muted-foreground)",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      minWidth: "2rem",
      paddingInline: "0.25rem",
      fontFamily: "var(--font-mono)",
      fontSize: "10px",
      lineHeight: "1",
    },
    ".cm-gutters .cm-foldGutter, .cm-gutters .cm-gutter-lint": {
      display: "none !important",
    },
    ".cm-activeLine": {
      backgroundColor: "var(--accent)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "var(--accent)",
      color: "var(--accent-foreground)",
    },
    ".cm-panels": {
      backgroundColor: "var(--popover)",
      color: "var(--popover-foreground)",
      borderColor: "var(--border)",
    },
    ".cm-panel.cm-search": {
      display: "flex",
      alignItems: "center",
      gap: "0.5rem",
      padding: "0.55rem 0.75rem",
    },
    ".cm-textfield, .cm-button": {
      background: "var(--input)",
      border: "1px solid var(--border)",
      borderRadius: "0.45rem",
      color: "var(--foreground)",
      fontFamily: "var(--font-sans)",
      minHeight: "1.9rem",
    },
    ".cm-tooltip": {
      backgroundColor: "var(--popover)",
      border: "1px solid var(--border)",
      borderRadius: "0.55rem",
      boxShadow: "none",
      color: "var(--popover-foreground)",
      overflow: "hidden",
    },
    ".cm-tooltip-autocomplete ul li": {
      minHeight: "2.15rem",
      padding: "0.4rem 0.7rem",
      fontFamily: "var(--font-sans)",
    },
    ".cm-tooltip-autocomplete ul li[aria-selected]": {
      backgroundColor: "var(--accent)",
      color: "var(--accent-foreground)",
    },
    ".cm-searchMatch": {
      backgroundColor: "var(--accent)",
      outline: "1px solid var(--ring)",
    },
  },
  { dark: false },
);

function toEditorDiagnostics(
  diagnostics: CompileDiagnostic[],
  view: EditorView,
  activePath: string,
): EditorDiagnostic[] {
  const normalizedPath = activePath.replaceAll("\\", "/");
  return diagnostics.flatMap((diagnostic) => {
    const diagnosticPath = diagnostic.path?.replaceAll("\\", "/");
    if (
      diagnosticPath &&
      !normalizedPath.endsWith(`/${diagnosticPath}`) &&
      normalizedPath !== diagnosticPath
    ) {
      return [];
    }
    const lineNumber = Math.min(Math.max(1, diagnostic.line ?? 1), view.state.doc.lines);
    const line = view.state.doc.line(lineNumber);
    const from = Math.min(line.to, line.from + Math.max(0, (diagnostic.column ?? 1) - 1));
    return [
      {
        from,
        to: Math.min(line.to, from + 1),
        severity: diagnostic.severity === "warning" ? "warning" : "error",
        message: diagnostic.hints.length
          ? `${diagnostic.message}\n${diagnostic.hints.join("\n")}`
          : diagnostic.message,
        source: diagnostic.path ?? "Typst",
      } satisfies EditorDiagnostic,
    ];
  });
}

export function TypstEditor({
  value,
  activePath,
  fileNames,
  diagnostics,
  revealLine,
  onChange,
  onRevealComplete,
}: {
  value: string;
  activePath: string;
  fileNames: string[];
  diagnostics: CompileDiagnostic[];
  revealLine: number | null;
  onChange(value: string): void;
  onRevealComplete(): void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const pathRef = useRef(activePath);
  const onChangeRef = useRef(onChange);
  const fileNamesRef = useRef(fileNames);
  const initialValueRef = useRef(value);
  const applyingRef = useRef(false);
  const sessionsRef = useRef(new Map<string, EditorSession>());

  onChangeRef.current = onChange;
  fileNamesRef.current = fileNames;

  useEffect(() => {
    if (!hostRef.current || viewRef.current) return;

    const wikilinkCompletions = (context: CompletionContext) => {
      const word = context.matchBefore(/\[\[[^\]|]*/);
      if (!word || (word.from === word.to && !context.explicit)) return null;
      return {
        from: word.from + 2,
        options: fileNamesRef.current.map((name) => ({ label: name, type: "file", apply: name })),
        validFor: /^[^|\]\n]*$/,
      };
    };

    const createState = (doc: string) =>
      EditorState.create({
        doc,
        extensions: [
          basicSetup,
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          EditorView.lineWrapping,
          typstLanguage,
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          search(),
          lintGutter(),
          autocompletion({ override: [wikilinkCompletions] }),
          keymap.of([...defaultKeymap, ...searchKeymap]),
          editorTheme,
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !applyingRef.current) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
        ],
      });

    const view = new EditorView({
      state: createState(initialValueRef.current),
      parent: hostRef.current,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (pathRef.current !== activePath) {
      const scroll = view.scrollDOM;
      if (pathRef.current) {
        sessionsRef.current.set(pathRef.current, {
          state: view.state,
          scrollTop: scroll.scrollTop,
          scrollLeft: scroll.scrollLeft,
        });
      }
      const session = sessionsRef.current.get(activePath);
      if (session) {
        view.setState(session.state);
        requestAnimationFrame(() => {
          view.scrollDOM.scrollTo(session.scrollLeft, session.scrollTop);
        });
      } else {
        applyingRef.current = true;
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
        applyingRef.current = false;
        view.scrollDOM.scrollTo(0, 0);
      }
      pathRef.current = activePath;
    } else if (view.state.doc.toString() !== value) {
      applyingRef.current = true;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
      applyingRef.current = false;
    }
  }, [activePath, value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch(setDiagnostics(view.state, toEditorDiagnostics(diagnostics, view, activePath)));
  }, [activePath, diagnostics]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || revealLine == null) return;
    const line = view.state.doc.line(Math.min(Math.max(1, revealLine), view.state.doc.lines));
    view.dispatch({
      selection: { anchor: line.from },
      effects: EditorView.scrollIntoView(line.from, { y: "center" }),
    });
    view.focus();
    onRevealComplete();
  }, [onRevealComplete, revealLine]);

  return <div ref={hostRef} className="h-full min-h-0 overflow-hidden" aria-label="Typst editor" />;
}

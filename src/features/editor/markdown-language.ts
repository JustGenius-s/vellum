import { StreamLanguage, type StreamParser } from "@codemirror/language";

interface MarkdownState {
  fenced: boolean;
}

const parser: StreamParser<MarkdownState> = {
  name: "markdown",
  startState: () => ({ fenced: false }),
  copyState: (state) => ({ ...state }),
  token(stream, state) {
    if (stream.sol() && stream.match(/^```/)) {
      state.fenced = !state.fenced;
      stream.skipToEnd();
      return "monospace";
    }

    if (state.fenced) {
      stream.skipToEnd();
      return "monospace";
    }

    if (stream.sol() && stream.match(/^#{1,6}\s+/)) {
      stream.skipToEnd();
      return "heading";
    }

    if (stream.sol() && stream.match(/^>\s+/)) return "quote";
    if (stream.sol() && stream.match(/^(?:[-+*]|\d+\.)\s+/)) return "list";

    if (stream.match("![[") || stream.match("[[")) {
      stream.match(/^[^\]|]+/);
      if (stream.match("|")) stream.match(/^[^\]]+/);
      stream.match("]]");
      return "link";
    }

    if (stream.match(/^!?\[[^\]]*\]\([^)]*\)/)) return "link";

    if (stream.peek() === "`") {
      stream.next();
      while (!stream.eol() && stream.peek() !== "`") stream.next();
      if (stream.peek() === "`") stream.next();
      return "monospace";
    }

    if (stream.match("**") || stream.match("__")) {
      const marker = stream.current();
      while (!stream.eol() && !stream.match(marker)) stream.next();
      return "strong";
    }

    if (stream.peek() === "*" || stream.peek() === "_") {
      const marker = stream.next();
      while (!stream.eol() && stream.peek() !== marker) stream.next();
      if (stream.peek() === marker) stream.next();
      return "emphasis";
    }

    stream.next();
    return null;
  },
};

export const markdownLanguage = StreamLanguage.define(parser);

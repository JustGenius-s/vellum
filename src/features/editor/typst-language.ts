import { StreamLanguage, type StreamParser } from "@codemirror/language";

type TypstState = Record<string, never>;

const parser: StreamParser<TypstState> = {
  name: "typst",
  startState: () => ({}),
  copyState: () => ({}),
  token(stream) {
    if (stream.match("/*")) {
      let depth = 1;
      while (depth > 0 && !stream.eol()) {
        if (stream.match("/*")) depth += 1;
        else if (stream.match("*/")) depth -= 1;
        else stream.next();
      }
      return "comment";
    }

    if (stream.match("//")) {
      stream.skipToEnd();
      return "comment";
    }

    if (stream.sol() && stream.match(/^=+ /)) {
      stream.skipToEnd();
      return "heading";
    }

    if (stream.match("[[")) {
      stream.match(/^[^\]|]+/);
      if (stream.match("|")) stream.match(/^[^\]]+/);
      stream.match("]]");
      return "link";
    }

    if (stream.peek() === "#") {
      stream.next();
      if (stream.match(/^(let|set|show|import|include|if|else|for|while|return|context)\b/)) {
        return "keyword";
      }
      if (stream.match(/^[a-zA-Z_][\w-]*/)) return "variableName";
      return "operator";
    }

    if (stream.peek() === "$") {
      stream.next();
      while (!stream.eol() && stream.peek() !== "$") stream.next();
      if (stream.peek() === "$") stream.next();
      return "string";
    }

    if (stream.peek() === '"') {
      stream.next();
      while (!stream.eol() && stream.peek() !== '"') {
        if (stream.peek() === "\\") stream.next();
        stream.next();
      }
      if (stream.peek() === '"') stream.next();
      return "string";
    }

    if (stream.peek() === "`" || stream.peek() === "*") {
      const marker = stream.next();
      while (!stream.eol() && stream.peek() !== marker) stream.next();
      if (stream.peek() === marker) stream.next();
      return marker === "`" ? "monospace" : "strong";
    }

    if (stream.match(/^\d+(?:\.\d+)?/)) return "number";
    if (stream.match(/[[\](){}]/)) return "bracket";
    stream.next();
    return null;
  },
};

export const typstLanguage = StreamLanguage.define(parser);

import { StreamLanguage, type StreamParser } from "@codemirror/language";

interface TypstState {}

const typstLanguage: StreamParser<TypstState> = {
  name: "typst",
  startState: () => ({}),
  copyState: (s: TypstState) => ({ ...s }),
  token(stream, _state: TypstState) {
    // Block comment
    if (stream.match("/*")) {
      let nested = 1;
      while (nested > 0 && !stream.eol()) {
        if (stream.match("/*")) nested++;
        else if (stream.match("*/")) nested--;
        else stream.next();
      }
      return "comment";
    }

    // Line comment
    if (stream.match("//")) {
      stream.skipToEnd();
      return "comment";
    }

    // Heading (= at line start)
    if (stream.sol() && stream.match(/^=+ /)) {
      stream.skipToEnd();
      return "header";
    }

    // Wikilink [[...]]
    if (stream.match("[[")) {
      stream.match(/^[^\]|]+/);
      if (stream.match("|")) {
        stream.match(/^[^\]]+/);
      }
      stream.match("]]");
      return "link";
    }

    // Script / code (#...)
    if (stream.peek() === "#") {
      stream.next();
      // Keywords
      if (stream.match(/^(let|set|show|import|include|if|else|for|while|return|while|context)\b/)) {
        return "keyword";
      }
      // Function call
      if (stream.match(/^[a-zA-Z_][\w]*/)) {
        if (stream.peek() === "(" || stream.peek() === "[") {
          return "keyword";
        }
        return "variableName";
      }
      return "operator";
    }

    // Math $...$
    if (stream.peek() === "$") {
      stream.next();
      while (!stream.eol() && stream.peek() !== "$") {
        stream.next();
      }
      if (stream.peek() === "$") stream.next();
      return "string";
    }

    // Bold *...*
    if (stream.peek() === "*") {
      stream.next();
      let found = false;
      while (!stream.eol()) {
        if (stream.peek() === "*") {
          stream.next();
          found = true;
          break;
        }
        stream.next();
      }
      return found ? "strong" : "operator";
    }

    // Italic _..._
    if (stream.peek() === "_") {
      stream.next();
      let found = false;
      while (!stream.eol()) {
        if (stream.peek() === "_") {
          stream.next();
          found = true;
          break;
        }
        stream.next();
      }
      return found ? "emphasis" : "operator";
    }

    // Raw text `...`
    if (stream.peek() === "`") {
      stream.next();
      while (!stream.eol() && stream.peek() !== "`") {
        stream.next();
      }
      if (stream.peek() === "`") stream.next();
      return "monospace";
    }

    // String "..."
    if (stream.peek() === '"') {
      stream.next();
      while (!stream.eol() && stream.peek() !== '"') {
        if (stream.peek() === "\\") stream.next();
        stream.next();
      }
      if (stream.peek() === '"') stream.next();
      return "string";
    }

    // Numbers
    if (stream.match(/^\d+(\.\d+)?/)) {
      return "number";
    }

    // Punctuation / braces
    if (stream.match(/[\[\](){}]/)) {
      return "bracket";
    }

    // Default: eat one char
    stream.next();
    return null;
  },
  blankLine: () => {},
};

export const typst = StreamLanguage.define(typstLanguage);
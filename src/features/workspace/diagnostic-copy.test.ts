import { describe, expect, it } from "vite-plus/test";

import { formatDiagnosticForClipboard } from "@/features/workspace/diagnostic-copy";

describe("diagnostic clipboard text", () => {
  it("includes the message, source location, and hints", () => {
    expect(
      formatDiagnosticForClipboard({
        severity: "error",
        message: "unknown variable: total",
        path: "chapters/intro.typ",
        line: 12,
        column: 8,
        hints: ["did you mean `title`?", "variables must be defined before use"],
      }),
    ).toBe(
      [
        "error: unknown variable: total",
        "at chapters/intro.typ:12:8",
        "hint: did you mean `title`?",
        "hint: variables must be defined before use",
      ].join("\n"),
    );
  });

  it("formats compiler diagnostics without a path", () => {
    expect(
      formatDiagnosticForClipboard({
        severity: "warning",
        message: "unused label",
        path: null,
        line: null,
        column: null,
        hints: [],
      }),
    ).toBe("warning: unused label");
  });
});

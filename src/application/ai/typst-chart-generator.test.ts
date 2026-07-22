import { describe, expect, it } from "vite-plus/test";

import {
  applyAiMessageContentUpdate,
  extractTypstSource,
  validateTypstChartSource,
  type AiMessageContentPart,
  type AiToolActivity,
} from "./typst-chart-generator";

describe("Typst chart generation helpers", () => {
  it("extracts fenced Typst source", () => {
    expect(extractTypstSource('```typst\n#let data = json("projection.json")\n#data\n```')).toBe(
      '#let data = json("projection.json")\n#data\n',
    );
  });

  it("requires portable projection access and rejects page settings", () => {
    expect(() => validateTypstChartSource("#figure[Hardcoded]")).toThrow(/projection\.json/);
    expect(() =>
      validateTypstChartSource('#set page(width: 10cm)\n#let data = json("projection.json")'),
    ).toThrow(/page-wide/);
  });

  it("preserves streamed text and tool calls in arrival order", () => {
    let content: AiMessageContentPart[] = [];
    const readTool: AiToolActivity = {
      id: "read-1",
      name: "read_data_projection",
      title: "Read data projection",
      state: "input-available",
    };

    content = applyAiMessageContentUpdate(content, { type: "reasoning", text: "Inspect" });
    content = applyAiMessageContentUpdate(content, { type: "reasoning", text: " the data." });
    content = applyAiMessageContentUpdate(content, { type: "text", text: "I will read it." });
    content = applyAiMessageContentUpdate(content, { type: "tool", activity: readTool });
    content = applyAiMessageContentUpdate(content, { type: "text", text: "The data is ready." });
    content = applyAiMessageContentUpdate(content, {
      type: "tool",
      activity: { ...readTool, state: "output-available", output: { rows: 61 } },
    });
    content = applyAiMessageContentUpdate(content, {
      type: "tool",
      activity: {
        id: "compile-1",
        name: "compile_typst",
        title: "Compile Typst",
        state: "output-available",
      },
    });
    content = applyAiMessageContentUpdate(content, { type: "text", text: "The figure compiled." });

    expect(content.map((part) => part.type)).toEqual([
      "reasoning",
      "text",
      "tool",
      "text",
      "tool",
      "text",
    ]);
    expect(content[0]).toMatchObject({ type: "reasoning", text: "Inspect the data." });
    expect(content[2]).toMatchObject({
      type: "tool",
      activity: { id: "read-1", state: "output-available" },
    });
  });
});

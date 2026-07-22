import { describe, expect, it } from "vite-plus/test";

import { extractTypstSource, validateTypstChartSource } from "./typst-chart-generator";

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
});

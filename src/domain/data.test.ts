import { describe, expect, it } from "vite-plus/test";

import { dataFormat, emptyDataQuery, isDataFile } from "@/domain/data";

describe("data formats", () => {
  it("recognizes tabular and multidimensional extensions", () => {
    expect(dataFormat("results.csv")).toBe("csv");
    expect(dataFormat("events.ndjson")).toBe("jsonl");
    expect(dataFormat("observations.parquet")).toBe("parquet");
    expect(dataFormat("simulation.hdf5")).toBe("hdf5");
    expect(dataFormat("field.nc")).toBe("netcdf");
    expect(isDataFile("paper.typ")).toBe(false);
  });

  it("creates a stable empty query", () => {
    expect(emptyDataQuery()).toMatchObject({
      datasetId: "",
      offset: 0,
      limit: 80,
      varyingDimensions: [],
    });
  });
});

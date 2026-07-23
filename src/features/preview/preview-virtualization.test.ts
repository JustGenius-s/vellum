import { describe, expect, it } from "vite-plus/test";

import { previewVirtualRange } from "@/features/preview/preview-virtualization";

describe("previewVirtualRange", () => {
  it("mounts visible pages with two pages of total overscan on each side", () => {
    expect(previewVirtualRange([5, 6], 20)).toEqual({ from: 3, to: 8 });
    expect(previewVirtualRange([0, 1], 20)).toEqual({ from: 0, to: 3 });
    expect(previewVirtualRange([18, 19], 20)).toEqual({ from: 16, to: 19 });
  });

  it("uses the first page before intersection state is available", () => {
    expect(previewVirtualRange([], 8)).toEqual({ from: 0, to: 2 });
    expect(previewVirtualRange([12], 2)).toEqual({ from: 0, to: 1 });
    expect(previewVirtualRange([], 0)).toEqual({ from: 0, to: -1 });
  });
});

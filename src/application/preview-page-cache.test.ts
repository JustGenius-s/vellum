import { describe, expect, it } from "vite-plus/test";

import { PreviewPageCache } from "@/application/preview-page-cache";

describe("PreviewPageCache", () => {
  it("merges changed SVG pages while preserving unchanged page strings and order", () => {
    const cache = new PreviewPageCache();
    const first = cache.merge(
      [
        { id: "a", width: 100, height: 200 },
        { id: "b", width: 100, height: 200 },
      ],
      [
        { id: "a", svg: "<svg>a</svg>" },
        { id: "b", svg: "<svg>b</svg>" },
      ],
    );
    const second = cache.merge(
      [
        { id: "b", width: 100, height: 200 },
        { id: "c", width: 200, height: 100 },
      ],
      [{ id: "c", svg: "<svg>c</svg>" }],
    );

    expect(second).toEqual([
      { id: "b", width: 100, height: 200, svg: "<svg>b</svg>" },
      { id: "c", width: 200, height: 100, svg: "<svg>c</svg>" },
    ]);
    expect(second[0].svg).toBe(first[1].svg);
    expect(cache.ids()).toEqual(["a", "b", "c"]);
  });

  it("supports duplicate page hashes and rejects incomplete patches", () => {
    const cache = new PreviewPageCache();
    const pages = cache.merge(
      [
        { id: "same", width: 10, height: 20 },
        { id: "same", width: 10, height: 20 },
      ],
      [{ id: "same", svg: "<svg />" }],
    );
    expect(pages).toHaveLength(2);
    expect(() => cache.merge([{ id: "missing", width: 1, height: 1 }], [])).toThrow(
      "Missing SVG patch",
    );
  });
});

import { describe, expect, it } from "vite-plus/test";

import { decodeImageDataUrl } from "@/infrastructure/image-data";

describe("preview image data", () => {
  it("decodes base64 images without changing their original format", () => {
    const image = decodeImageDataUrl("data:image/png;base64,AQID");
    expect(image.mediaType).toBe("image/png");
    expect(image.extension).toBe("png");
    expect([...image.bytes]).toEqual([1, 2, 3]);
  });

  it("supports encoded SVG data and rejects non-image sources", () => {
    const image = decodeImageDataUrl(
      "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E",
    );
    expect(image.extension).toBe("svg");
    expect(image.blob.type).toBe("image/svg+xml");
    expect(() => decodeImageDataUrl("data:text/plain,hello")).toThrow(/not an image/i);
  });
});

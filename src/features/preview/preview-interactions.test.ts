import { describe, expect, it } from "vite-plus/test";

import { resolvePreviewHref, resolvePreviewLabel } from "@/features/preview/preview-interactions";

describe("preview interactions", () => {
  it("classifies workspace and supported external links", () => {
    expect(resolvePreviewHref("notes/method.typ")).toEqual({
      kind: "workspace-link",
      target: "notes/method.typ",
    });
    expect(resolvePreviewHref("https://typst.app/docs")).toEqual({
      kind: "external-link",
      href: "https://typst.app/docs",
    });
    expect(resolvePreviewHref("mailto:editor@example.com")).toEqual({
      kind: "external-link",
      href: "mailto:editor@example.com",
    });
  });

  it("blocks protocols and fragments that the preview does not own", () => {
    expect(resolvePreviewHref("javascript:alert(1)")).toEqual({
      kind: "blocked-link",
      href: "javascript:alert(1)",
    });
    expect(resolvePreviewHref("#appendix")).toEqual({
      kind: "blocked-link",
      href: "#appendix",
    });
  });

  it("exposes an explicit label convention for custom Typst elements", () => {
    expect(resolvePreviewLabel("vellum:open:reading/systems.typ")).toEqual({
      kind: "workspace-link",
      target: "reading/systems.typ",
    });
    expect(resolvePreviewLabel("chapter:introduction")).toBeNull();
    expect(resolvePreviewLabel("vellum:open:")).toBeNull();
  });
});

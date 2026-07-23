import type {
  ChangedPreviewPage,
  PreviewPage,
  PreviewPageOrder,
} from "@/domain/workspace";

export class PreviewPageCache {
  private readonly svgById = new Map<string, string>();

  merge(pageOrder: PreviewPageOrder[], changedPages: ChangedPreviewPage[]): PreviewPage[] {
    for (const page of changedPages) this.svgById.set(page.id, page.svg);
    return pageOrder.map((page) => {
      const svg = this.svgById.get(page.id);
      if (svg == null) throw new Error(`Missing SVG patch for page ${page.id}`);
      return { ...page, svg };
    });
  }

  clear() {
    this.svgById.clear();
  }

  ids() {
    return [...this.svgById.keys()];
  }
}

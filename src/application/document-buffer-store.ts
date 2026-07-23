import { Text } from "@codemirror/state";
import type { CompileOverlay } from "@/application/ports/workspace-gateway";
import type { DocumentTab } from "@/domain/workspace";
import { isDataFile } from "@/domain/data";

interface BufferEntry {
  text: Text;
  revision: number;
}

export class DocumentBufferStore {
  private readonly entries = new Map<string, BufferEntry>();

  open(path: string, content: string, revision = 0) {
    const text = Text.of(content.split("\n"));
    this.entries.set(path, { text, revision });
    return text;
  }

  close(path: string) {
    this.entries.delete(path);
  }

  clear() {
    this.entries.clear();
  }

  rename(from: string, to: string) {
    const entry = this.entries.get(from);
    if (!entry) return;
    this.entries.delete(from);
    this.entries.set(to, entry);
  }

  has(path: string) {
    return this.entries.has(path);
  }

  getText(path: string) {
    return this.entries.get(path)?.text ?? Text.empty;
  }

  getString(path: string) {
    return this.getText(path).toString();
  }

  getRevision(path: string) {
    return this.entries.get(path)?.revision ?? 0;
  }

  replace(path: string, text: Text | string) {
    const current = this.entries.get(path);
    const nextText = typeof text === "string" ? Text.of(text.split("\n")) : text;
    if (current?.text === nextText) return current.revision;
    const revision = (current?.revision ?? 0) + 1;
    this.entries.set(path, { text: nextText, revision });
    return revision;
  }
}

export function collectCompileOverlays(
  tabs: DocumentTab[],
  buffers: DocumentBufferStore,
  mainPath: string,
  mainContent?: string,
): CompileOverlay[] {
  const overlays = tabs
    .filter((tab) => tab.path === mainPath || tab.dirty)
    .filter((tab) => !isDataFile(tab.path))
    .map((tab) => ({
      path: tab.path,
      revision: tab.revision,
      content:
        tab.path === mainPath && mainContent != null
          ? mainContent
          : buffers.getString(tab.path),
    }));
  if (!overlays.some((overlay) => overlay.path === mainPath) && mainContent != null) {
    overlays.push({ path: mainPath, revision: 0, content: mainContent });
  }
  return overlays.sort((left, right) =>
    left.path === mainPath ? -1 : right.path === mainPath ? 1 : left.path.localeCompare(right.path),
  );
}

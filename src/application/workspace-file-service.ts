import type { WorkspaceGateway } from "@/application/ports/workspace-gateway";
import type { WorkspaceState } from "@/application/workspace-state";
import {
  fileName,
  fileStem,
  resolveDocumentTarget,
  type CompileDiagnostic,
  type SearchMatch,
  type TreeNode,
} from "@/domain/workspace";

interface WorkspaceFileHost {
  gateway: WorkspaceGateway;
  getState(): WorkspaceState;
  update(patch: Partial<WorkspaceState>): void;
  refreshTree(): Promise<void>;
  openFile(path: string, line?: number): Promise<void>;
  scheduleSessionSave(): void;
  compileActive(): Promise<void>;
  revealLine(line: number): void;
  getActiveStem(): string;
}

function isSameOrDescendant(candidate: string, parent: string) {
  return (
    candidate === parent ||
    candidate.startsWith(`${parent}/`) ||
    candidate.startsWith(`${parent}\\`)
  );
}

function replacePathPrefix(path: string, oldPath: string, newPath: string) {
  return isSameOrDescendant(path, oldPath) ? `${newPath}${path.slice(oldPath.length)}` : path;
}

function joinPath(parent: string, name: string) {
  const separator = parent.includes("\\") ? "\\" : "/";
  return `${parent.replace(/[\\/]$/, "")}${separator}${name}`;
}

function parentPath(path: string) {
  const normalized = path.replaceAll("\\", "/");
  return normalized.slice(0, normalized.lastIndexOf("/")) || normalized;
}

export class WorkspaceFileService {
  private readonly host: WorkspaceFileHost;

  constructor(host: WorkspaceFileHost) {
    this.host = host;
  }

  private setStatus(statusText: string) {
    this.host.update({ statusText });
  }

  async createEntry(parent: string, name: string, isDir: boolean) {
    const state = this.host.getState();
    const safeName =
      isDir || /\.(?:typ|md|bib|csv|tsv|json|jsonl|ndjson)$/i.test(name.toLowerCase())
        ? name
        : `${name}.typ`;
    const path = joinPath(parent || state.vaultPath, safeName);
    try {
      await this.host.gateway.createEntry(path, state.vaultPath, isDir);
      await this.host.refreshTree();
      this.setStatus(`${isDir ? "Folder" : "Document"} created`);
      if (!isDir) await this.host.openFile(path);
    } catch (error) {
      this.setStatus(`Create failed: ${String(error)}`);
      throw error;
    }
  }

  async renameEntry(path: string, name: string) {
    const state = this.host.getState();
    const pathMatch = /\.([^.]+)$/i.exec(path);
    const suffix = pathMatch && !/\.[^.]+$/i.test(name) ? `.${pathMatch[1]}` : "";
    const nextPath = joinPath(parentPath(path), `${name}${suffix}`);
    try {
      await this.host.gateway.renameEntry(path, nextPath, state.vaultPath);
      const tabs = state.tabs.map((tab) => {
        const nextTabPath = replacePathPrefix(tab.path, path, nextPath);
        return nextTabPath === tab.path
          ? tab
          : { ...tab, path: nextTabPath, name: fileName(nextTabPath) };
      });
      this.host.update({
        tabs,
        activePath: replacePathPrefix(state.activePath, path, nextPath),
        statusText: "Entry renamed",
      });
      await this.host.refreshTree();
      this.host.scheduleSessionSave();
      await this.host.compileActive();
    } catch (error) {
      this.setStatus(`Rename failed: ${String(error)}`);
      throw error;
    }
  }

  async deleteEntry(path: string) {
    if (!window.confirm(`Delete “${fileName(path)}”? This cannot be undone.`)) return;
    const state = this.host.getState();
    try {
      await this.host.gateway.deleteEntry(path, state.vaultPath);
      const tabs = state.tabs.filter((tab) => !isSameOrDescendant(tab.path, path));
      const activePath = isSameOrDescendant(state.activePath, path)
        ? (tabs[0]?.path ?? "")
        : state.activePath;
      this.host.update({ tabs, activePath, statusText: "Entry deleted" });
      await this.host.refreshTree();
      this.host.scheduleSessionSave();
      if (activePath) await this.host.compileActive();
    } catch (error) {
      this.setStatus(`Delete failed: ${String(error)}`);
    }
  }

  async search(query: string) {
    const state = this.host.getState();
    this.host.update({ searchQuery: query });
    if (!query.trim() || !state.vaultPath) {
      this.host.update({ searchResults: [], searchPending: false });
      return;
    }
    this.host.update({ searchPending: true });
    try {
      const searchResults = await this.host.gateway.search(state.vaultPath, query);
      this.host.update({
        searchResults,
        searchPending: false,
        statusText: `${searchResults.length} matches`,
      });
    } catch (error) {
      this.host.update({ searchPending: false, statusText: `Search failed: ${String(error)}` });
    }
  }

  openSearchMatch(match: SearchMatch) {
    return this.host.openFile(match.path, match.line);
  }

  async openByStem(stem: string) {
    const find = (nodes: TreeNode[]): string | null => {
      for (const node of nodes) {
        if (node.isDir) {
          const nested = find(node.children);
          if (nested) return nested;
        } else if (fileStem(node.path) === stem) return node.path;
      }
      return null;
    };
    const path = find(this.host.getState().tree);
    if (path) await this.host.openFile(path);
  }

  async openPreviewDocument(target: string) {
    const state = this.host.getState();
    const path = resolveDocumentTarget(state.tree, target, state.activePath, state.vaultPath);
    if (!path) {
      this.setStatus(`Preview link target not found: ${target}`);
      return;
    }
    await this.host.openFile(path);
  }

  async openExternalLink(url: string) {
    const protocol = /^([a-z][a-z\d+.-]*):/i.exec(url.trim())?.[1]?.toLowerCase();
    if (!protocol || !["http", "https", "mailto", "tel"].includes(protocol)) {
      this.rejectPreviewLink(url);
      return;
    }
    try {
      await this.host.gateway.openExternalUrl(url);
      this.setStatus("Opened external link");
    } catch (error) {
      this.setStatus(`Could not open external link: ${String(error)}`);
    }
  }

  async copyPreviewImage(source: string) {
    try {
      await this.host.gateway.copyPreviewImage(source);
      this.setStatus("Image copied");
    } catch (error) {
      this.setStatus(`Could not copy image: ${String(error)}`);
    }
  }

  async downloadPreviewImage(source: string) {
    try {
      const defaultStem = `${this.host.getActiveStem() || "vellum"}-image`;
      const saved = await this.host.gateway.downloadPreviewImage(source, defaultStem);
      if (saved) this.setStatus("Image downloaded");
    } catch (error) {
      this.setStatus(`Could not download image: ${String(error)}`);
    }
  }

  rejectPreviewLink(url: string) {
    this.setStatus(`Unsupported preview link: ${url}`);
  }

  async openDiagnostic(diagnostic: CompileDiagnostic) {
    if (!diagnostic.path) {
      if (diagnostic.line) this.host.revealLine(diagnostic.line);
      return;
    }
    const state = this.host.getState();
    const separator = state.vaultPath.includes("\\") ? "\\" : "/";
    const normalized = diagnostic.path.replace(/^[/\\]+/, "").replaceAll(/[\\/]/g, separator);
    await this.host.openFile(joinPath(state.vaultPath, normalized), diagnostic.line ?? undefined);
  }
}

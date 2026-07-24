import { isDataFile } from "@/domain/data";
import { fileName } from "@/domain/workspace";
import { DocumentBufferStore } from "@/application/document-buffer-store";
import type {
  FilePort,
  WorkspaceFileChange,
} from "@/application/ports/workspace-gateway";
import type { WorkspaceState } from "@/application/workspace-state";

interface WorkspaceFileSyncHost {
  gateway: FilePort;
  buffers: DocumentBufferStore;
  getState(): WorkspaceState;
  update(patch: Partial<WorkspaceState>): void;
  refreshBacklinks(): Promise<void>;
  compileActive(): Promise<void>;
}

function comparablePath(path: string) {
  return path.replace(/^[/\\]{2}\?[/\\]/, "").replaceAll("\\", "/");
}

function documentCount(count: number, suffix: string) {
  return `${count} ${suffix} document${count === 1 ? "" : "s"}`;
}

export class WorkspaceFileSyncService {
  private readonly host: WorkspaceFileSyncHost;
  private watchGeneration = 0;
  private stopWatching: (() => void) | null = null;
  private refreshQueue = Promise.resolve();

  constructor(host: WorkspaceFileSyncHost) {
    this.host = host;
  }

  stop() {
    this.watchGeneration += 1;
    this.stopWatching?.();
    this.stopWatching = null;
  }

  watch(vaultPath: string) {
    this.stop();
    const generation = this.watchGeneration;
    void this.host.gateway
      .watchWorkspace(vaultPath, (change) => {
        if (generation !== this.watchGeneration || this.host.getState().vaultPath !== vaultPath) {
          return;
        }
        this.queueRefresh(vaultPath, generation, change);
      })
      .then((stop) => {
        if (generation !== this.watchGeneration || this.host.getState().vaultPath !== vaultPath) {
          stop();
          return;
        }
        this.stopWatching = stop;
      })
      .catch((error) => {
        if (generation === this.watchGeneration && this.host.getState().vaultPath === vaultPath) {
          this.host.update({ statusText: `Automatic refresh unavailable: ${String(error)}` });
        }
      });
  }

  refresh() {
    return this.refreshFromDisk(false, [], this.watchGeneration);
  }

  private queueRefresh(vaultPath: string, generation: number, change: WorkspaceFileChange) {
    this.refreshQueue = this.refreshQueue
      .then(async () => {
        if (
          generation !== this.watchGeneration ||
          this.host.getState().vaultPath !== vaultPath
        ) {
          return;
        }
        await this.refreshFromDisk(true, change.paths, generation);
      })
      .catch((error) => {
        if (
          generation === this.watchGeneration &&
          this.host.getState().vaultPath === vaultPath
        ) {
          this.host.update({ statusText: `Automatic refresh failed: ${String(error)}` });
        }
      });
  }

  private async refreshFromDisk(
    automatic: boolean,
    changedPaths: string[],
    generation: number,
  ) {
    const state = this.host.getState();
    const vaultPath = state.vaultPath;
    if (!vaultPath || generation !== this.watchGeneration) return;
    const sourceTabs = state.tabs;
    const textTabs = sourceTabs.filter((tab) => !tab.dirty && !isDataFile(tab.path));

    try {
      const [tree, reads] = await Promise.all([
        this.host.gateway.listTree(vaultPath),
        Promise.all(
          textTabs.map(async (tab) => {
            try {
              const content = await this.host.gateway.readFile(tab.path, vaultPath);
              return { ok: true as const, path: tab.path, revision: tab.revision, content };
            } catch (error) {
              return { ok: false as const, path: tab.path, revision: tab.revision, error };
            }
          }),
        ),
      ]);
      if (
        generation !== this.watchGeneration ||
        this.host.getState().vaultPath !== vaultPath
      ) {
        return;
      }

      const changedPathSet = new Set(changedPaths.map(comparablePath));
      const isAffected = (path: string) =>
        !automatic || changedPathSet.size === 0 || changedPathSet.has(comparablePath(path));
      const preservedPaths = new Set(
        sourceTabs.filter((tab) => tab.dirty && isAffected(tab.path)).map((tab) => tab.path),
      );
      const failedPaths = new Set<string>();
      const revisions = new Map<string, number>();

      for (const read of reads) {
        const current = this.host.getState().tabs.find((tab) => tab.path === read.path);
        if (!current) continue;
        if (current.dirty) {
          if (isAffected(current.path)) preservedPaths.add(current.path);
          continue;
        }
        if (current.revision !== read.revision) continue;
        if (!read.ok) {
          if (isAffected(current.path)) failedPaths.add(current.path);
          continue;
        }
        if (this.host.buffers.getString(current.path) === read.content) continue;
        revisions.set(current.path, this.host.buffers.replace(current.path, read.content));
      }

      const current = this.host.getState();
      const tabs = current.tabs.map((tab) => {
        const revision = revisions.get(tab.path);
        return revision == null ? tab : { ...tab, revision, dirty: false };
      });
      const reloadedPaths = [...revisions.keys()];
      const statusText = automatic
        ? this.automaticStatus(reloadedPaths, preservedPaths, failedPaths)
        : this.manualStatus(reloadedPaths.length, preservedPaths.size, failedPaths.size);

      this.host.update({ tree, tabs, ...(statusText ? { statusText } : {}) });
      void this.host.refreshBacklinks();

      if (generation !== this.watchGeneration) return;
      const activePath = current.activePath;
      const activeKey = comparablePath(activePath);
      const activeReloaded = revisions.has(activePath);
      const activeDataChanged = isDataFile(activePath) && changedPathSet.has(activeKey);
      const dependencyChanged =
        changedPaths.length === 0 ||
        changedPaths.some((path) => comparablePath(path) !== activeKey);
      if (activePath && (!automatic || activeReloaded || activeDataChanged || dependencyChanged)) {
        await this.host.compileActive();
      }
    } catch (error) {
      this.host.update({
        statusText: `${automatic ? "Automatic refresh" : "Refresh"} failed: ${String(error)}`,
      });
    }
  }

  private automaticStatus(
    reloadedPaths: string[],
    preservedPaths: Set<string>,
    failedPaths: Set<string>,
  ) {
    const details: string[] = [];
    if (reloadedPaths.length === 1) {
      details.push(`Reloaded ${fileName(reloadedPaths[0])} from disk`);
    } else if (reloadedPaths.length > 1) {
      details.push(`${documentCount(reloadedPaths.length, "open")} reloaded from disk`);
    }
    if (preservedPaths.size === 1) {
      details.push(`kept unsaved changes in ${fileName([...preservedPaths][0])}`);
    } else if (preservedPaths.size > 1) {
      details.push(`${documentCount(preservedPaths.size, "unsaved")} kept`);
    }
    if (failedPaths.size > 0) {
      details.push(`${documentCount(failedPaths.size, "open")} unavailable`);
    }
    return details.join("; ") || undefined;
  }

  private manualStatus(reloaded: number, preserved: number, failed: number) {
    const details = ["Files refreshed"];
    if (reloaded > 0) details.push(`${documentCount(reloaded, "open")} reloaded`);
    if (preserved > 0) details.push(`${documentCount(preserved, "unsaved")} kept`);
    if (failed > 0) details.push(`${documentCount(failed, "open")} unavailable`);
    return details.join("; ");
  }
}

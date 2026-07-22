export interface WorkspaceFileSnapshot {
  content: string;
  revision: string;
  exists: boolean;
  buffered: boolean;
  dirty: boolean;
}

interface WorkspaceFileValue {
  content: string;
  exists: boolean;
  buffered: boolean;
  dirty: boolean;
}

interface WorkspaceMutationIo {
  read(path: string): Promise<WorkspaceFileValue>;
  write(path: string, content: string, current: WorkspaceFileSnapshot): Promise<{ saved: boolean }>;
}

export function workspaceContentRevision(content: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `v1-${content.length.toString(36)}-${(hash >>> 0).toString(36)}`;
}

export class WorkspaceMutationCoordinator {
  private readonly tails = new Map<string, Promise<void>>();
  private readonly io: WorkspaceMutationIo;

  constructor(io: WorkspaceMutationIo) {
    this.io = io;
  }

  async read(path: string): Promise<WorkspaceFileSnapshot> {
    const value = await this.io.read(path);
    return { ...value, revision: workspaceContentRevision(value.content) };
  }

  async write(path: string, content: string, expectedRevision?: string | null) {
    return this.withPaths([path], async () => {
      const current = await this.read(path);
      if (current.exists && expectedRevision == null) {
        throw new Error(`File conflict: read ${path} before writing and pass its revision`);
      }
      if (expectedRevision != null && current.revision !== expectedRevision) {
        throw new Error(`File conflict: ${path} changed; read it again before retrying`);
      }
      const result = await this.io.write(path, content, current);
      return {
        path,
        revision: workspaceContentRevision(content),
        characters: content.length,
        saved: result.saved,
      };
    });
  }

  withPaths<T>(paths: string[], operation: () => Promise<T>): Promise<T> {
    const keys = [...new Set(paths)].sort();
    const waitFor = keys.map((key) => this.tails.get(key) ?? Promise.resolve());
    let release: () => void = () => {};
    const tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    keys.forEach((key) => this.tails.set(key, tail));
    return Promise.all(waitFor)
      .then(operation)
      .finally(() => {
        release();
        keys.forEach((key) => {
          if (this.tails.get(key) === tail) this.tails.delete(key);
        });
      });
  }
}

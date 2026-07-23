import type { WorkspaceAgentToolHandlers } from "@/application/ai/agent-types";
import type { WorkspaceTaskHost } from "@/application/ai/workspace-task-host";
import {
  isBinaryDataFile,
  isFigureTarget,
  isWorkspaceTextFile,
} from "@/application/workspace-file-policy";
import { isDataFile, type DataCatalog, type DataQuery } from "@/domain/data";
import type { AiTask, AiTaskStage } from "@/domain/ai-task";
import {
  flattenFiles,
  relativePath,
  resolveWorkspacePath,
} from "@/domain/workspace";

export type DataProjectionInput = Parameters<WorkspaceAgentToolHandlers["readDataProjection"]>[0];
export type FileWriteInput = Parameters<WorkspaceAgentToolHandlers["writeWorkspaceFile"]>[0];

interface DataProjectionDefaults {
  sourcePath: string;
  catalog: DataCatalog;
  query: DataQuery;
}

interface FileWriteHooks {
  validate?(path: string, content: string): void;
  written?(path: string, content: string, saved: boolean): void;
}

export class WorkspaceToolRuntime {
  readonly task: AiTask;
  readonly vaultPath: string;
  private readonly host: WorkspaceTaskHost;
  private readonly taskId: string;
  private readonly signal: AbortSignal;

  constructor(host: WorkspaceTaskHost, task: AiTask, taskId: string, signal: AbortSignal) {
    this.host = host;
    this.task = task;
    this.taskId = taskId;
    this.signal = signal;
    this.vaultPath = task.source.vaultPath;
  }

  relative(path: string) {
    return relativePath(path, this.vaultPath);
  }

  normalize(path: string) {
    const normalized = path.replaceAll("\\", "/");
    return this.vaultPath.includes("\\") ? normalized.toLowerCase() : normalized;
  }

  resolveExisting(requestedPath: string) {
    const resolved = resolveWorkspacePath(requestedPath, this.vaultPath);
    const comparable = this.normalize(resolved);
    const file = flattenFiles(this.host.getState().tree).find(
      (candidate) => this.normalize(candidate.path) === comparable,
    );
    if (!file) throw new Error(`Workspace file not found: ${requestedPath}`);
    return file.path;
  }

  async readText(path: string) {
    if (isBinaryDataFile(path)) throw new Error("Use read_data_projection for binary data files");
    if (!isWorkspaceTextFile(path)) {
      throw new Error("Only UTF-8 text project files can be read with this tool");
    }
    return this.host.mutations.read(path);
  }

  updateStage(stage: AiTaskStage, progress: number) {
    this.host.patchTask(this.taskId, { stage, progress });
  }

  addFileChange(path: string, operation: "created" | "updated" | "inserted", saved: boolean) {
    this.host.updateTask(this.taskId, (task) => ({
      ...task,
      fileChanges: [
        ...task.fileChanges,
        {
          id: `change-${crypto.randomUUID()}`,
          path,
          operation,
          saved,
          createdAt: Date.now(),
        },
      ],
    }));
  }

  listWorkspaceFiles: WorkspaceAgentToolHandlers["listWorkspaceFiles"] = async ({ query }) => {
    this.signal.throwIfAborted();
    const normalizedQuery = query?.trim().toLowerCase() ?? "";
    const files = flattenFiles(this.host.getState().tree)
      .map((file) => this.relative(file.path))
      .filter((path) => !normalizedQuery || path.toLowerCase().includes(normalizedQuery))
      .slice(0, 400);
    this.updateStage("analyzing", 12);
    return { files, truncated: files.length === 400 };
  };

  readWorkspaceFile: WorkspaceAgentToolHandlers["readWorkspaceFile"] = async ({ path }) => {
    this.signal.throwIfAborted();
    const resolved = this.resolveExisting(path);
    const snapshot = await this.readText(resolved);
    if (snapshot.content.length > 160_000) {
      throw new Error("The requested file is too large for chat context");
    }
    this.updateStage("analyzing", 22);
    return {
      path: this.relative(resolved),
      content: snapshot.content,
      revision: snapshot.revision,
      buffered: snapshot.buffered,
      dirty: snapshot.dirty,
    };
  };

  async readDataProjection(input: DataProjectionInput, defaults?: DataProjectionDefaults) {
    this.signal.throwIfAborted();
    const requested = input.path?.trim() || defaults?.sourcePath;
    if (!requested) throw new Error("Choose a data file path to read a projection");
    const path = this.resolveExisting(requested);
    if (!isDataFile(path)) throw new Error("Choose a supported data file");
    const sameAsSource = defaults && this.normalize(path) === this.normalize(defaults.sourcePath);
    const catalog = sameAsSource
      ? defaults.catalog
      : await this.host.gateway.inspectData({ path, vaultPath: this.vaultPath });
    const dataset =
      catalog.datasets.find((candidate) => candidate.id === input.datasetId) ??
      (sameAsSource
        ? catalog.datasets.find((candidate) => candidate.id === defaults.query.datasetId)
        : null) ??
      catalog.datasets[0];
    if (!dataset) throw new Error("The data file contains no readable datasets");
    const baseQuery =
      sameAsSource && dataset.id === defaults.query.datasetId
        ? defaults.query
        : this.host.queryForDataset(dataset);
    const query: DataQuery = {
      ...baseQuery,
      datasetId: dataset.id,
      offset: Math.max(0, Math.floor(input.offset ?? baseQuery.offset)),
      limit: Math.min(400, Math.max(1, Math.floor(input.limit ?? baseQuery.limit))),
      varyingDimensions:
        input.varyingDimensions?.map((value) => Math.max(0, Math.floor(value))).slice(0, 2) ??
        baseQuery.varyingDimensions,
      fixedDimensions:
        input.fixedDimensions?.map(({ dimension, index }) => ({
          dimension: Math.max(0, Math.floor(dimension)),
          index: Math.max(0, Math.floor(index)),
        })) ?? baseQuery.fixedDimensions,
      exactStatistics: input.exactStatistics ?? baseQuery.exactStatistics,
    };
    const preview = await this.host.gateway.previewData({ path, vaultPath: this.vaultPath, query });
    this.updateStage("analyzing", 28);
    return { path, sameAsSource: Boolean(sameAsSource), catalog, query, preview };
  }

  async writeWorkspaceFile(input: FileWriteInput, hooks: FileWriteHooks = {}) {
    this.signal.throwIfAborted();
    if (input.content.length > 200_000) throw new Error("The file content is too large");
    const resolved = resolveWorkspacePath(input.path, this.vaultPath);
    if (!isWorkspaceTextFile(resolved) || isBinaryDataFile(resolved)) {
      throw new Error("The workspace write tool only supports UTF-8 text files");
    }
    hooks.validate?.(resolved, input.content);
    const existed = flattenFiles(this.host.getState().tree).some(
      (candidate) => this.normalize(candidate.path) === this.normalize(resolved),
    );
    const result = await this.host.mutations.write(
      resolved,
      input.content,
      input.expectedRevision,
    );
    this.updateStage("writing", 58);
    this.addFileChange(resolved, existed ? "updated" : "created", result.saved);
    hooks.written?.(resolved, input.content, result.saved);
    await this.host.refreshTree();
    return {
      path: this.relative(resolved),
      revision: result.revision,
      characters: result.characters,
      saved: result.saved,
    };
  }

  async compileTypst(path: string, figureOnly = false) {
    this.signal.throwIfAborted();
    const resolved = this.resolveExisting(path);
    if (figureOnly ? !resolved.toLowerCase().endsWith(".typ") : !isFigureTarget(resolved)) {
      throw new Error(
        figureOnly
          ? "compile_typst requires a .typ file"
          : "compile_typst requires a Typst or Markdown document",
      );
    }
    const source = await this.readText(resolved);
    this.updateStage("compiling", 72);
    const state = this.host.getState();
    const result = await this.host.gateway.compileSvg(
      {
        requestId: crypto.randomUUID(),
        intent: "validate",
        vaultPath: this.vaultPath,
        mainFile: resolved,
        latinFont: state.latinFont,
        cjkFont: state.cjkFont,
        packageCachePath: state.packageCachePath,
        packageDataPath: state.packageDataPath,
        cachedPageIds: [],
        overlays: this.host.compileOverlays(resolved, source.content),
      },
      (progress) => {
        if (!this.signal.aborted) {
          this.updateStage("compiling", Math.min(94, 72 + Math.round(progress.value * 0.22)));
        }
      },
    );
    const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
    this.updateStage(errors.length ? "repairing" : "compiling", errors.length ? 78 : 96);
    return { success: errors.length === 0, diagnostics: result.diagnostics };
  }

  commonHandlers(): Pick<
    WorkspaceAgentToolHandlers,
    | "listWorkspaceFiles"
    | "readWorkspaceFile"
    | "readDataProjection"
    | "writeWorkspaceFile"
    | "compileTypst"
  > {
    return {
      listWorkspaceFiles: this.listWorkspaceFiles,
      readWorkspaceFile: this.readWorkspaceFile,
      readDataProjection: (input) =>
        this.readDataProjection(input).then(({ path, catalog, query, preview }) => ({
          path: this.relative(path),
          catalog,
          query,
          preview,
        })),
      writeWorkspaceFile: (input) => this.writeWorkspaceFile(input),
      compileTypst: ({ path }) => this.compileTypst(path),
    };
  }
}

export function previousTaskMessages(
  task: AiTask,
  userMessageId: string,
  assistantMessageId: string,
) {
  return task.messages
    .filter(
      (message) =>
        message.id !== userMessageId &&
        message.id !== assistantMessageId &&
        message.role !== "system",
    )
    .map((message) => ({
      role: message.role as "user" | "assistant",
      text: message.parts
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join("\n")
        .trim(),
    }))
    .filter((message) => message.text);
}

export function taskContextPaths(task: AiTask, inputPaths: string[]) {
  return [...new Set([...task.contextPaths, ...inputPaths])];
}

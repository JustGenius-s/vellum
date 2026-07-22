import { runWorkspaceAgent } from "@/application/ai/agent-runtime";
import type { AiTaskExecutionContext } from "@/application/ai/ai-task-manager";
import { extractTypstSource, validateTypstChartSource } from "@/application/ai/typst-figure-source";
import type { WorkspaceTaskHost } from "@/application/ai/workspace-task-host";
import {
  previousTaskMessages,
  taskContextPaths,
  WorkspaceToolRuntime,
} from "@/application/ai/workspace-tool-runtime";
import type { PreparedDataFigure } from "@/domain/data";
import type { AiMessageContentPart, AiTask } from "@/domain/ai-task";
import { fileStem } from "@/domain/workspace";

export async function runFigureTask(
  host: WorkspaceTaskHost,
  task: AiTask,
  { taskId, input, assistantMessageId, signal }: AiTaskExecutionContext,
) {
  if (task.source.kind !== "data-figure") throw new Error("Expected a figure task");
  const runtime = new WorkspaceToolRuntime(host, task, taskId, signal);
  const state = host.getState();
  const sourceCatalog = await host.gateway.inspectData({
    path: task.source.path,
    vaultPath: task.source.vaultPath,
  });
  let projectionQuery = structuredClone(task.source.query);
  let preparedFigure: PreparedDataFigure | null = task.result;
  let figureInserted = false;
  const common = runtime.commonHandlers();
  const result = await runWorkspaceAgent({
    config: {
      baseUrl: state.aiBaseUrl,
      model: state.aiModel,
      apiKey: state.aiApiKey,
    },
    context: {
      taskKind: "data-figure",
      activeDataPath: runtime.relative(task.source.path),
      contextPaths: taskContextPaths(task, input.contextPaths).map((path) => runtime.relative(path)),
      request: input.text,
      priorMessages: previousTaskMessages(task, input.userMessageId, assistantMessageId),
    },
    handlers: {
      ...common,
      readDataProjection: async (request) => {
        const projection = await runtime.readDataProjection(request, {
          sourcePath: task.source.path,
          catalog: sourceCatalog,
          query: projectionQuery,
        });
        if (projection.sameAsSource) projectionQuery = projection.query;
        return {
          path: runtime.relative(projection.path),
          catalog: projection.catalog,
          query: projection.query,
          preview: projection.preview,
        };
      },
      writeWorkspaceFile: (request) =>
        runtime.writeWorkspaceFile(request, {
          validate: (path, content) => {
            if (preparedFigure && runtime.normalize(path) === runtime.normalize(preparedFigure.typstPath)) {
              validateTypstChartSource(content);
            }
          },
          written: (path, content) => {
            if (!preparedFigure || runtime.normalize(path) !== runtime.normalize(preparedFigure.typstPath)) {
              return;
            }
            const current = host.getTask(taskId);
            host.patchTask(taskId, {
              stage: "repairing",
              progress: 78,
              generatedSource: content,
              repairs: (current?.repairs ?? 0) + 1,
            });
          },
        }),
      writeDataFigure: async ({ title, typstSource }) => {
        signal.throwIfAborted();
        const source = extractTypstSource(typstSource);
        validateTypstChartSource(source);
        host.patchTask(taskId, { stage: "writing", progress: 44, generatedSource: source });
        preparedFigure = await host.gateway.prepareDataFigure({
          path: task.source.path,
          vaultPath: task.source.vaultPath,
          query: projectionQuery,
          model: state.aiModel.trim(),
          prompt: input.text,
          title: title?.trim() || fileStem(task.source.path),
          typstSource: source,
        });
        const figure = preparedFigure;
        host.updateTask(taskId, (current) => ({
          ...current,
          result: figure,
          artifacts: [
            ...current.artifacts.filter((artifact) => artifact.path !== figure.typstPath),
            {
              id: figure.id,
              kind: "typst-figure",
              label: title?.trim() || fileStem(task.source.path),
              path: figure.typstPath,
              relatedPaths: [figure.dataPath, figure.metadataPath],
              createdAt: Date.now(),
            },
          ],
        }));
        runtime.addFileChange(figure.typstPath, "created", true);
        await host.refreshTree();
        return {
          id: figure.id,
          typstPath: runtime.relative(figure.typstPath),
          dataPath: runtime.relative(figure.dataPath),
          metadataPath: runtime.relative(figure.metadataPath),
        };
      },
      compileTypst: ({ path }) => runtime.compileTypst(path, true),
      insertFigure: async ({ targetPath, placement }) => {
        signal.throwIfAborted();
        if (!preparedFigure) throw new Error("Create the figure bundle before inserting it");
        const resolved = runtime.resolveExisting(targetPath);
        runtime.updateStage("inserting", 92);
        await host.mutations.withPaths([resolved], () =>
          host.insertFigure(preparedFigure!, resolved, placement ?? "cursor"),
        );
        figureInserted = true;
        runtime.addFileChange(resolved, "inserted", false);
        return { targetPath: runtime.relative(resolved), placement: placement ?? "cursor", saved: false };
      },
    },
    abortSignal: signal,
    fetch: (request, init) => host.gateway.aiFetch(request, init),
    onContentUpdate: (content) => host.updateAssistant(taskId, assistantMessageId, content),
  });
  signal.throwIfAborted();
  const finalFigure = preparedFigure ?? host.getTask(taskId)?.result;
  if (!finalFigure) throw new Error("The AI finished without creating a figure bundle");
  const finalContent: AiMessageContentPart[] = [
    ...result.content,
    { id: `artifact-${finalFigure.id}`, type: "artifact", artifactId: finalFigure.id },
  ];
  host.updateAssistant(taskId, assistantMessageId, finalContent);
  host.patchTask(taskId, { result: finalFigure, stage: "complete", progress: 100, error: "" });
  host.setStatus(figureInserted ? "Chart generated and inserted" : "Typst chart generated");
}

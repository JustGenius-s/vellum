import { runWorkspaceAgent } from "@/application/ai/agent-runtime";
import type { AiTaskExecutionContext } from "@/application/ai/ai-task-manager";
import type { WorkspaceTaskHost } from "@/application/ai/workspace-task-host";
import {
  previousTaskMessages,
  taskContextPaths,
  WorkspaceToolRuntime,
} from "@/application/ai/workspace-tool-runtime";
import type { AiTask } from "@/domain/ai-task";

export async function runEditingTask(
  host: WorkspaceTaskHost,
  task: AiTask,
  { taskId, input, assistantMessageId, signal }: AiTaskExecutionContext,
) {
  if (task.source.kind !== "workspace") throw new Error("Expected a workspace task");
  const runtime = new WorkspaceToolRuntime(host, task, taskId, signal);
  const state = host.getState();
  const result = await runWorkspaceAgent({
    config: {
      baseUrl: state.aiBaseUrl,
      model: state.aiModel,
      apiKey: state.aiApiKey,
    },
    context: {
      taskKind: "workspace",
      activeFilePath: runtime.relative(task.source.path),
      contextPaths: taskContextPaths(task, input.contextPaths).map((path) => runtime.relative(path)),
      request: input.text,
      priorMessages: previousTaskMessages(task, input.userMessageId, assistantMessageId),
      diagnostics: task.source.diagnostics,
    },
    handlers: runtime.commonHandlers(),
    abortSignal: signal,
    fetch: (request, init) => host.gateway.aiFetch(request, init),
    onContentUpdate: (content) => host.updateAssistant(taskId, assistantMessageId, content),
  });
  signal.throwIfAborted();
  host.updateAssistant(taskId, assistantMessageId, result.content);
  host.patchTask(taskId, { stage: "complete", progress: 100, error: "" });
  host.setStatus("AI workspace task completed");
}

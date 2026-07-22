import type { AiTaskExecutionContext } from "@/application/ai/ai-task-manager";
import { runEditingTask } from "@/application/ai/editing-task-runner";
import { runFigureTask } from "@/application/ai/figure-task-runner";
import type { WorkspaceTaskHost } from "@/application/ai/workspace-task-host";

export class WorkspaceTaskRunner {
  private readonly host: WorkspaceTaskHost;

  constructor(host: WorkspaceTaskHost) {
    this.host = host;
  }

  async run(context: AiTaskExecutionContext) {
    const task = this.host.getTask(context.taskId);
    if (!task) throw new Error("AI task not found");
    const state = this.host.getState();
    if (!state.vaultPath || task.source.vaultPath !== state.vaultPath) {
      throw new Error("Open the task's original workspace before resuming it");
    }
    if (!state.aiBaseUrl.trim() || !state.aiModel.trim()) {
      throw new Error("Configure an OpenAI-compatible model in Settings before running this task");
    }
    if (task.source.kind === "workspace") {
      await runEditingTask(this.host, task, context);
    } else {
      await runFigureTask(this.host, task, context);
    }
  }
}

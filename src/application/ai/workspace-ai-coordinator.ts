import { AiTaskManager, type AiTaskExecutionContext } from "@/application/ai/ai-task-manager";
import type { WorkspaceTaskHost } from "@/application/ai/workspace-task-host";
import { WorkspaceTaskRunner } from "@/application/ai/workspace-task-runner";
import type { WorkspaceGateway } from "@/application/ports/workspace-gateway";
import type { AiTaskSource } from "@/domain/ai-task";

type WorkspaceAiHost = Omit<
  WorkspaceTaskHost,
  "getTask" | "patchTask" | "updateTask" | "updateAssistant"
>;

export class WorkspaceAiCoordinator {
  private readonly manager: AiTaskManager;

  constructor(gateway: WorkspaceGateway, host: WorkspaceAiHost) {
    let manager!: AiTaskManager;
    const runner = new WorkspaceTaskRunner({
      ...host,
      getTask: (taskId) => manager.getTask(taskId),
      patchTask: (taskId, patch) =>
        manager.updateTask(taskId, (task) => ({ ...task, ...patch })),
      updateTask: (taskId, update) => manager.updateTask(taskId, update),
      updateAssistant: (taskId, messageId, content) =>
        manager.updateAssistant(taskId, messageId, content),
    });
    manager = new AiTaskManager(gateway, (context: AiTaskExecutionContext) =>
      runner.run(context),
    );
    this.manager = manager;
  }

  subscribe(listener: () => void) {
    return this.manager.subscribe(listener);
  }

  initialize() {
    return this.manager.initialize();
  }

  getSnapshot() {
    return this.manager.getSnapshot();
  }

  get selectedTask() {
    return this.manager.selectedTask;
  }

  getTask(taskId: string | null | undefined) {
    return this.manager.getTask(taskId);
  }

  create(source: AiTaskSource) {
    return this.manager.create(source);
  }

  select(taskId: string | null) {
    this.manager.select(taskId);
  }

  submit(taskId: string, request: string, contextPaths: string[]) {
    this.manager.submit(taskId, request, contextPaths);
  }

  cancel(taskId: string) {
    this.manager.cancel(taskId);
  }

  retry(taskId: string) {
    this.manager.retry(taskId);
  }

  archive(taskId: string, archived: boolean) {
    this.manager.archive(taskId, archived);
  }
}

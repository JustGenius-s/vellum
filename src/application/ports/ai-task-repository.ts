import type { AiTaskStore } from "@/domain/ai-task";

export interface AiTaskRepository {
  loadAiTasks(): Promise<AiTaskStore>;
  saveAiTasks(store: AiTaskStore): Promise<void>;
}

import type { AiTaskExecutionContext } from "@/application/ai/ai-task-manager";
import type { WorkspaceMutationCoordinator } from "@/application/ai/workspace-mutation-coordinator";
import type { WorkspaceGateway } from "@/application/ports/workspace-gateway";
import type { DataQuery, DatasetDescriptor, PreparedDataFigure } from "@/domain/data";
import type { AiMessageContentPart, AiTask } from "@/domain/ai-task";
import type { FigurePlacement } from "@/domain/figure";
import type { CompileDiagnostic, TreeNode } from "@/domain/workspace";

export interface WorkspaceAgentState {
  vaultPath: string;
  tree: TreeNode[];
  aiBaseUrl: string;
  aiModel: string;
  aiApiKey: string;
  latinFont: string;
  cjkFont: string;
  packageCachePath: string | null;
  packageDataPath: string | null;
  diagnostics: CompileDiagnostic[];
}

export interface WorkspaceTaskHost {
  gateway: WorkspaceGateway;
  mutations: WorkspaceMutationCoordinator;
  getState(): WorkspaceAgentState;
  getTask(taskId: string): AiTask | null;
  patchTask(taskId: string, patch: Partial<AiTask>): void;
  updateTask(taskId: string, update: (task: AiTask) => AiTask): void;
  updateAssistant(taskId: string, messageId: string, content: AiMessageContentPart[]): void;
  queryForDataset(dataset: DatasetDescriptor): DataQuery;
  refreshTree(): Promise<void>;
  insertFigure(
    figure: PreparedDataFigure,
    targetPath: string,
    placement: FigurePlacement,
  ): Promise<void>;
  setStatus(status: string): void;
}

export type TaskRunner = (context: AiTaskExecutionContext) => Promise<void>;

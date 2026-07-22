import type { AiMessageContentPart, AiToolActivity } from "@/domain/ai-task";

export interface AiProviderConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

export type WorkspaceAgentKind = "data-figure" | "workspace";

export interface WorkspaceAgentContext {
  taskKind: WorkspaceAgentKind;
  activeDataPath?: string;
  activeFilePath?: string;
  contextPaths: string[];
  request: string;
  priorMessages?: Array<{ role: "user" | "assistant"; text: string }>;
  diagnostics?: unknown[];
}

export interface WorkspaceAgentToolHandlers {
  listWorkspaceFiles(input: { query?: string }): Promise<unknown>;
  readWorkspaceFile(input: { path: string }): Promise<unknown>;
  readDataProjection(input: {
    path?: string;
    datasetId?: string;
    offset?: number;
    limit?: number;
    varyingDimensions?: number[];
    fixedDimensions?: Array<{ dimension: number; index: number }>;
    exactStatistics?: boolean;
  }): Promise<unknown>;
  writeWorkspaceFile(input: {
    path: string;
    content: string;
    expectedRevision?: string;
  }): Promise<unknown>;
  compileTypst(input: { path: string }): Promise<unknown>;
  writeDataFigure?(input: { title?: string; typstSource: string }): Promise<unknown>;
  insertFigure?(input: {
    targetPath: string;
    placement?: "cursor" | "end";
  }): Promise<unknown>;
}

export interface RunWorkspaceAgentOptions {
  config: AiProviderConfig;
  context: WorkspaceAgentContext;
  handlers: WorkspaceAgentToolHandlers;
  abortSignal?: AbortSignal;
  fetch?: typeof globalThis.fetch;
  onAssistantUpdate?: (text: string) => void;
  onReasoningUpdate?: (reasoning: string) => void;
  onToolUpdate?: (tools: AiToolActivity[]) => void;
  onContentUpdate?: (content: AiMessageContentPart[]) => void;
}

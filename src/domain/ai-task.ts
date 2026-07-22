import type { DataQuery, PreparedDataFigure } from "@/domain/data";
import type { CompileDiagnostic } from "@/domain/workspace";

export type AiTaskStatus =
  | "draft"
  | "queued"
  | "running"
  | "waiting-input"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export type AiTaskStage =
  | "idle"
  | "analyzing"
  | "generating"
  | "writing"
  | "compiling"
  | "repairing"
  | "inserting"
  | "complete"
  | "cancelled"
  | "failed";

export type AiToolActivityState =
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "output-error";

export interface AiToolActivity {
  id: string;
  name: string;
  title: string;
  state: AiToolActivityState;
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

export type AiMessageContentPart =
  | { id: string; type: "reasoning"; text: string }
  | { id: string; type: "text"; text: string }
  | { id: string; type: "tool"; activity: AiToolActivity }
  | { id: string; type: "artifact"; artifactId: string }
  | { id: string; type: "file-change"; changeId: string };

export interface AiTaskMessage {
  id: string;
  role: "user" | "assistant" | "system";
  parts: AiMessageContentPart[];
  attachments: string[];
  createdAt: number;
  status: "complete" | "streaming" | "failed" | "cancelled";
}

export interface AiTaskInput {
  id: string;
  text: string;
  contextPaths: string[];
  userMessageId: string;
  createdAt: number;
}

export interface AiTaskArtifact {
  id: string;
  kind: "typst-figure" | "file";
  label: string;
  path: string;
  createdAt: number;
  relatedPaths: string[];
}

export interface AiTaskFileChange {
  id: string;
  path: string;
  operation: "created" | "updated" | "inserted";
  saved: boolean;
  createdAt: number;
}

export type AiTaskSource =
  | {
      kind: "data-figure";
      vaultPath: string;
      path: string;
      query: DataQuery;
    }
  | {
      kind: "workspace";
      vaultPath: string;
      path: string;
      diagnostics: CompileDiagnostic[];
    };

export interface AiTask {
  id: string;
  title: string;
  status: AiTaskStatus;
  stage: AiTaskStage;
  progress: number;
  source: AiTaskSource;
  contextPaths: string[];
  messages: AiTaskMessage[];
  pendingInputs: AiTaskInput[];
  activeInput: AiTaskInput | null;
  artifacts: AiTaskArtifact[];
  fileChanges: AiTaskFileChange[];
  generatedSource: string;
  repairs: number;
  result: PreparedDataFigure | null;
  error: string;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  completedAt: number | null;
  archivedAt: number | null;
}

export interface AiTaskStore {
  version: 1;
  tasks: AiTask[];
}

export const emptyAiTaskStore = (): AiTaskStore => ({ version: 1, tasks: [] });

export function aiTaskText(message: AiTaskMessage) {
  return message.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n")
    .trim();
}

export function aiTaskStatusActive(status: AiTaskStatus) {
  return status === "queued" || status === "running";
}

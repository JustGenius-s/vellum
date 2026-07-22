import { jsonSchema, tool, type ToolSet } from "ai";

import type { WorkspaceAgentToolHandlers } from "@/application/ai/agent-types";

export const TOOL_TITLES: Record<string, string> = {
  list_workspace_files: "List workspace files",
  read_workspace_file: "Read project file",
  read_data_projection: "Read data projection",
  write_workspace_file: "Write project file",
  write_data_figure: "Write figure bundle",
  compile_typst: "Compile Typst",
  insert_figure: "Insert figure",
};

export function createWorkspaceAgentTools(handlers: WorkspaceAgentToolHandlers): ToolSet {
  const tools: ToolSet = {
    list_workspace_files: tool({
      description: "List files in the open Vellum vault, optionally filtering by a path or name fragment.",
      inputSchema: jsonSchema<{ query?: string }>({
        type: "object",
        properties: { query: { type: "string" } },
        additionalProperties: false,
      }),
      execute: handlers.listWorkspaceFiles,
    }),
    read_workspace_file: tool({
      description: "Read a UTF-8 text project file and return its current revision. Use read_data_projection for data files.",
      inputSchema: jsonSchema<{ path: string }>({
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
        additionalProperties: false,
      }),
      execute: handlers.readWorkspaceFile,
    }),
    read_data_projection: tool({
      description: "Read a structured projection, statistics, dimensions, and current slice from a supported data file.",
      inputSchema: jsonSchema<{
        path?: string;
        datasetId?: string;
        offset?: number;
        limit?: number;
        varyingDimensions?: number[];
        fixedDimensions?: Array<{ dimension: number; index: number }>;
        exactStatistics?: boolean;
      }>({
        type: "object",
        properties: {
          path: { type: "string" },
          datasetId: { type: "string" },
          offset: { type: "number", minimum: 0 },
          limit: { type: "number", minimum: 1, maximum: 400 },
          varyingDimensions: { type: "array", items: { type: "number", minimum: 0 } },
          fixedDimensions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                dimension: { type: "number", minimum: 0 },
                index: { type: "number", minimum: 0 },
              },
              required: ["dimension", "index"],
              additionalProperties: false,
            },
          },
          exactStatistics: { type: "boolean" },
        },
        additionalProperties: false,
      }),
      execute: handlers.readDataProjection,
    }),
    write_workspace_file: tool({
      description: "Create or replace a UTF-8 text file inside the vault. Preserve unrelated content when editing an existing document.",
      inputSchema: jsonSchema<{ path: string; content: string; expectedRevision?: string }>({
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
          expectedRevision: { type: "string" },
        },
        required: ["path", "content"],
        additionalProperties: false,
      }),
      execute: handlers.writeWorkspaceFile,
    }),
    compile_typst: tool({
      description: "Compile a Typst or Markdown document in the vault and return structured diagnostics.",
      inputSchema: jsonSchema<{ path: string }>({
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
        additionalProperties: false,
      }),
      execute: handlers.compileTypst,
    }),
  };

  if (handlers.writeDataFigure) {
    tools.write_data_figure = tool({
      description: "Create a portable figure bundle for the active data projection from complete Typst source.",
      inputSchema: jsonSchema<{ title?: string; typstSource: string }>({
        type: "object",
        properties: {
          title: { type: "string" },
          typstSource: { type: "string" },
        },
        required: ["typstSource"],
        additionalProperties: false,
      }),
      execute: handlers.writeDataFigure,
    });
  }

  if (handlers.insertFigure) {
    tools.insert_figure = tool({
      description: "Insert the generated figure reference into an existing Typst or Markdown document.",
      inputSchema: jsonSchema<{ targetPath: string; placement?: "cursor" | "end" }>({
        type: "object",
        properties: {
          targetPath: { type: "string" },
          placement: { type: "string", enum: ["cursor", "end"] },
        },
        required: ["targetPath"],
        additionalProperties: false,
      }),
      execute: handlers.insertFigure,
    });
  }

  return tools;
}

export function summarizeToolInput(name: string, input: unknown) {
  if (name !== "write_data_figure" && name !== "write_workspace_file") return input;
  if (!input || typeof input !== "object") return input;
  const value = input as Record<string, unknown>;
  const contentKey = name === "write_data_figure" ? "typstSource" : "content";
  const content = typeof value[contentKey] === "string" ? value[contentKey] : "";
  return { ...value, [contentKey]: content ? `${content.length.toLocaleString()} characters` : "" };
}

export function summarizeToolOutput(name: string, output: unknown) {
  if (!output || typeof output !== "object") return output;
  const value = output as Record<string, unknown>;
  if (name === "list_workspace_files") {
    const files = Array.isArray(value.files) ? value.files : [];
    return { count: files.length, files: files.slice(0, 12), truncated: value.truncated };
  }
  if (name === "read_workspace_file") {
    return {
      path: value.path,
      characters: typeof value.content === "string" ? value.content.length : value.characters,
      revision: value.revision,
    };
  }
  if (name === "read_data_projection") {
    const preview = value.preview as Record<string, unknown> | undefined;
    const tensor = preview?.tensor as Record<string, unknown> | undefined;
    return {
      path: value.path,
      dataset: preview?.datasetId,
      kind: preview?.kind,
      rows: Array.isArray(preview?.rows) ? preview.rows.length : undefined,
      totalRows: preview?.totalRows,
      shape: tensor?.shape,
    };
  }
  return output;
}

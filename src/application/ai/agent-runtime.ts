import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { isStepCount, streamText } from "ai";

import { applyAiMessageContentUpdate } from "@/application/ai/agent-content";
import { workspaceAgentInstructions } from "@/application/ai/agent-prompts";
import {
  createWorkspaceAgentTools,
  summarizeToolInput,
  summarizeToolOutput,
  TOOL_TITLES,
} from "@/application/ai/agent-tool-registry";
import type {
  AiProviderConfig,
  RunWorkspaceAgentOptions,
} from "@/application/ai/agent-types";
import type { AiMessageContentPart, AiToolActivity } from "@/domain/ai-task";

function modelFor(config: AiProviderConfig, fetch?: typeof globalThis.fetch) {
  let parsed: URL;
  try {
    parsed = new URL(config.baseUrl);
  } catch {
    throw new Error("Enter a valid OpenAI-compatible base URL");
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error("The AI base URL must use HTTP or HTTPS");
  }
  if (!config.model.trim()) throw new Error("Enter an AI model name in Settings");

  return createOpenAICompatible({
    name: "vellum",
    baseURL: parsed.toString().replace(/\/$/, ""),
    apiKey: config.apiKey.trim() || undefined,
    fetch,
  }).chatModel(config.model.trim());
}

export async function runWorkspaceAgent({
  config,
  context,
  handlers,
  abortSignal,
  fetch,
  onAssistantUpdate,
  onReasoningUpdate,
  onToolUpdate,
  onContentUpdate,
}: RunWorkspaceAgentOptions) {
  const result = streamText({
    model: modelFor(config, fetch),
    instructions: workspaceAgentInstructions(context.taskKind),
    prompt: JSON.stringify(
      {
        activeDataFile: context.activeDataPath,
        activeFile: context.activeFilePath,
        attachedContextFiles: context.contextPaths,
        compilerDiagnostics: context.diagnostics ?? [],
        userRequest:
          context.request.trim() ||
          (context.taskKind === "data-figure"
            ? "Choose and create the clearest publication-ready figure for this data."
            : "Inspect the active file and help with it."),
        priorConversation: context.priorMessages ?? [],
      },
      null,
      2,
    ),
    tools: createWorkspaceAgentTools(handlers),
    stopWhen: isStepCount(12),
    abortSignal,
    maxRetries: 1,
  });

  let assistant = "";
  let reasoning = "";
  let content: AiMessageContentPart[] = [];
  const activities = new Map<string, AiToolActivity>();
  const publishTools = () => onToolUpdate?.([...activities.values()]);
  const publishContent = (update: Parameters<typeof applyAiMessageContentUpdate>[1]) => {
    content = applyAiMessageContentUpdate(content, update);
    onContentUpdate?.(content);
  };

  for await (const part of result.stream) {
    if (part.type === "text-delta") {
      assistant += part.text;
      onAssistantUpdate?.(assistant);
      publishContent({ type: "text", text: part.text });
    } else if (part.type === "reasoning-delta") {
      reasoning += part.text;
      onReasoningUpdate?.(reasoning);
      publishContent({ type: "reasoning", text: part.text });
    } else if (part.type === "tool-input-start") {
      const activity: AiToolActivity = {
        id: part.id,
        name: part.toolName,
        title: TOOL_TITLES[part.toolName] ?? part.toolName,
        state: "input-streaming",
      };
      activities.set(part.id, activity);
      publishTools();
      publishContent({ type: "tool", activity });
    } else if (part.type === "tool-call") {
      const activity: AiToolActivity = {
        id: part.toolCallId,
        name: part.toolName,
        title: TOOL_TITLES[part.toolName] ?? part.toolName,
        state: "input-available",
        input: summarizeToolInput(part.toolName, part.input),
      };
      activities.set(part.toolCallId, activity);
      publishTools();
      publishContent({ type: "tool", activity });
    } else if (part.type === "tool-result") {
      const previous = activities.get(part.toolCallId);
      const activity: AiToolActivity = {
        id: part.toolCallId,
        name: part.toolName,
        title: previous?.title ?? TOOL_TITLES[part.toolName] ?? part.toolName,
        state: "output-available",
        input: previous?.input ?? summarizeToolInput(part.toolName, part.input),
        output: summarizeToolOutput(part.toolName, part.output),
      };
      activities.set(part.toolCallId, activity);
      publishTools();
      publishContent({ type: "tool", activity });
    } else if (part.type === "tool-error") {
      const previous = activities.get(part.toolCallId);
      const activity: AiToolActivity = {
        id: part.toolCallId,
        name: part.toolName,
        title: previous?.title ?? TOOL_TITLES[part.toolName] ?? part.toolName,
        state: "output-error",
        input: previous?.input ?? summarizeToolInput(part.toolName, part.input),
        errorText: String(part.error),
      };
      activities.set(part.toolCallId, activity);
      publishTools();
      publishContent({ type: "tool", activity });
    } else if (part.type === "error") {
      throw part.error;
    } else if (part.type === "abort") {
      abortSignal?.throwIfAborted();
      throw new Error(part.reason || "The AI stream was aborted");
    }
  }

  return { assistant, reasoning, tools: [...activities.values()], content };
}

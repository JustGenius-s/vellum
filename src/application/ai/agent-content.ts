import type {
  AiMessageContentPart,
  AiToolActivity,
} from "@/domain/ai-task";

export type AiMessageContentUpdate =
  | { type: "reasoning"; text: string }
  | { type: "text"; text: string }
  | { type: "tool"; activity: AiToolActivity };

export function applyAiMessageContentUpdate(
  content: AiMessageContentPart[],
  update: AiMessageContentUpdate,
): AiMessageContentPart[] {
  if (update.type === "tool") {
    const existingIndex = content.findIndex(
      (part) => part.type === "tool" && part.activity.id === update.activity.id,
    );
    if (existingIndex === -1) {
      return [
        ...content,
        { id: `tool-${update.activity.id}`, type: "tool", activity: update.activity },
      ];
    }
    return content.map((part, index) =>
      index === existingIndex && part.type === "tool"
        ? { ...part, activity: update.activity }
        : part,
    );
  }

  const previous = content.at(-1);
  if (previous?.type === update.type) {
    return [...content.slice(0, -1), { ...previous, text: previous.text + update.text }];
  }
  return [
    ...content,
    { id: `${update.type}-${content.length}`, type: update.type, text: update.text },
  ];
}

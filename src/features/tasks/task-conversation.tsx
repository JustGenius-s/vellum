import { useEffect, useMemo, useState } from "react";
import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  CheckIcon,
  CodeIcon,
  PaperclipIcon,
  StopIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import type { SourceDocumentUIPart } from "ai";

import { useWorkspace } from "@/app/workspace-context";
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
  type AttachmentData,
} from "@/components/ai-elements/attachments";
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from "@/components/ai-elements/code-block";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { FileTypeIcon } from "@/components/ui/file-type-icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { AiMessageContentPart, AiTask } from "@/domain/ai-task";
import { fileName, flattenFiles, relativePath } from "@/domain/workspace";

function attachment(path: string, vaultPath: string): AttachmentData {
  const source: SourceDocumentUIPart = {
    type: "source-document",
    sourceId: path,
    mediaType: "application/vnd.vellum.workspace-file",
    title: fileName(path),
    filename: relativePath(path, vaultPath),
  };
  return { ...source, id: path };
}

function TaskPart({ part, task, streaming }: { part: AiMessageContentPart; task: AiTask; streaming: boolean }) {
  const { controller } = useWorkspace();
  if (part.type === "reasoning") {
    return (
      <Reasoning isStreaming={streaming} className="mb-0">
        <ReasoningTrigger
          className="text-xs"
          getThinkingMessage={(active, duration) => (
            <span>
              {active
                ? "Reasoning through the workspace..."
                : duration == null
                  ? "Model reasoning"
                  : `Reasoned for ${duration} seconds`}
            </span>
          )}
        />
        <ReasoningContent className="mt-3 border-l-2 pl-3 text-xs leading-5">
          {part.text}
        </ReasoningContent>
      </Reasoning>
    );
  }
  if (part.type === "tool") {
    return (
      <Tool defaultOpen={part.activity.state === "output-error"} className="mb-0 overflow-hidden rounded-md">
        <ToolHeader
          type="dynamic-tool"
          toolName={part.activity.name}
          state={part.activity.state}
          title={part.activity.title}
          className="min-h-10 px-3 py-2"
        />
        <ToolContent className="border-t px-3 py-3">
          {part.activity.input !== undefined ? <ToolInput input={part.activity.input} /> : null}
          <ToolOutput output={part.activity.output} errorText={part.activity.errorText} />
        </ToolContent>
      </Tool>
    );
  }
  if (part.type === "artifact") {
    const artifact = task.artifacts.find((candidate) => candidate.id === part.artifactId);
    if (!artifact) return null;
    return (
      <button
        type="button"
        className="flex w-full items-start gap-3 rounded-md border px-3 py-3 text-left transition-colors hover:bg-muted/40"
        onClick={() => void controller.openFile(artifact.path)}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <CheckCircleIcon className="size-4" weight="fill" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{artifact.label}</span>
          <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground">
            {relativePath(artifact.path, task.source.vaultPath)}
          </span>
        </span>
        <CodeIcon className="mt-1 size-4 shrink-0 text-muted-foreground" />
      </button>
    );
  }
  if (part.type === "file-change") return null;
  return <MessageResponse className="text-sm leading-6">{part.text}</MessageResponse>;
}

function AssistantMessage({ task, messageIndex }: { task: AiTask; messageIndex: number }) {
  const message = task.messages[messageIndex];
  if (!message || message.role !== "assistant") return null;
  return (
    <Message from="assistant" className="max-w-full">
      <MessageContent className="w-full gap-4">
        {message.status === "streaming" && message.parts.length === 0 ? (
          <Reasoning isStreaming className="mb-0">
            <ReasoningTrigger className="text-xs" getThinkingMessage={() => <span>Waiting for the model...</span>} />
            <ReasoningContent className="mt-3 border-l-2 pl-3 text-xs leading-5">
              Reasoning appears here when the selected provider streams it.
            </ReasoningContent>
          </Reasoning>
        ) : null}
        {message.parts.map((part, index) => (
          <TaskPart
            key={part.id}
            part={part}
            task={task}
            streaming={message.status === "streaming" && index === message.parts.length - 1}
          />
        ))}
        {message.status === "cancelled" ? (
          <p className="border-l-2 pl-3 text-xs leading-5 text-muted-foreground">This run was stopped. Completed file actions were kept.</p>
        ) : null}
      </MessageContent>
    </Message>
  );
}

export function TaskConversation({ task, compact = false }: { task: AiTask; compact?: boolean }) {
  const { controller, state } = useWorkspace();
  const [request, setRequest] = useState("");
  const [contextPaths, setContextPaths] = useState<string[]>([]);
  const [contextOpen, setContextOpen] = useState(false);
  const files = useMemo(
    () =>
      flattenFiles(state.tree).sort((left, right) =>
        relativePath(left.path, state.vaultPath).localeCompare(relativePath(right.path, state.vaultPath)),
      ),
    [state.tree, state.vaultPath],
  );
  const configured = Boolean(state.aiBaseUrl.trim() && state.aiModel.trim());
  const running = task.status === "running" || task.status === "queued";

  useEffect(() => {
    setRequest("");
    setContextPaths([]);
    setContextOpen(false);
  }, [task.id]);

  function toggleContext(path: string) {
    if (path === task.source.path) return;
    setContextPaths((current) =>
      current.includes(path) ? current.filter((candidate) => candidate !== path) : [...current, path],
    );
  }

  function submit(message: PromptInputMessage) {
    if (!configured) return;
    controller.submitAiTask(task.id, message.text || request, contextPaths);
    setRequest("");
    setContextPaths([]);
    setContextOpen(false);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <Conversation className="min-h-0">
        <ConversationContent className={compact ? "min-h-full gap-6 px-4 py-5" : "mx-auto min-h-full w-full max-w-3xl gap-7 px-5 py-8"}>
          {!task.messages.length && configured ? (
            <ConversationEmptyState className="mx-auto max-w-md gap-4 px-4 py-12">
              <div className="flex size-10 items-center justify-center rounded-md border bg-muted/30 text-muted-foreground">
                <CodeIcon className="size-5" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-sm font-medium">Ask for the result you need</h3>
                <p className="text-xs leading-5 text-muted-foreground">
                  {task.source.kind === "data-figure"
                    ? "The agent can inspect attached files, analyze the active dataset, write and compile Typst, then insert the figure into a document."
                    : "The agent can inspect attached files, edit the active document, and compile it to diagnose and repair errors."}
                </p>
              </div>
            </ConversationEmptyState>
          ) : null}

          {!configured ? (
            <ConversationEmptyState className="mx-auto max-w-sm gap-4 px-4 py-12">
              <WarningCircleIcon className="size-8 text-muted-foreground" />
              <div className="space-y-1.5">
                <h3 className="text-sm font-medium">Connect a model first</h3>
                <p className="text-xs leading-5 text-muted-foreground">Add an OpenAI-compatible endpoint and model in Settings.</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => controller.setSidebarView("settings")}>Open settings</Button>
            </ConversationEmptyState>
          ) : null}

          {task.messages.map((message, index) =>
            message.role === "user" ? (
              <Message key={message.id} from="user" className="max-w-[88%]">
                <MessageContent className="px-3.5 py-2.5">
                  {message.parts.map((part) =>
                    part.type === "text" ? <p key={part.id} className="whitespace-pre-wrap leading-6">{part.text}</p> : null,
                  )}
                </MessageContent>
                {message.attachments.length ? (
                  <Attachments variant="inline" className="ml-auto justify-end">
                    {message.attachments.map((path) => (
                      <Attachment key={path} data={attachment(path, task.source.vaultPath)} className="max-w-48 bg-background text-[10px] font-normal">
                        <AttachmentPreview fallbackIcon={<FileTypeIcon name={path} className="size-3" />} />
                        <AttachmentInfo />
                      </Attachment>
                    ))}
                  </Attachments>
                ) : null}
              </Message>
            ) : (
              <AssistantMessage key={message.id} task={task} messageIndex={index} />
            ),
          )}

          {task.generatedSource && task.messages.some((message) => message.role === "assistant") ? (
            <CodeBlock code={task.generatedSource} language="typst" className="rounded-md shadow-none">
              <CodeBlockHeader className="bg-muted/30">
                <CodeBlockTitle>
                  <CodeIcon className="size-3.5" />
                  <CodeBlockFilename>{task.repairs ? `chart.typ · ${task.repairs} edits` : "chart.typ"}</CodeBlockFilename>
                </CodeBlockTitle>
                <CodeBlockActions><CodeBlockCopyButton size="icon-sm" /></CodeBlockActions>
              </CodeBlockHeader>
            </CodeBlock>
          ) : null}

          {task.error ? (
            <Alert variant="destructive">
              <WarningCircleIcon />
              <AlertTitle>Task needs attention</AlertTitle>
              <AlertDescription className="whitespace-pre-wrap">{task.error}</AlertDescription>
              {(task.status === "failed" || task.status === "interrupted" || task.status === "cancelled") ? (
                <Button className="mt-3" size="sm" variant="outline" onClick={() => controller.retryAiTask(task.id)}>
                  <ArrowClockwiseIcon /> Retry
                </Button>
              ) : null}
            </Alert>
          ) : null}
        </ConversationContent>
        <ConversationScrollButton className="bottom-3 size-8" />
      </Conversation>

      <div className={compact ? "shrink-0 border-t bg-background p-3" : "shrink-0 border-t bg-background px-4 py-3"}>
        <PromptInput onSubmit={submit} className={compact ? "mx-auto max-w-3xl rounded-lg" : "mx-auto max-w-3xl rounded-lg"}>
          <PromptInputHeader className="px-2.5 pt-2.5">
            <Attachments variant="inline" className="min-w-0 flex-1">
              <Attachment data={attachment(task.source.path, task.source.vaultPath)} className="max-w-52 bg-muted/35 text-[10px] font-normal">
                <AttachmentPreview fallbackIcon={<FileTypeIcon name={task.source.path} className="size-3" />} />
                <AttachmentInfo />
                <span className="text-[9px] text-muted-foreground">
                  {task.source.kind === "data-figure" ? "data" : "active"}
                </span>
              </Attachment>
              {contextPaths.map((path) => (
                <Attachment key={path} data={attachment(path, task.source.vaultPath)} onRemove={() => toggleContext(path)} className="max-w-52 text-[10px] font-normal">
                  <AttachmentPreview fallbackIcon={<FileTypeIcon name={path} className="size-3" />} />
                  <AttachmentInfo />
                  <AttachmentRemove label={`Remove ${fileName(path)}`} />
                </Attachment>
              ))}
            </Attachments>
          </PromptInputHeader>
          <PromptInputBody>
            <PromptInputTextarea
              value={request}
              onChange={(event) => setRequest(event.currentTarget.value)}
              placeholder={
                running
                  ? "Add another message to this task's queue..."
                  : task.source.kind === "data-figure"
                    ? "Ask the agent to create, revise, compile, or insert a figure..."
                    : "Ask the agent to edit, explain, or repair this file..."
              }
              className="max-h-36 min-h-20 px-3 pt-2 text-sm"
              disabled={!configured}
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <Popover open={contextOpen} onOpenChange={setContextOpen}>
                <PopoverTrigger asChild>
                  <PromptInputButton type="button" aria-label="Add project files as context">
                    <PaperclipIcon className="size-4" />
                    <span>{contextPaths.length ? `${contextPaths.length} files` : "Add context"}</span>
                  </PromptInputButton>
                </PopoverTrigger>
                <PopoverContent align="start" side="top" sideOffset={8} className="w-[min(23rem,calc(100vw-2rem))] p-0">
                  <Command>
                    <CommandInput placeholder="Search project files..." />
                    <CommandList>
                      <CommandEmpty>No project files found.</CommandEmpty>
                      <CommandGroup heading="Project files">
                        {files.map((file) => {
                          const selected = contextPaths.includes(file.path);
                          const active = file.path === task.source.path;
                          return (
                            <CommandItem key={file.path} value={relativePath(file.path, state.vaultPath)} disabled={active} onSelect={() => toggleContext(file.path)} className="gap-2">
                              <FileTypeIcon name={file.path} className="size-4 shrink-0" />
                              <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{relativePath(file.path, state.vaultPath)}</span>
                              {active ? <span className="text-[9px] text-muted-foreground">active</span> : selected ? <CheckIcon className="size-3.5" /> : null}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {running ? (
                <PromptInputButton type="button" onClick={() => controller.cancelAiTask(task.id)} aria-label="Stop current run">
                  <StopIcon className="size-4" /> Stop
                </PromptInputButton>
              ) : null}
              <span className="hidden max-w-36 truncate font-mono text-[10px] text-muted-foreground sm:inline">{state.aiModel || "No model"}</span>
            </PromptInputTools>
            <PromptInputSubmit status="ready" disabled={!configured || !request.trim()} size="icon-sm" />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}

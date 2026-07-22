import { useEffect, useMemo, useState, type ReactElement } from "react";
import {
  BrainIcon,
  ChartLineIcon,
  CheckCircleIcon,
  CheckIcon,
  CodeIcon,
  PaperclipIcon,
  XIcon,
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
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
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
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { fileName, flattenFiles, relativePath } from "@/domain/workspace";

const stageLabel = {
  idle: "Ready",
  analyzing: "Reading context",
  generating: "Planning figure",
  writing: "Writing files",
  compiling: "Compiling Typst",
  repairing: "Repairing source",
  inserting: "Updating document",
  complete: "Figure ready",
  cancelled: "Stopped",
  failed: "Needs attention",
} as const;

const suggestions = [
  "Choose the clearest publication-ready figure",
  "Compare the main groups and explain the visual choice",
  "Show the distribution, uncertainty, and outliers",
];

function contextAttachment(path: string, vaultPath: string): AttachmentData {
  const source: SourceDocumentUIPart = {
    type: "source-document",
    sourceId: path,
    mediaType: "application/vnd.vellum.workspace-file",
    title: fileName(path),
    filename: relativePath(path, vaultPath),
  };
  return { ...source, id: path };
}

export function ChartConversationPopover({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  children: ReactElement;
}) {
  const { controller, state } = useWorkspace();
  const [request, setRequest] = useState("");
  const [submittedRequest, setSubmittedRequest] = useState("");
  const [contextPaths, setContextPaths] = useState<string[]>([]);
  const [submittedContextPaths, setSubmittedContextPaths] = useState<string[]>([]);
  const [contextOpen, setContextOpen] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const sourcePath = state.dataChartSourcePath;
  const files = useMemo(
    () =>
      flattenFiles(state.tree).sort((left, right) =>
        relativePath(left.path, state.vaultPath).localeCompare(
          relativePath(right.path, state.vaultPath),
        ),
      ),
    [state.tree, state.vaultPath],
  );
  const configured = Boolean(state.aiBaseUrl.trim() && state.aiModel.trim());
  const chatStatus = state.dataChartPending
    ? state.dataChartResponse || state.dataChartTools.length
      ? "streaming"
      : "submitted"
    : state.dataChartStage === "failed"
      ? "error"
      : "ready";
  const reasoningStreaming = state.dataChartPending;
  const figurePath = state.dataChartResult?.typstPath;
  const inserted = state.dataChartTools.some(
    (tool) => tool.name === "insert_figure" && tool.state === "output-available",
  );

  useEffect(() => {
    setRequest("");
    setSubmittedRequest("");
    setContextPaths([]);
    setSubmittedContextPaths([]);
    setContextOpen(false);
    setHasRun(false);
  }, [state.dataChartTaskId]);

  function toggleContext(path: string) {
    if (path === sourcePath || state.dataChartPending) return;
    setContextPaths((current) =>
      current.includes(path) ? current.filter((candidate) => candidate !== path) : [...current, path],
    );
  }

  async function generate(message: PromptInputMessage) {
    if (state.dataChartPending || !configured) return;
    const prompt =
      message.text.trim() ||
      "Choose and create the clearest publication-ready figure for this data.";
    setSubmittedRequest(prompt);
    setSubmittedContextPaths(contextPaths);
    setHasRun(true);
    setContextOpen(false);
    await controller.generateDataChart({ request: prompt, contextPaths });
  }

  const activeAttachment = contextAttachment(sourcePath, state.vaultPath);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        sideOffset={8}
        className="flex h-[min(48rem,calc(100dvh-4rem))] w-[calc(100vw-1rem)] max-w-none flex-col gap-0 overflow-hidden rounded-xl border-border/80 p-0 shadow-lg ring-1 ring-foreground/5 sm:w-[44rem]"
      >
        <PopoverHeader className="relative flex-row items-center gap-2.5 border-b px-3 py-2.5">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-muted/30 text-muted-foreground">
            <ChartLineIcon className="size-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <PopoverTitle className="truncate text-sm">Workspace figure agent</PopoverTitle>
            <PopoverDescription className="truncate text-[11px]">
              {fileName(sourcePath)} is always included
            </PopoverDescription>
          </div>
          <div
            className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground"
            aria-live="polite"
          >
            <span
              className={`size-1.5 shrink-0 rounded-full ${
                state.dataChartPending
                  ? "animate-pulse bg-foreground"
                  : state.dataChartStage === "failed"
                    ? "bg-destructive"
                    : "bg-muted-foreground/40"
              }`}
            />
            <span className="hidden max-w-32 truncate sm:inline">
              {stageLabel[state.dataChartStage]}
              {state.dataChartPending ? ` · ${state.dataChartProgress}%` : ""}
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0 active:scale-[0.98]"
            onClick={() => onOpenChange(false)}
            aria-label="Close figure agent"
          >
            <XIcon />
          </Button>
          {state.dataChartPending ? (
            <Progress
              value={state.dataChartProgress}
              className="absolute inset-x-0 bottom-0 h-px rounded-none"
            />
          ) : null}
        </PopoverHeader>

        <Conversation className="min-h-0 bg-background">
          <ConversationContent className="min-h-full gap-7 px-5 py-6">
            {!hasRun && configured ? (
              <ConversationEmptyState className="mx-auto max-w-md gap-5 px-4 py-10">
                <div className="flex size-10 items-center justify-center rounded-xl border bg-muted/25 text-muted-foreground">
                  <ChartLineIcon className="size-5" weight="duotone" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-sm font-medium tracking-tight">Describe the result, not the setup</h3>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Add project files for context, then ask the agent to inspect data, write Typst, compile it, and optionally insert the figure into a document.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {suggestions.map((suggestion) => (
                    <Button
                      key={suggestion}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 rounded-full px-3 text-[11px] font-normal active:scale-[0.98]"
                      onClick={() => setRequest(suggestion)}
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
                <p className="font-mono text-[10px] text-muted-foreground/70">
                  {state.aiModel} · project tools enabled
                </p>
              </ConversationEmptyState>
            ) : null}

            {!configured ? (
              <ConversationEmptyState className="mx-auto max-w-sm gap-5 px-4 py-10">
                <div className="flex size-10 items-center justify-center rounded-xl border bg-muted/25 text-muted-foreground">
                  <ChartLineIcon className="size-5" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-sm font-medium tracking-tight">Connect a model first</h3>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Add an OpenAI-compatible endpoint and model before creating a figure.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    controller.setSidebarView("settings");
                    onOpenChange(false);
                  }}
                >
                  Open settings
                </Button>
              </ConversationEmptyState>
            ) : null}

            {hasRun ? (
              <>
                <Message from="user" className="max-w-[88%]">
                  <MessageContent className="px-3.5 py-2.5">
                    <p className="whitespace-pre-wrap leading-6">{submittedRequest}</p>
                  </MessageContent>
                  <Attachments variant="inline" className="ml-auto justify-end">
                    {[sourcePath, ...submittedContextPaths].map((path) => (
                      <Attachment
                        key={path}
                        data={contextAttachment(path, state.vaultPath)}
                        className="max-w-48 bg-background text-[10px] font-normal"
                        title={relativePath(path, state.vaultPath)}
                      >
                        <AttachmentPreview
                          fallbackIcon={<FileTypeIcon name={path} className="size-3" />}
                        />
                        <AttachmentInfo />
                      </Attachment>
                    ))}
                  </Attachments>
                </Message>

                <Message from="assistant" className="max-w-full">
                  <MessageContent className="w-full gap-5">
                    {state.dataChartReasoning ? (
                      <Reasoning isStreaming={reasoningStreaming} className="mb-0">
                        <ReasoningTrigger
                          className="text-xs"
                          getThinkingMessage={(streaming, duration) => (
                            <span>
                              {streaming
                                ? "Reasoning through the workspace…"
                                : duration == null
                                  ? "Model reasoning"
                                  : `Reasoned for ${duration} seconds`}
                            </span>
                          )}
                        />
                        <ReasoningContent className="mt-3 border-l-2 pl-3 text-xs leading-5">
                          {state.dataChartReasoning}
                        </ReasoningContent>
                      </Reasoning>
                    ) : state.dataChartPending && state.dataChartTools.length === 0 ? (
                      <Reasoning isStreaming className="mb-0">
                        <ReasoningTrigger
                          className="text-xs"
                          getThinkingMessage={() => <span>Waiting for the model…</span>}
                        />
                        <ReasoningContent className="mt-3 border-l-2 pl-3 text-xs leading-5">
                          Reasoning appears here when the selected model and provider stream it.
                        </ReasoningContent>
                      </Reasoning>
                    ) : state.dataChartTools.length > 0 && !state.dataChartReasoning ? (
                      <p className="flex items-start gap-2 text-[11px] leading-5 text-muted-foreground">
                        <BrainIcon className="mt-0.5 size-3.5 shrink-0" />
                        This model did not stream reasoning. Its file and compiler actions are shown below.
                      </p>
                    ) : null}

                    {state.dataChartTools.length ? (
                      <div className="space-y-2">
                        {state.dataChartTools.map((activity) => (
                          <Tool
                            key={activity.id}
                            defaultOpen={activity.state === "output-error"}
                            className="mb-0 overflow-hidden rounded-lg border-border/80 bg-muted/10"
                          >
                            <ToolHeader
                              type="dynamic-tool"
                              toolName={activity.name}
                              state={activity.state}
                              title={activity.title}
                              className="min-h-10 px-3 py-2"
                            />
                            <ToolContent className="border-t px-3 py-3">
                              {activity.input !== undefined ? (
                                <ToolInput input={activity.input} />
                              ) : null}
                              <ToolOutput
                                output={activity.output}
                                errorText={activity.errorText}
                              />
                            </ToolContent>
                          </Tool>
                        ))}
                      </div>
                    ) : null}

                    {state.dataChartOutput ? (
                      <CodeBlock
                        code={state.dataChartOutput}
                        language="typst"
                        className="rounded-lg border-border/80 shadow-none"
                      >
                        <CodeBlockHeader className="bg-muted/30">
                          <CodeBlockTitle>
                            <CodeIcon className="size-3.5" />
                            <CodeBlockFilename>
                              {state.dataChartRepairs
                                ? `chart.typ · ${state.dataChartRepairs} edits`
                                : "chart.typ"}
                            </CodeBlockFilename>
                          </CodeBlockTitle>
                          <CodeBlockActions>
                            <span className="text-[10px]">
                              {state.dataChartOutput.length.toLocaleString()} chars
                            </span>
                            <CodeBlockCopyButton size="icon-sm" />
                          </CodeBlockActions>
                        </CodeBlockHeader>
                      </CodeBlock>
                    ) : state.dataChartPending && state.dataChartTools.length === 0 ? (
                      <div
                        className="space-y-3 rounded-lg border px-4 py-4"
                        aria-label="Waiting for agent output"
                      >
                        <div className="flex items-center gap-2">
                          <Skeleton className="size-4 rounded-sm" />
                          <Skeleton className="h-3 w-28" />
                        </div>
                        <Skeleton className="h-2.5 w-full" />
                        <Skeleton className="h-2.5 w-4/5" />
                        <Skeleton className="h-2.5 w-3/5" />
                      </div>
                    ) : null}

                    {state.dataChartResponse ? (
                      <MessageResponse className="text-sm leading-6">
                        {state.dataChartResponse}
                      </MessageResponse>
                    ) : null}

                    {state.dataChartStage === "complete" && figurePath ? (
                      <div className="flex items-start gap-3 rounded-lg border px-3 py-3">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                          <CheckCircleIcon className="size-4" weight="fill" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">Figure ready</p>
                          <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                            {relativePath(figurePath, state.vaultPath)}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {inserted
                              ? "The figure reference was inserted and remains unsaved in the target document."
                              : "The portable figure bundle is open in the editor."}
                          </p>
                        </div>
                        <MessageActions className="shrink-0">
                          <MessageAction
                            tooltip="Open generated Typst"
                            label="Open generated Typst"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => void controller.openFile(figurePath)}
                          >
                            <CodeIcon />
                          </MessageAction>
                        </MessageActions>
                      </div>
                    ) : null}

                    {state.dataError ? (
                      <Alert variant="destructive">
                        <XIcon />
                        <AlertTitle>Could not finish the figure</AlertTitle>
                        <AlertDescription className="whitespace-pre-wrap">
                          {state.dataError}
                        </AlertDescription>
                      </Alert>
                    ) : null}

                    {state.dataChartStage === "cancelled" ? (
                      <p className="border-l-2 pl-3 text-xs leading-5 text-muted-foreground">
                        The run was stopped. Completed file actions remain visible above.
                      </p>
                    ) : null}
                  </MessageContent>
                </Message>
              </>
            ) : null}
          </ConversationContent>
          <ConversationScrollButton className="bottom-3 size-8" />
        </Conversation>

        <div className="shrink-0 border-t bg-background/95 p-3">
          <PromptInput
            onSubmit={generate}
            className="rounded-xl [&_[data-slot=input-group]]:rounded-xl [&_[data-slot=input-group]]:border-border/80 [&_[data-slot=input-group]]:shadow-sm"
          >
            <PromptInputHeader className="px-2.5 pt-2.5">
              <Attachments variant="inline" className="min-w-0 flex-1">
                <Attachment
                  data={activeAttachment}
                  className="max-w-52 bg-muted/35 text-[10px] font-normal"
                  title={`${relativePath(sourcePath, state.vaultPath)} · active data`}
                >
                  <AttachmentPreview
                    fallbackIcon={<FileTypeIcon name={sourcePath} className="size-3" />}
                  />
                  <AttachmentInfo />
                  <span className="shrink-0 text-[9px] text-muted-foreground">active</span>
                </Attachment>
                {contextPaths.map((path) => (
                  <Attachment
                    key={path}
                    data={contextAttachment(path, state.vaultPath)}
                    onRemove={() => toggleContext(path)}
                    className="max-w-52 text-[10px] font-normal"
                    title={relativePath(path, state.vaultPath)}
                  >
                    <AttachmentPreview
                      fallbackIcon={<FileTypeIcon name={path} className="size-3" />}
                    />
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
                placeholder="Ask the agent to create, compile, or insert a figure…"
                className="max-h-36 min-h-20 px-3 pt-2 text-sm"
                disabled={state.dataChartPending || !configured}
              />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <Popover open={contextOpen} onOpenChange={setContextOpen}>
                  <PopoverTrigger asChild>
                    <PromptInputButton
                      type="button"
                      aria-label="Add project files as context"
                      disabled={state.dataChartPending}
                    >
                      <PaperclipIcon className="size-4" />
                      <span>{contextPaths.length ? `${contextPaths.length} files` : "Add context"}</span>
                    </PromptInputButton>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    side="top"
                    sideOffset={8}
                    className="w-[min(22rem,calc(100vw-2rem))] p-0"
                  >
                    <Command>
                      <CommandInput placeholder="Search project files…" />
                      <CommandList>
                        <CommandEmpty>No project files found.</CommandEmpty>
                        <CommandGroup heading="Project files">
                          {files.map((file) => {
                            const selected = contextPaths.includes(file.path);
                            const active = file.path === sourcePath;
                            return (
                              <CommandItem
                                key={file.path}
                                value={relativePath(file.path, state.vaultPath)}
                                disabled={active}
                                onSelect={() => toggleContext(file.path)}
                                className="gap-2"
                              >
                                <FileTypeIcon name={file.path} className="size-4 shrink-0" />
                                <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                                  {relativePath(file.path, state.vaultPath)}
                                </span>
                                {active ? (
                                  <span className="text-[9px] text-muted-foreground">active</span>
                                ) : selected ? (
                                  <CheckIcon className="size-3.5 shrink-0" />
                                ) : null}
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <span className="hidden max-w-32 truncate font-mono text-[10px] text-muted-foreground sm:inline">
                  {state.aiModel || "No model"}
                </span>
              </PromptInputTools>
              <PromptInputSubmit
                status={chatStatus}
                onStop={() => controller.cancelDataChart()}
                disabled={!configured && !state.dataChartPending}
                size="icon-sm"
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </PopoverContent>
    </Popover>
  );
}

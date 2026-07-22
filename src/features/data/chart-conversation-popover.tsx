import { useEffect, useMemo, useState, type ReactElement } from "react";
import {
  ChartLineIcon,
  CheckCircleIcon,
  CodeIcon,
  FileArrowDownIcon,
  FloppyDiskIcon,
  MagnifyingGlassIcon,
  SlidersHorizontalIcon,
  SparkleIcon,
  WrenchIcon,
  XIcon,
} from "@phosphor-icons/react";

import { useWorkspace } from "@/app/workspace-context";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
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
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AiChartStage } from "@/application/workspace-controller";
import { fileName, fileStem, flattenFiles, relativePath } from "@/domain/workspace";

type ProcessStatus = "complete" | "active" | "pending";

const stageStep: Record<AiChartStage, number> = {
  idle: -1,
  analyzing: 0,
  generating: 1,
  writing: 2,
  compiling: 3,
  repairing: 3,
  inserting: 4,
  complete: 5,
  cancelled: -1,
  failed: -1,
};

function processStatus(stage: AiChartStage, progress: number, index: number): ProcessStatus {
  if (stage === "complete") return "complete";
  let active = stageStep[stage];
  if (stage === "failed" || stage === "cancelled") {
    active = progress < 12 ? 0 : progress < 42 ? 1 : progress < 55 ? 2 : progress < 92 ? 3 : 4;
  }
  if (index < active) return "complete";
  if (index === active) return "active";
  return "pending";
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
  const [title, setTitle] = useState("");
  const [request, setRequest] = useState("");
  const [submittedRequest, setSubmittedRequest] = useState("");
  const [submittedTarget, setSubmittedTarget] = useState("none");
  const [targetPath, setTargetPath] = useState("none");
  const [placement, setPlacement] = useState<"cursor" | "end">("cursor");
  const [optionsOpen, setOptionsOpen] = useState(true);
  const [hasRun, setHasRun] = useState(false);
  const documents = useMemo(
    () =>
      flattenFiles(state.tree).filter(
        (file) => /\.(?:typ|md)$/i.test(file.path) && !/[\\/]figures[\\/]/i.test(file.path),
      ),
    [state.tree],
  );
  const configured = Boolean(state.aiBaseUrl.trim() && state.aiModel.trim());
  const chatStatus = state.dataChartPending
    ? state.dataChartOutput
      ? "streaming"
      : "submitted"
    : state.dataChartStage === "failed"
      ? "error"
      : "ready";
  const assistantAnimating = state.dataChartPending && Boolean(state.dataChartOutput);
  const figurePath = state.dataChartResult?.typstPath;

  useEffect(() => {
    setTitle(fileStem(state.activePath));
    setRequest("");
    setSubmittedRequest("");
    setSubmittedTarget("none");
    setHasRun(false);
    setOptionsOpen(true);
  }, [state.activePath]);

  useEffect(() => {
    if (!open || hasRun) return;
    const preferred = controller.preferredFigureTargetPath;
    setTargetPath(
      documents.some((document) => document.path === preferred)
        ? preferred
        : documents[0]?.path ?? "none",
    );
  }, [controller, documents, hasRun, open]);

  async function generate(message: PromptInputMessage) {
    if (state.dataChartPending || !configured) return;
    const prompt =
      message.text.trim() ||
      "Choose the clearest publication-ready visualization for this projection.";
    setSubmittedRequest(prompt);
    setSubmittedTarget(targetPath);
    setHasRun(true);
    setOptionsOpen(false);
    await controller.generateDataChart({
      title,
      request: prompt,
      targetPath: targetPath === "none" ? null : targetPath,
      placement,
    });
  }

  const steps = [
    {
      icon: MagnifyingGlassIcon,
      label: "Inspect the selected projection",
      description: "Read dataset shape, fields, statistics, and the active slice.",
    },
    {
      icon: CodeIcon,
      label: "Write the Typst figure",
      description: state.dataChartOutput
        ? `${state.dataChartOutput.length.toLocaleString()} characters received from ${state.aiModel}.`
        : "Choose a visual form and stream editable Typst source.",
    },
    {
      icon: FloppyDiskIcon,
      label: "Save the portable bundle",
      description: "Write chart.typ, projection.json, and generation metadata.",
    },
    {
      icon: WrenchIcon,
      label: "Compile and validate",
      description: state.dataChartRepairs
        ? `${state.dataChartRepairs} compiler repair ${state.dataChartRepairs === 1 ? "pass" : "passes"} requested.`
        : "Return compiler diagnostics to the model when a repair is needed.",
    },
    {
      icon: FileArrowDownIcon,
      label: submittedTarget === "none" ? "Open the generated source" : "Insert into the document",
      description:
        submittedTarget === "none"
          ? "Keep the chart as a standalone figure bundle."
          : `Add the figure reference to ${fileName(submittedTarget)} without saving over your document.`,
    },
  ];

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={8}
        className="flex h-[min(44rem,calc(100dvh-5rem))] w-[calc(100vw-1rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:w-[38rem]"
      >
        <PopoverHeader className="shrink-0 gap-0 border-b px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <SparkleIcon className="size-4" weight="fill" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <PopoverTitle className="truncate">AI chart session</PopoverTitle>
                <Badge variant="outline" className="max-w-44 truncate font-mono font-normal">
                  {state.aiModel || "No model"}
                </Badge>
              </div>
              <PopoverDescription className="mt-0.5">
                Watch the model write, compile, and insert the Typst figure.
              </PopoverDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="-mr-1 -mt-1 shrink-0"
              onClick={() => onOpenChange(false)}
              aria-label="Close chart session"
            >
              <XIcon />
            </Button>
          </div>
          {state.dataChartPending ? (
            <div className="mt-3 flex items-center gap-3" aria-live="polite">
              <Progress value={state.dataChartProgress} className="h-1 flex-1" />
              <span className="font-mono text-[10px] text-muted-foreground">
                {state.dataChartProgress}%
              </span>
            </div>
          ) : null}
        </PopoverHeader>

        <Collapsible open={optionsOpen} onOpenChange={setOptionsOpen} className="shrink-0 border-b">
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 w-full justify-start rounded-none px-4 text-xs font-normal text-muted-foreground"
            >
              <SlidersHorizontalIcon data-icon="inline-start" />
              Output options
              <span className="ml-auto truncate font-mono text-[10px]">
                {targetPath === "none" ? "bundle only" : fileName(targetPath)}
              </span>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <FieldGroup className="grid gap-3 border-t bg-muted/15 px-4 py-4 sm:grid-cols-2">
              <Field className="gap-1.5">
                <FieldLabel htmlFor="chart-caption" className="text-xs">
                  Caption
                </FieldLabel>
                <Input
                  id="chart-caption"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={fileStem(state.activePath)}
                  disabled={state.dataChartPending}
                  className="h-8 text-xs"
                />
              </Field>
              <Field className="gap-1.5">
                <FieldLabel className="text-xs">Target document</FieldLabel>
                <Select
                  value={targetPath}
                  onValueChange={setTargetPath}
                  disabled={state.dataChartPending}
                >
                  <SelectTrigger className="h-8 w-full text-xs">
                    <SelectValue placeholder="Choose a document" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Create bundle only</SelectItem>
                    {documents.map((document) => (
                      <SelectItem key={document.path} value={document.path}>
                        {document.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field className="gap-1.5 sm:col-span-2">
                <FieldLabel className="text-xs">Insertion point</FieldLabel>
                <Select
                  value={placement}
                  onValueChange={(value) => setPlacement(value as "cursor" | "end")}
                  disabled={state.dataChartPending || targetPath === "none"}
                >
                  <SelectTrigger className="h-8 w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cursor">After the last cursor line</SelectItem>
                    <SelectItem value="end">End of document</SelectItem>
                  </SelectContent>
                </Select>
                <FieldDescription className="text-[11px]">
                  Inserted references stay unsaved in editor memory until you save the document.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </CollapsibleContent>
        </Collapsible>

        <Conversation className="min-h-0">
          <ConversationContent className="gap-5 p-4">
            <Message from="assistant">
              <MessageContent className="max-w-[34rem]">
                <MessageResponse>
                  {`I can turn **${fileName(state.activePath)}** into an editable Typst figure. Describe the comparison, distribution, dimensions, or academic style you want. Leave the prompt empty and I will choose from the current projection.`}
                </MessageResponse>
              </MessageContent>
            </Message>

            {!configured ? (
              <Message from="assistant">
                <MessageContent className="w-full">
                  <Alert>
                    <SparkleIcon />
                    <AlertTitle>AI model is not configured</AlertTitle>
                    <AlertDescription>
                      Add an OpenAI-compatible endpoint and model before starting this session.
                    </AlertDescription>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => {
                        controller.setSidebarView("settings");
                        onOpenChange(false);
                      }}
                    >
                      Open settings
                    </Button>
                  </Alert>
                </MessageContent>
              </Message>
            ) : null}

            {hasRun ? (
              <>
                <Message from="user">
                  <MessageContent>
                    <p className="whitespace-pre-wrap leading-6">{submittedRequest}</p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <Badge variant="outline" className="font-normal">
                        {submittedTarget === "none" ? "Bundle only" : fileName(submittedTarget)}
                      </Badge>
                      {submittedTarget !== "none" ? (
                        <Badge variant="outline" className="font-normal">
                          {placement === "cursor" ? "After cursor line" : "Document end"}
                        </Badge>
                      ) : null}
                    </div>
                  </MessageContent>
                </Message>

                <Message from="assistant">
                  <MessageContent className="w-full gap-4">
                    <ChainOfThought defaultOpen>
                      <ChainOfThoughtHeader>
                        {state.dataChartStage === "complete"
                          ? "Generation complete"
                          : state.dataChartStage === "failed"
                            ? "Generation stopped on an error"
                            : state.dataChartStage === "cancelled"
                              ? "Generation cancelled"
                              : "Generation process"}
                      </ChainOfThoughtHeader>
                      <ChainOfThoughtContent>
                        {steps.map((step, index) => (
                          <ChainOfThoughtStep
                            key={step.label}
                            icon={step.icon}
                            label={step.label}
                            description={step.description}
                            status={processStatus(
                              state.dataChartStage,
                              state.dataChartProgress,
                              index,
                            )}
                          />
                        ))}
                      </ChainOfThoughtContent>
                    </ChainOfThought>

                    {state.dataChartOutput ? (
                      <div className="max-h-72 overflow-auto rounded-md">
                        <CodeBlock
                          code={state.dataChartOutput}
                          language="typst"
                          className="rounded-md"
                        >
                          <CodeBlockHeader className="sticky top-0 z-[1]">
                            <CodeBlockTitle>
                              <CodeIcon className="size-3.5" />
                              <CodeBlockFilename>
                                {state.dataChartRepairs
                                  ? `chart.typ · repair ${state.dataChartRepairs}`
                                  : "chart.typ"}
                              </CodeBlockFilename>
                            </CodeBlockTitle>
                            <CodeBlockActions>
                              <Badge variant="outline" className="font-normal">
                                {assistantAnimating ? "Streaming" : "Typst"}
                              </Badge>
                              <CodeBlockCopyButton size="icon-sm" />
                            </CodeBlockActions>
                          </CodeBlockHeader>
                        </CodeBlock>
                      </div>
                    ) : state.dataChartPending ? (
                      <div className="flex min-h-24 items-center gap-3 rounded-md border bg-muted/20 px-4 text-sm text-muted-foreground">
                        <SparkleIcon className="size-4 animate-pulse" />
                        Waiting for the first Typst tokens from {state.aiModel}…
                      </div>
                    ) : null}

                    {state.dataChartStage === "complete" && figurePath ? (
                      <div className="border-l-2 border-foreground/20 pl-3">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <CheckCircleIcon className="size-4" weight="fill" />
                          Figure ready
                        </div>
                        <p className="mt-1 break-all font-mono text-[11px] leading-5 text-muted-foreground">
                          {relativePath(figurePath, state.vaultPath)}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {submittedTarget === "none"
                            ? "The standalone figure bundle is open in the editor."
                            : `The reference was inserted into ${fileName(submittedTarget)} and remains unsaved.`}
                        </p>
                        <MessageActions className="mt-2">
                          <MessageAction
                            tooltip="Open generated Typst"
                            label="Open generated Typst"
                            variant="outline"
                            size="sm"
                            onClick={() => void controller.openFile(figurePath)}
                          >
                            <CodeIcon data-icon="inline-start" />
                            Open source
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
                      <p className="text-xs leading-5 text-muted-foreground">
                        Generation was stopped. The partial streamed source remains above for review.
                      </p>
                    ) : null}
                  </MessageContent>
                </Message>
              </>
            ) : null}
          </ConversationContent>
          <ConversationScrollButton className="bottom-3" />
        </Conversation>

        <div className="shrink-0 border-t bg-background p-3">
          <PromptInput onSubmit={generate} className="rounded-lg">
            <PromptInputBody>
              <PromptInputTextarea
                value={request}
                onChange={(event) => setRequest(event.currentTarget.value)}
                placeholder="Describe the figure, or leave blank and let AI decide"
                className="max-h-28 min-h-16 text-sm"
                disabled={state.dataChartPending || !configured}
              />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <PromptInputButton
                  tooltip="Output options"
                  onClick={() => setOptionsOpen((value) => !value)}
                  variant={optionsOpen ? "secondary" : "ghost"}
                >
                  <SlidersHorizontalIcon className="size-4" />
                  <span className="hidden sm:inline">Options</span>
                </PromptInputButton>
              </PromptInputTools>
              <PromptInputSubmit
                status={chatStatus}
                onStop={() => controller.cancelDataChart()}
                disabled={!configured && !state.dataChartPending}
                size={state.dataChartPending ? "icon-sm" : "sm"}
              >
                {state.dataChartPending ? undefined : (
                  <>
                    <ChartLineIcon data-icon="inline-start" />
                    Generate
                  </>
                )}
              </PromptInputSubmit>
            </PromptInputFooter>
          </PromptInput>
        </div>
      </PopoverContent>
    </Popover>
  );
}

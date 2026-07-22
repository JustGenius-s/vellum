import type { AiTaskRepository } from "@/application/ports/ai-task-repository";
import {
  aiTaskStatusActive,
  emptyAiTaskStore,
  type AiMessageContentPart,
  type AiTask,
  type AiTaskInput,
  type AiTaskMessage,
  type AiTaskSource,
} from "@/domain/ai-task";

export interface AiTaskExecutionContext {
  taskId: string;
  input: AiTaskInput;
  assistantMessageId: string;
  signal: AbortSignal;
}

type AiTaskRunner = (context: AiTaskExecutionContext) => Promise<void>;

function id(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomUUID()}`;
}

function cloneTask(task: AiTask): AiTask {
  return structuredClone(task);
}

function restoredTask(task: AiTask): AiTask {
  if (!aiTaskStatusActive(task.status)) return task;
  return {
    ...task,
    status: "interrupted",
    stage: "failed",
    error: "Vellum closed while this task was running. Resume it to continue.",
    pendingInputs: task.activeInput
      ? [task.activeInput, ...task.pendingInputs.filter((item) => item.id !== task.activeInput?.id)]
      : task.pendingInputs,
    activeInput: null,
    messages: task.messages.map((message) =>
      message.status === "streaming" ? { ...message, status: "cancelled" as const } : message,
    ),
  };
}

export class AiTaskManager {
  private readonly repository: AiTaskRepository;
  private readonly runner: AiTaskRunner;
  private tasks: AiTask[] = [];
  private selectedTaskId: string | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly executions = new Map<string, AbortController>();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private persistChain: Promise<void> = Promise.resolve();

  constructor(repository: AiTaskRepository, runner: AiTaskRunner) {
    this.repository = repository;
    this.runner = runner;
  }

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot() {
    return this.tasks;
  }

  get selectedId() {
    return this.selectedTaskId;
  }

  get selectedTask() {
    return this.getTask(this.selectedTaskId);
  }

  async initialize() {
    let store = emptyAiTaskStore();
    try {
      store = await this.repository.loadAiTasks();
    } catch {
      // A damaged history must not prevent the workspace from opening.
    }
    this.tasks = (store.tasks ?? []).map(restoredTask).sort((a, b) => b.updatedAt - a.updatedAt);
    this.selectedTaskId = this.tasks.find((task) => !task.archivedAt)?.id ?? this.tasks[0]?.id ?? null;
    this.emit(true);
    this.queuePersistence();
  }

  getTask(taskId: string | null | undefined) {
    return this.tasks.find((task) => task.id === taskId) ?? null;
  }

  select(taskId: string | null) {
    if (taskId && !this.getTask(taskId)) return;
    if (this.selectedTaskId === taskId) return;
    this.selectedTaskId = taskId;
    this.emit(false);
  }

  create(source: AiTaskSource) {
    const now = Date.now();
    const task: AiTask = {
      id: id("task"),
      title: "New figure task",
      status: "draft",
      stage: "idle",
      progress: 0,
      source: structuredClone(source),
      contextPaths: [],
      messages: [],
      pendingInputs: [],
      activeInput: null,
      artifacts: [],
      fileChanges: [],
      generatedSource: "",
      repairs: 0,
      result: null,
      error: "",
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
      archivedAt: null,
    };
    this.tasks = [task, ...this.tasks];
    this.selectedTaskId = task.id;
    this.emit(true);
    this.queuePersistence();
    return task;
  }

  submit(taskId: string, text: string, contextPaths: string[]) {
    const task = this.getTask(taskId);
    if (!task) throw new Error("AI task not found");
    const prompt = text.trim() || "Choose and create the clearest publication-ready figure for this data.";
    const now = Date.now();
    const userMessageId = id("message");
    const input: AiTaskInput = {
      id: id("input"),
      text: prompt,
      contextPaths: [...new Set(contextPaths)],
      userMessageId,
      createdAt: now,
    };
    const message: AiTaskMessage = {
      id: userMessageId,
      role: "user",
      parts: [{ id: id("text"), type: "text", text: prompt }],
      attachments: [task.source.path, ...input.contextPaths],
      createdAt: now,
      status: "complete",
    };
    this.updateTask(taskId, (current) => ({
      ...current,
      title: current.messages.length ? current.title : prompt.replace(/\s+/g, " ").slice(0, 72),
      status: this.executions.has(taskId) ? "running" : "queued",
      stage: this.executions.has(taskId) ? current.stage : "idle",
      contextPaths: [...new Set([...current.contextPaths, ...input.contextPaths])],
      messages: [...current.messages, message],
      pendingInputs: [...current.pendingInputs, input],
      error: "",
      archivedAt: null,
    }));
    this.queuePersistence();
    void this.drain(taskId);
  }

  retry(taskId: string) {
    const task = this.getTask(taskId);
    if (!task || this.executions.has(taskId)) return;
    if (!task.pendingInputs.length && task.activeInput) {
      this.updateTask(taskId, (current) => ({
        ...current,
        pendingInputs: current.activeInput ? [current.activeInput] : current.pendingInputs,
        activeInput: null,
      }));
    }
    this.updateTask(taskId, (current) => ({ ...current, status: "queued", error: "" }));
    void this.drain(taskId);
  }

  cancel(taskId: string) {
    const execution = this.executions.get(taskId);
    if (execution) {
      execution.abort();
      return;
    }
    this.updateTask(taskId, (task) => ({
      ...task,
      status: "cancelled",
      stage: "cancelled",
      pendingInputs: [],
      error: "",
    }));
  }

  archive(taskId: string, archived = true) {
    this.updateTask(taskId, (task) => ({
      ...task,
      archivedAt: archived ? Date.now() : null,
    }));
  }

  updateTask(taskId: string, update: (task: AiTask) => AiTask, persist = true) {
    let changed = false;
    this.tasks = this.tasks.map((task) => {
      if (task.id !== taskId) return task;
      changed = true;
      return { ...update(cloneTask(task)), updatedAt: Date.now() };
    });
    if (changed) this.emit(persist);
  }

  updateAssistant(taskId: string, messageId: string, parts: AiMessageContentPart[]) {
    this.updateTask(taskId, (task) => ({
      ...task,
      messages: task.messages.map((message) =>
        message.id === messageId ? { ...message, parts: structuredClone(parts) } : message,
      ),
    }));
  }

  async flushPersistence() {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
      this.queuePersistence();
    }
    await this.persistChain;
  }

  private async drain(taskId: string) {
    if (this.executions.has(taskId)) return;
    while (true) {
      const task = this.getTask(taskId);
      const input = task?.pendingInputs[0];
      if (!task || !input) return;
      const abortController = new AbortController();
      const assistantMessageId = id("message");
      const assistantMessage: AiTaskMessage = {
        id: assistantMessageId,
        role: "assistant",
        parts: [],
        attachments: [],
        createdAt: Date.now(),
        status: "streaming",
      };
      this.executions.set(taskId, abortController);
      this.updateTask(taskId, (current) => ({
        ...current,
        status: "running",
        stage: "analyzing",
        progress: 5,
        startedAt: current.startedAt ?? Date.now(),
        activeInput: input,
        pendingInputs: current.pendingInputs.slice(1),
        messages: [...current.messages, assistantMessage],
        error: "",
      }));

      try {
        await this.runner({
          taskId,
          input,
          assistantMessageId,
          signal: abortController.signal,
        });
        abortController.signal.throwIfAborted();
        this.updateTask(taskId, (current) => ({
          ...current,
          status: current.pendingInputs.length ? "queued" : "completed",
          stage: current.pendingInputs.length ? "idle" : "complete",
          progress: current.pendingInputs.length ? 0 : 100,
          activeInput: null,
          completedAt: current.pendingInputs.length ? current.completedAt : Date.now(),
          messages: current.messages.map((message) =>
            message.id === assistantMessageId ? { ...message, status: "complete" } : message,
          ),
        }));
        this.queuePersistence();
      } catch (error) {
        const cancelled = abortController.signal.aborted;
        this.updateTask(taskId, (current) => ({
          ...current,
          status: cancelled ? "cancelled" : "failed",
          stage: cancelled ? "cancelled" : "failed",
          error: cancelled ? "" : String(error),
          activeInput: input,
          messages: current.messages.map((message) =>
            message.id === assistantMessageId
              ? { ...message, status: cancelled ? "cancelled" : "failed" }
              : message,
          ),
        }));
        this.queuePersistence();
        return;
      } finally {
        this.executions.delete(taskId);
      }
    }
  }

  private emit(persist: boolean) {
    this.listeners.forEach((listener) => listener());
    if (!persist) return;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.queuePersistence();
    }, 220);
  }

  private queuePersistence() {
    const store = { version: 1 as const, tasks: structuredClone(this.tasks) };
    this.persistChain = this.persistChain
      .catch(() => undefined)
      .then(() => this.repository.saveAiTasks(store));
  }
}

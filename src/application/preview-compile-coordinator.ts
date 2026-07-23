import type { CompileProgress, CompileSvgResult } from "@/domain/workspace";
import type { CompileRequest } from "@/application/ports/workspace-gateway";

interface CompileCoordinatorOptions {
  delay?: number;
  run(
    request: CompileRequest,
    onProgress: (progress: CompileProgress) => void,
  ): Promise<CompileSvgResult>;
  onStart(request: CompileRequest): void;
  onProgress(progress: CompileProgress): void;
  onResult(result: CompileSvgResult): void;
  onDiscardedResult?(result: CompileSvgResult): void;
  onError(error: unknown, request: CompileRequest): void;
}

type RequestFactory = () => CompileRequest;

interface PendingCompile {
  version: number;
  createRequest: RequestFactory;
}

export class PreviewCompileCoordinator {
  private readonly options: CompileCoordinatorOptions;
  private readonly delay: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private active: PendingCompile | null = null;
  private pending: PendingCompile | null = null;
  private latestVersion = 0;

  constructor(options: CompileCoordinatorOptions) {
    this.options = options;
    this.delay = options.delay ?? 250;
  }

  schedule(createRequest: RequestFactory) {
    const compile = { version: ++this.latestVersion, createRequest };
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.enqueue(compile);
    }, this.delay);
  }

  runNow(createRequest: RequestFactory) {
    const compile = { version: ++this.latestVersion, createRequest };
    this.clearTimer();
    this.enqueue(compile);
  }

  invalidate() {
    ++this.latestVersion;
    this.clearTimer();
    this.pending = null;
  }

  private enqueue(compile: PendingCompile) {
    if (this.active) {
      this.pending = compile;
      return;
    }
    this.start(compile);
  }

  private start(compile: PendingCompile) {
    this.active = compile;
    const request = compile.createRequest();
    this.options.onStart(request);
    void this.options
      .run(request, (progress) => {
        if (this.active?.version === compile.version && compile.version === this.latestVersion) {
          this.options.onProgress(progress);
        }
      })
      .then((result) => {
        if (this.active?.version !== compile.version || result.requestId !== request.requestId) return;
        if (compile.version === this.latestVersion) this.options.onResult(result);
        else this.options.onDiscardedResult?.(result);
      })
      .catch((error) => {
        if (this.active?.version === compile.version && compile.version === this.latestVersion) {
          this.options.onError(error, request);
        }
      })
      .finally(() => {
        if (this.active?.version === compile.version) this.active = null;
        const pending = this.pending;
        this.pending = null;
        if (pending) this.start(pending);
      });
  }

  private clearTimer() {
    if (this.timer != null) clearTimeout(this.timer);
    this.timer = null;
  }
}

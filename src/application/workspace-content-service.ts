import type { CompileProgressStore } from "@/application/compile-progress-store";
import { PreviewCompileCoordinator } from "@/application/preview-compile-coordinator";
import type {
  CompileOverlay,
  CompilePort,
  CompileRequest,
  DataPort,
} from "@/application/ports/workspace-gateway";
import type { WorkspaceState } from "@/application/workspace-state";
import { emptyDataQuery, isDataFile, type DataQuery, type DatasetDescriptor } from "@/domain/data";
import {
  documentFormat,
  fileName,
  fileStem,
  type CompileSvgResult,
  type DocumentTab,
  type PreviewPage,
} from "@/domain/workspace";

interface WorkspaceContentHost {
  gateway: CompilePort & DataPort;
  getState(): WorkspaceState;
  getActiveTab(): DocumentTab | null;
  getCompileOverlays(mainPath: string): CompileOverlay[];
  getCachedPageIds(): string[];
  mergePreviewPages(result: CompileSvgResult): PreviewPage[];
  compileProgress: CompileProgressStore;
  update(patch: Partial<WorkspaceState>): void;
}

export class WorkspaceContentService {
  private readonly host: WorkspaceContentHost;
  private operationToken = 0;
  private readonly coordinator: PreviewCompileCoordinator;

  constructor(host: WorkspaceContentHost) {
    this.host = host;
    this.coordinator = new PreviewCompileCoordinator({
      delay: 250,
      run: (request, onProgress) => this.host.gateway.compileSvg(request, onProgress),
      onStart: (request) => {
        this.host.update({ compilePhase: "compiling", statusText: "Compiling Typst" });
        this.host.compileProgress.publish(
          {
            phase: "compiling",
            progress: {
              stage: "preparing",
              value: 8,
              label: "Preparing source",
              detail: fileName(request.mainFile),
            },
          },
          true,
        );
      },
      onProgress: (progress) => {
        this.host.compileProgress.publish({ phase: "compiling", progress });
      },
      onResult: (result) => this.applyCompileResult(result),
      onDiscardedResult: (result) => {
        if (!result.diagnostics.some((item) => item.severity === "error")) {
          try {
            this.host.mergePreviewPages(result);
          } catch {
            // A later current request will repair any incomplete cache lineage.
          }
        }
      },
      onError: (error) => this.applyCompileError(error),
    });
  }

  scheduleCompile() {
    this.coordinator.schedule(() => this.createCompileRequest("preview"));
  }

  queryForDataset(dataset: DatasetDescriptor): DataQuery {
    const varyingDimensions =
      dataset.kind === "tensor"
        ? dataset.shape.length <= 2
          ? dataset.shape.map((_, index) => index)
          : [dataset.shape.length - 1]
        : [];
    return {
      ...emptyDataQuery(),
      datasetId: dataset.id,
      varyingDimensions,
      fixedDimensions:
        dataset.kind === "tensor"
          ? dataset.shape.flatMap((_, dimension) =>
              varyingDimensions.includes(dimension) ? [] : [{ dimension, index: 0 }],
            )
          : [],
    };
  }

  private get selectedDataset() {
    const state = this.host.getState();
    return (
      state.dataCatalog?.datasets.find((dataset) => dataset.id === state.dataQuery.datasetId) ??
      state.dataCatalog?.datasets[0] ??
      null
    );
  }

  private async inspectActiveData() {
    const tab = this.host.getActiveTab();
    const state = this.host.getState();
    if (!tab || !isDataFile(tab.path) || !state.vaultPath) return;
    const token = ++this.operationToken;
    this.host.update({
      compilePhase: "idle",
      previewPages: [],
      diagnostics: [],
      problemsOpen: false,
      dataPending: true,
      dataError: "",
      statusText: `Inspecting ${tab.name}`,
    });
    this.host.compileProgress.reset();
    try {
      const catalog = await this.host.gateway.inspectData({ path: tab.path, vaultPath: state.vaultPath });
      if (token !== this.operationToken) return;
      const dataset = catalog.datasets[0];
      if (!dataset) throw new Error("The data file contains no readable datasets");
      const dataQuery = this.queryForDataset(dataset);
      this.host.update({ dataCatalog: catalog, dataQuery });
      const dataPreview = await this.host.gateway.previewData({
        path: tab.path,
        vaultPath: state.vaultPath,
        query: dataQuery,
      });
      if (token !== this.operationToken) return;
      this.host.update({
        dataPreview,
        dataPending: false,
        dataError: "",
        statusText: `${catalog.adapter} ready`,
      });
    } catch (error) {
      if (token !== this.operationToken) return;
      this.host.update({
        dataCatalog: null,
        dataPreview: null,
        dataPending: false,
        dataError: String(error),
        statusText: `Data inspection failed: ${String(error)}`,
      });
    }
  }

  selectDataset(datasetId: string) {
    const dataset = this.host.getState().dataCatalog?.datasets.find((item) => item.id === datasetId);
    if (!dataset) return Promise.resolve();
    return this.loadDataPreview(this.queryForDataset(dataset));
  }

  async setDataVaryingDimension(dimension: number, varying: boolean) {
    const dataset = this.selectedDataset;
    const state = this.host.getState();
    if (!dataset || dataset.kind !== "tensor") return;
    let varyingDimensions = state.dataQuery.varyingDimensions.filter(
      (candidate) => candidate !== dimension,
    );
    if (varying) varyingDimensions = [...varyingDimensions, dimension].sort((a, b) => a - b).slice(-2);
    if (varyingDimensions.length === 0) varyingDimensions = [dimension];
    const fixedDimensions = dataset.shape.flatMap((size, candidate) =>
      varyingDimensions.includes(candidate)
        ? []
        : [{
            dimension: candidate,
            index: Math.min(
              state.dataQuery.fixedDimensions.find((item) => item.dimension === candidate)?.index ?? 0,
              Math.max(0, size - 1),
            ),
          }],
    );
    await this.loadDataPreview({
      ...state.dataQuery,
      offset: 0,
      varyingDimensions,
      fixedDimensions,
    });
  }

  async setDataFixedDimension(dimension: number, index: number) {
    const dataset = this.selectedDataset;
    const state = this.host.getState();
    if (!dataset || dataset.kind !== "tensor") return;
    const size = dataset.shape[dimension] ?? 1;
    const fixedDimensions = [
      ...state.dataQuery.fixedDimensions.filter((item) => item.dimension !== dimension),
      { dimension, index: Math.min(Math.max(0, index), Math.max(0, size - 1)) },
    ].sort((left, right) => left.dimension - right.dimension);
    await this.loadDataPreview({ ...state.dataQuery, fixedDimensions });
  }

  setDataPage(offset: number) {
    const state = this.host.getState();
    return this.loadDataPreview({ ...state.dataQuery, offset: Math.max(0, offset) });
  }

  refreshDataPreview() {
    return this.loadDataPreview(this.host.getState().dataQuery);
  }

  private async loadDataPreview(query: DataQuery) {
    const tab = this.host.getActiveTab();
    const state = this.host.getState();
    if (!tab || !isDataFile(tab.path) || !state.vaultPath) return;
    const token = ++this.operationToken;
    this.host.update({ dataQuery: query, dataPending: true, dataError: "", statusText: "Reading data" });
    try {
      const dataPreview = await this.host.gateway.previewData({
        path: tab.path,
        vaultPath: state.vaultPath,
        query,
      });
      if (token !== this.operationToken) return;
      this.host.update({ dataPreview, dataPending: false, statusText: "Data preview updated" });
    } catch (error) {
      if (token !== this.operationToken) return;
      this.host.update({
        dataPending: false,
        dataError: String(error),
        statusText: `Data preview failed: ${String(error)}`,
      });
    }
  }

  async compileActive() {
    const tab = this.host.getActiveTab();
    const state = this.host.getState();
    if (!tab || !state.vaultPath) {
      this.coordinator.invalidate();
      this.host.compileProgress.reset();
      this.host.update({ compilePhase: "idle", previewPages: [], diagnostics: [] });
      return;
    }
    if (isDataFile(tab.path)) {
      await this.inspectActiveData();
      return;
    }
    if (state.dataCatalog || state.dataPreview || state.dataError) {
      this.host.update({
        dataCatalog: null,
        dataPreview: null,
        dataQuery: emptyDataQuery(),
        dataPending: false,
        dataError: "",
      });
    }
    if (documentFormat(tab.path) === "bibliography") {
      ++this.operationToken;
      this.coordinator.invalidate();
      this.host.compileProgress.reset();
      this.host.update({
        compilePhase: "idle",
        previewPages: [],
        diagnostics: [],
        problemsOpen: false,
        statusText: "Bibliography ready",
      });
      return;
    }
    this.coordinator.runNow(() => this.createCompileRequest("preview"));
  }

  async exportPdf() {
    const tab = this.host.getActiveTab();
    if (!tab) return;
    if (isDataFile(tab.path)) {
      this.host.update({ statusText: "Generate or open a Typst chart before exporting PDF" });
      return;
    }
    if (documentFormat(tab.path) === "bibliography") {
      this.host.update({ statusText: "Open a Typst or Markdown document to export PDF" });
      return;
    }
    this.host.update({ statusText: "Preparing PDF" });
    try {
      await this.host.gateway.exportPdf(
        this.createCompileRequest("export", tab.path),
        `${fileStem(tab.name)}.pdf`,
      );
      this.host.update({ statusText: "PDF exported" });
    } catch (error) {
      this.host.update({ statusText: `Export failed: ${String(error)}` });
    }
  }

  private createCompileRequest(intent: CompileRequest["intent"], mainPath?: string): CompileRequest {
    const state = this.host.getState();
    const mainFile = mainPath ?? this.host.getActiveTab()?.path ?? "";
    if (!mainFile || !state.vaultPath) throw new Error("Open a document before compiling");
    return {
      requestId: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      intent,
      vaultPath: state.vaultPath,
      mainFile,
      latinFont: state.latinFont,
      cjkFont: state.cjkFont,
      packageCachePath: state.packageCachePath,
      packageDataPath: state.packageDataPath,
      cachedPageIds: this.host.getCachedPageIds(),
      overlays: this.host.getCompileOverlays(mainFile),
    };
  }

  private applyCompileResult(result: CompileSvgResult) {
    const current = this.host.getState();
    const errorCount = result.diagnostics.filter((item) => item.severity === "error").length;
    const warningCount = result.diagnostics.length - errorCount;
    let previewPages = current.previewPages;
    if (!errorCount) {
      try {
        previewPages = this.host.mergePreviewPages(result);
      } catch (error) {
        this.applyCompileError(error);
        return;
      }
    }
    const detail = errorCount
      ? `${errorCount} error${errorCount === 1 ? "" : "s"}`
      : warningCount
        ? `${warningCount} warning${warningCount === 1 ? "" : "s"}`
        : `${previewPages.length} page${previewPages.length === 1 ? "" : "s"} · ${Math.round(result.metrics.timings.totalMs)}ms`;
    const label = errorCount
      ? "Compile failed"
      : warningCount
        ? "Preview updated with warnings"
        : "Preview updated";
    this.host.update({
      previewPages,
      diagnostics: result.diagnostics,
      compilePhase: errorCount ? "failed" : "ready",
      problemsOpen: errorCount > 0 ? true : current.problemsOpen,
      statusText: errorCount
        ? `${errorCount} compile error${errorCount === 1 ? "" : "s"}`
        : warningCount
          ? `${warningCount} compile warning${warningCount === 1 ? "" : "s"}`
          : `Preview is current · ${result.metrics.reusedPages} pages reused`,
    });
    this.host.compileProgress.publish(
      { phase: errorCount ? "failed" : "ready", progress: { stage: "complete", value: 100, label, detail } },
      true,
    );
  }

  private applyCompileError(error: unknown) {
    this.host.update({
      compilePhase: "failed",
      problemsOpen: true,
      diagnostics: [{ severity: "error", message: String(error), line: null, column: null, path: null, hints: [] }],
      statusText: `Compile failed: ${String(error)}`,
    });
    this.host.compileProgress.publish(
      {
        phase: "failed",
        progress: { stage: "complete", value: 100, label: "Compile failed", detail: String(error) },
      },
      true,
    );
  }
}

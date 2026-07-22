import type { WorkspaceGateway } from "@/application/ports/workspace-gateway";
import type { WorkspaceState } from "@/application/workspace-state";
import { emptyDataQuery, isDataFile, type DataQuery, type DatasetDescriptor } from "@/domain/data";
import { documentFormat, fileName, fileStem, type DocumentTab } from "@/domain/workspace";

interface WorkspaceContentHost {
  gateway: WorkspaceGateway;
  getState(): WorkspaceState;
  getActiveTab(): DocumentTab | null;
  update(patch: Partial<WorkspaceState>): void;
}

export class WorkspaceContentService {
  private readonly host: WorkspaceContentHost;
  private compileTimer: number | null = null;
  private operationToken = 0;

  constructor(host: WorkspaceContentHost) {
    this.host = host;
  }

  scheduleCompile() {
    if (this.compileTimer) window.clearTimeout(this.compileTimer);
    this.compileTimer = window.setTimeout(() => void this.compileActive(), 420);
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
      compileProgress: null,
      previewPages: [],
      diagnostics: [],
      problemsOpen: false,
      dataPending: true,
      dataError: "",
      statusText: `Inspecting ${tab.name}`,
    });
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
    if (this.compileTimer) {
      window.clearTimeout(this.compileTimer);
      this.compileTimer = null;
    }
    const tab = this.host.getActiveTab();
    const state = this.host.getState();
    if (!tab || !state.vaultPath) {
      this.host.update({ compilePhase: "idle", compileProgress: null, previewPages: [], diagnostics: [] });
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
      this.host.update({
        compilePhase: "idle",
        compileProgress: null,
        previewPages: [],
        diagnostics: [],
        problemsOpen: false,
        statusText: "Bibliography ready",
      });
      return;
    }

    const token = ++this.operationToken;
    this.host.update({
      compilePhase: "compiling",
      compileProgress: { stage: "preparing", value: 8, label: "Preparing source", detail: fileName(tab.path) },
      statusText: "Compiling Typst",
    });
    try {
      const result = await this.host.gateway.compileSvg(
        {
          source: tab.content,
          vaultPath: state.vaultPath,
          mainFile: tab.path,
          latinFont: state.latinFont,
          cjkFont: state.cjkFont,
          packageCachePath: state.packageCachePath,
          packageDataPath: state.packageDataPath,
        },
        (compileProgress) => {
          if (token === this.operationToken) this.host.update({ compileProgress });
        },
      );
      if (token !== this.operationToken) return;
      const current = this.host.getState();
      const errorCount = result.diagnostics.filter((item) => item.severity === "error").length;
      const warningCount = result.diagnostics.length - errorCount;
      const pageCount = result.pages?.length ?? 0;
      this.host.update({
        previewPages: result.pages ?? current.previewPages,
        diagnostics: result.diagnostics,
        compilePhase: errorCount ? "failed" : "ready",
        compileProgress: {
          stage: "complete",
          value: 100,
          label: errorCount ? "Compile failed" : warningCount ? "Preview updated with warnings" : "Preview updated",
          detail: errorCount
            ? `${errorCount} error${errorCount === 1 ? "" : "s"}`
            : warningCount
              ? `${warningCount} warning${warningCount === 1 ? "" : "s"}`
              : `${pageCount} page${pageCount === 1 ? "" : "s"}`,
        },
        problemsOpen: errorCount > 0 ? true : current.problemsOpen,
        statusText: errorCount
          ? `${errorCount} compile error${errorCount === 1 ? "" : "s"}`
          : warningCount
            ? `${warningCount} compile warning${warningCount === 1 ? "" : "s"}`
            : "Preview is current",
      });
    } catch (error) {
      if (token !== this.operationToken) return;
      this.host.update({
        compilePhase: "failed",
        compileProgress: { stage: "complete", value: 100, label: "Compile failed", detail: String(error) },
        problemsOpen: true,
        diagnostics: [{ severity: "error", message: String(error), line: null, column: null, path: null, hints: [] }],
        statusText: `Compile failed: ${String(error)}`,
      });
    }
  }

  async exportPdf() {
    const tab = this.host.getActiveTab();
    const state = this.host.getState();
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
        {
          source: tab.content,
          vaultPath: state.vaultPath,
          mainFile: tab.path,
          latinFont: state.latinFont,
          cjkFont: state.cjkFont,
          packageCachePath: state.packageCachePath,
          packageDataPath: state.packageDataPath,
        },
        `${fileStem(tab.name)}.pdf`,
      );
      this.host.update({ statusText: "PDF exported" });
    } catch (error) {
      this.host.update({ statusText: `Export failed: ${String(error)}` });
    }
  }
}

import type {
  CompileRequest,
  DataFileRequest,
  DataPreviewRequest,
  PrepareDataFigureRequest,
  TemplateProjectRequest,
  WorkspaceGateway,
} from "@/application/ports/workspace-gateway";
import { dataFormat, type DataColumn, type DataPreview } from "@/domain/data";
import { emptyAiTaskStore, type AiTaskStore } from "@/domain/ai-task";
import type {
  CompileProgress,
  CompileSvgResult,
  PackageCatalog,
  PackageDirectories,
  PackageEntry,
  PackageLocation,
  SavedSession,
  SearchMatch,
  TreeNode,
} from "@/domain/workspace";
import { copyImageDataUrl, decodeImageDataUrl } from "@/infrastructure/image-data";

const ROOT = "/Vellum Demo";
const DEMO_CACHE_PATH = `${ROOT}/Library/Caches/typst/packages`;
const DEMO_DATA_PATH = `${ROOT}/Library/Application Support/typst/packages`;

const initialFiles: Record<string, string> = {
  [`${ROOT}/atlas.typ`]: `#set page(paper: "a4", margin: 28mm)
#set text(font: "Libertinus Serif", size: 10.5pt)

= Field atlas

This workspace keeps research notes close to the final page.
The editor remains plain text; the preview stays typographic.

== Working principle

Every document should answer one concrete question and link to its source.
See [[method|the method note]] for the capture loop.

== A small equation

$ integral_0^1 x^2 dif x = 1/3 $

#quote(block: true)[
  Good tools reduce the distance between a thought and its durable form.
]
`,
  [`${ROOT}/method.typ`]: `= Method

== Capture

Write the claim before collecting evidence.

== Connect

Link the note back to [[atlas|Field atlas]].

== Compose

Compile early so structure and typography evolve together.
`,
  [`${ROOT}/reading/systems.typ`]: `= Systems for writers

The useful boundary is not notes versus documents. It is temporary text versus maintained knowledge.
`,
  [`${ROOT}/draft.md`]: `# Mixed document

Markdown is edited as its own file, then typeset through the same paged preview.

## Referenced Typst content

![[method.typ]]
`,
  [`${ROOT}/observations.csv`]: `sample,temperature,response
A,18.4,0.31
B,21.7,0.46
C,24.1,0.62
D,27.8,0.81
E,30.3,0.93
`,
};

function demoDataRows(content: string) {
  const lines = content.trim().split("\n");
  const headers = lines.shift()?.split(",") ?? [];
  const rows = lines.map((line) =>
    line.split(",").map((value) => {
      const number = Number(value);
      return Number.isFinite(number) ? number : value;
    }),
  );
  const columns: DataColumn[] = headers.map((name, index) => ({
    name,
    dataType: rows.every((row) => typeof row[index] === "number") ? "number" : "string",
    numeric: rows.every((row) => typeof row[index] === "number"),
  }));
  return { headers, columns, rows };
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function asTree(files: Map<string, string>): TreeNode[] {
  const readingChildren = [...files.keys()]
    .filter((path) => path.startsWith(`${ROOT}/reading/`))
    .map((path) => ({ name: path.split("/").pop() ?? path, path, isDir: false, children: [] }));

  return [
    ...[...files.keys()]
      .filter((path) => !path.startsWith(`${ROOT}/reading/`))
      .map((path) => ({ name: path.split("/").pop() ?? path, path, isDir: false, children: [] })),
    { name: "reading", path: `${ROOT}/reading`, isDir: true, children: readingChildren },
  ];
}

function renderDemoSvg(source: string, latinFont: string, cjkFont: string) {
  const rows = source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#set"))
    .slice(0, 28);

  let y = 104;
  const content = rows
    .map((row) => {
      const wikilink = /\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/.exec(row);
      const markdownLink = /\[([^\]]+)\]\(([^)]+)\)/.exec(row);
      const linkTarget = wikilink
        ? /\.[^/]+$/.test(wikilink[1])
          ? wikilink[1]
          : `${wikilink[1]}.typ`
        : markdownLink?.[2];
      const typstHeading = /^(=+)\s+/.exec(row);
      const markdownHeading = /^(#{1,6})\s+/.exec(row);
      const headingLevel = typstHeading?.[1].length ?? markdownHeading?.[1].length ?? 0;
      const isHeading = headingLevel > 0;
      const text = escapeXml(
        row
          .replace(/^(?:=+|#{1,6})\s*/, "")
          .replace(/\*\*(.+?)\*\*/g, "$1")
          .replace(/`(.+?)`/g, "$1")
          .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
          .replace(
            /\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g,
            (_match, target: string, label: string | undefined) => label ?? target,
          ),
      );
      const size = isHeading ? (headingLevel > 1 ? 23 : 34) : 15;
      const weight = isHeading ? 650 : 420;
      const fill = isHeading ? "#1f2822" : "#3f4942";
      const current = y;
      y += isHeading ? 48 : 28;
      const fontFamily = escapeXml(`"${latinFont}", "${cjkFont}", serif`);
      const rendered = `<text x="88" y="${current}" font-family="${fontFamily}" font-size="${size}" font-weight="${weight}" fill="${fill}">${text}</text>`;
      return linkTarget ? `<a href="${escapeXml(linkTarget)}">${rendered}</a>` : rendered;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 794 1123" role="img" aria-label="Compiled Typst preview"><rect width="794" height="1123" fill="#fbfaf5"/><text x="88" y="62" font-family="ui-monospace, monospace" font-size="10" letter-spacing="2" fill="#79827a">VELLUM / DEMO COMPILE</text>${content}<text x="397" y="1062" text-anchor="middle" font-family="ui-monospace, monospace" font-size="11" fill="#9aa199">1</text></svg>`;
}

function expandDemoMarkdown(source: string, mainFile: string, files: Map<string, string>) {
  const parent = mainFile.slice(0, mainFile.lastIndexOf("/"));
  return source
    .split("\n")
    .map((line) => {
      const match = /^\s*!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]\s*$/.exec(line);
      if (!match) return line;
      const target = /\.[^/]+$/.test(match[1]) ? match[1] : `${match[1]}.typ`;
      const path = target.startsWith("/") ? target : `${parent}/${target}`;
      return files.get(path) ?? `Missing reference: ${target}`;
    })
    .join("\n");
}

interface DemoCompileJob {
  request: CompileRequest;
  onProgress(progress: CompileProgress): void;
  resolve(result: CompileSvgResult): void;
  reject(error: unknown): void;
}

export class DemoWorkspaceGateway implements WorkspaceGateway {
  readonly mode = "demo" as const;
  private readonly svgPages = new Map<string, string>();
  private readonly compileQueue: DemoCompileJob[] = [];
  private compileActive = false;

  aiFetch(input: RequestInfo | URL, init?: RequestInit) {
    return globalThis.fetch(input, init);
  }
  private readonly files = new Map(Object.entries(initialFiles));
  private packageEntries: PackageEntry[] = [
    {
      spec: "@preview/tiaoma:0.3.0",
      namespace: "preview",
      name: "tiaoma",
      version: "0.3.0",
      location: "cache",
      path: `${DEMO_CACHE_PATH}/preview/tiaoma/0.3.0`,
      sizeBytes: 184_672,
      modifiedAtMs: Date.UTC(2026, 6, 18, 9, 42),
      removable: true,
      description: "Barcode and QR code generation for Typst.",
      template: null,
    },
    {
      spec: "@local/house-style:0.2.4",
      namespace: "local",
      name: "house-style",
      version: "0.2.4",
      location: "data",
      path: `${DEMO_DATA_PATH}/local/house-style/0.2.4`,
      sizeBytes: 63_918,
      modifiedAtMs: Date.UTC(2026, 5, 27, 14, 16),
      removable: true,
      description: "A local document style shared across projects.",
      template: null,
    },
    {
      spec: "@preview/charged-ieee:0.1.4",
      namespace: "preview",
      name: "charged-ieee",
      version: "0.1.4",
      location: "cache",
      path: `${DEMO_CACHE_PATH}/preview/charged-ieee/0.1.4`,
      sizeBytes: 128_441,
      modifiedAtMs: Date.UTC(2026, 6, 12, 11, 24),
      removable: true,
      description: "An IEEE-style paper template with bibliography support.",
      template: {
        path: "template",
        entrypoint: "main.typ",
        thumbnail: null,
      },
    },
  ];
  private session: SavedSession = {
    vaultPath: ROOT,
    openTabs: [`${ROOT}/atlas.typ`, `${ROOT}/method.typ`],
    activeTabPath: `${ROOT}/atlas.typ`,
    latinFont: "Georgia",
    cjkFont: "Songti SC",
    packageCachePath: null,
    packageDataPath: null,
    aiBaseUrl: "https://api.openai.com/v1",
    aiModel: null,
    aiApiKey: null,
  };
  private aiTaskStore: AiTaskStore = emptyAiTaskStore();

  async chooseVault() {
    return ROOT;
  }

  async listTree() {
    return asTree(this.files);
  }

  async readFile(path: string) {
    const content = this.files.get(path);
    if (content == null) throw new Error(`File not found: ${path}`);
    return content;
  }

  async writeFile(path: string, content: string) {
    this.files.set(path, content);
  }

  async createEntry(path: string, _vaultPath: string, isDir: boolean) {
    if (isDir) return;
    if (this.files.has(path)) throw new Error("An entry with that name already exists");
    this.files.set(
      path,
      path.toLowerCase().endsWith(".bib")
        ? ""
        : path.toLowerCase().endsWith(".md")
        ? "# Untitled\n\nStart writing here.\n"
        : "= Untitled\n\nStart writing here.\n",
    );
  }

  async renameEntry(oldPath: string, newPath: string) {
    const content = this.files.get(oldPath);
    if (content == null) throw new Error("File not found");
    this.files.delete(oldPath);
    this.files.set(newPath, content);
  }

  async deleteEntry(path: string) {
    for (const candidate of [...this.files.keys()]) {
      if (candidate === path || candidate.startsWith(`${path}/`)) this.files.delete(candidate);
    }
  }

  async search(_vaultPath: string, query: string) {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const matches: SearchMatch[] = [];

    this.files.forEach((content, path) => {
      content.split("\n").forEach((line, index) => {
        const column = line.toLowerCase().indexOf(needle);
        if (column >= 0) {
          matches.push({
            path,
            relativePath: path.slice(ROOT.length + 1),
            line: index + 1,
            column: column + 1,
            preview: line.trim(),
          });
        }
      });
    });
    return matches.slice(0, 200);
  }

  async indexBacklinks() {
    const links: Record<string, string[]> = {};
    const pattern = /\[\[([^|\]]+)(?:\|[^\]]+)?\]\]/g;

    this.files.forEach((content, path) => {
      for (const match of content.matchAll(pattern)) {
        const source =
          path
            .split("/")
            .pop()
            ?.replace(/\.(?:typ|md|bib)$/, "") ?? path;
        const target = match[1].split("/").pop()?.replace(/\.(?:typ|md|bib)$/, "") ?? match[1];
        links[target] = [...(links[target] ?? []), source];
      }
    });
    return { links };
  }

  async inspectData(request: DataFileRequest) {
    const content = this.files.get(request.path);
    if (content == null) throw new Error("Data file not found");
    const format = dataFormat(request.path);
    if (!format) throw new Error("Unsupported demo data format");
    const { columns, rows } = demoDataRows(content);
    return {
      format,
      adapter: "Demo delimited text",
      sourcePath: request.path,
      sizeBytes: content.length,
      datasets: [
        {
          id: "$",
          name: "Data",
          kind: "table" as const,
          dataType: "records",
          shape: [rows.length, columns.length],
          dimensions: [],
          columns,
          rowCount: rows.length,
          description: "Demo research observations",
        },
      ],
      warnings: [],
    };
  }

  async previewData(request: DataPreviewRequest): Promise<DataPreview> {
    const content = this.files.get(request.path);
    if (content == null) throw new Error("Data file not found");
    const { columns, rows } = demoDataRows(content);
    const statistics = columns.flatMap((column, index) => {
      if (!column.numeric) return [];
      const values = rows.map((row) => Number(row[index])).sort((left, right) => left - right);
      const mean = values.reduce((total, value) => total + value, 0) / values.length;
      return [
        {
          name: column.name,
          count: values.length,
          validCount: values.length,
          missingCount: 0,
          min: values[0] ?? null,
          max: values.at(-1) ?? null,
          mean,
          median: values[Math.floor(values.length / 2)] ?? null,
          standardDeviation: Math.sqrt(
            values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length,
          ),
          q1: values[Math.floor((values.length - 1) * 0.25)] ?? null,
          q3: values[Math.floor((values.length - 1) * 0.75)] ?? null,
          sampled: false,
        },
      ];
    });
    return {
      datasetId: "$",
      kind: "table",
      columns,
      rows: rows.slice(request.query.offset, request.query.offset + request.query.limit),
      rowOffset: request.query.offset,
      totalRows: rows.length,
      statistics,
      tensor: null,
      sampled: false,
    };
  }

  async prepareDataFigure(request: PrepareDataFigureRequest) {
    const preview = await this.previewData(request);
    const stem = (request.title?.trim() || request.path.split("/").pop()?.replace(/\.[^.]+$/, "") || "data")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "data-chart";
    let id = stem;
    let suffix = 2;
    while (this.files.has(`${ROOT}/figures/${id}/chart.typ`)) id = `${stem}-${suffix++}`;
    const directoryPath = `${ROOT}/figures/${id}`;
    const typstPath = `${directoryPath}/chart.typ`;
    const dataPath = `${directoryPath}/projection.json`;
    const metadataPath = `${directoryPath}/metadata.toml`;
    this.files.set(
      dataPath,
      JSON.stringify(
        {
          version: 1,
          source: { file: request.path.split("/").pop(), format: dataFormat(request.path), dataset: preview.datasetId },
          kind: preview.kind,
          columns: preview.columns,
          rows: preview.rows,
          rowOffset: preview.rowOffset,
          totalRows: preview.totalRows,
          statistics: preview.statistics,
          tensor: preview.tensor,
          query: request.query,
          sampled: preview.sampled,
        },
        null,
        2,
      ),
    );
    this.files.set(
      metadataPath,
      `version = 1\nid = ${JSON.stringify(id)}\nmodel = ${JSON.stringify(request.model)}\nprompt = ${JSON.stringify(request.prompt)}\n`,
    );
    this.files.set(typstPath, request.typstSource);
    return { id, directoryPath, typstPath, dataPath, metadataPath };
  }

  async listFontFamilies() {
    return {
      latin: ["Libertinus Serif", "New Computer Modern", "Georgia"],
      cjk: ["Songti SC", "Hiragino Sans GB", "STHeiti", "PingFang SC"],
    };
  }

  async choosePackageDirectory(location: PackageLocation) {
    return location === "cache"
      ? `${ROOT}/Custom/Downloaded packages`
      : `${ROOT}/Custom/Local packages`;
  }

  async listPackages(directories: PackageDirectories) {
    return this.packageCatalog(directories);
  }

  async installPackage(input: string, directories: PackageDirectories) {
    await new Promise((resolve) => setTimeout(resolve, 240));
    const match = /^@([a-z0-9_-]+)\/([a-z0-9_-]+)(?::(\d+\.\d+\.\d+))?$/i.exec(
      input.trim(),
    );
    if (!match) throw new Error("Use @namespace/name or @namespace/name:version");

    const [, namespace, name, requestedVersion] = match;
    const version = requestedVersion ?? (name.toLowerCase() === "tiaoma" ? "0.3.0" : "1.0.0");
    const spec = `@${namespace}/${name}:${version}`;
    if (!this.packageEntries.some((entry) => entry.spec === spec)) {
      this.packageEntries = [
        ...this.packageEntries,
        {
          spec,
          namespace,
          name,
          version,
          location: "cache",
          path: `${DEMO_CACHE_PATH}/${namespace}/${name}/${version}`,
          sizeBytes: 91_000 + name.length * 1_337,
          modifiedAtMs: Date.now(),
          removable: true,
          description: null,
          template: null,
        },
      ];
    }
    return this.packageCatalog(directories);
  }

  async removePackage(
    spec: string,
    location: PackageLocation,
    directories: PackageDirectories,
  ) {
    this.packageEntries = this.packageEntries.filter(
      (entry) => entry.spec !== spec || entry.location !== location,
    );
    return this.packageCatalog(directories);
  }

  async clearPackageCache(directories: PackageDirectories) {
    this.packageEntries = this.packageEntries.filter((entry) => entry.location !== "cache");
    return this.packageCatalog(directories);
  }

  async chooseTemplateParent() {
    return `${ROOT}/Projects`;
  }

  async preflightTemplateProject(request: TemplateProjectRequest) {
    const destination = `${request.parentPath.replace(/\/$/, "")}/${request.projectName}`;
    const templateFiles = ["main.typ", "references.bib"];
    const existingFiles = [...this.files.keys()].filter((path) =>
      path.startsWith(`${destination}/`),
    );
    const conflicts = templateFiles.filter((path) => this.files.has(`${destination}/${path}`));
    return {
      destination,
      entrypoint: `${destination}/main.typ`,
      destinationExists: existingFiles.length > 0,
      destinationFileCount: existingFiles.length,
      templateFileCount: templateFiles.length,
      filesToCreate: templateFiles.length - conflicts.length,
      conflicts,
      requiresMerge: existingFiles.length > 0,
    };
  }

  async createTemplateProject(request: TemplateProjectRequest, merge: boolean) {
    const plan = await this.preflightTemplateProject(request);
    if (plan.requiresMerge && !merge) {
      throw new Error("The project directory is not empty; confirm a merge first");
    }
    const templateFiles: Record<string, string> = {
      "main.typ": `#set page(paper: "us-letter")\n\n= ${request.projectName}\n\nStart writing here.\n`,
      "references.bib": "",
    };
    let createdFiles = 0;
    for (const [path, content] of Object.entries(templateFiles)) {
      const target = `${plan.destination}/${path}`;
      if (this.files.has(target)) continue;
      this.files.set(target, content);
      createdFiles += 1;
    }
    return {
      destination: plan.destination,
      entrypoint: plan.entrypoint,
      createdFiles,
      skippedFiles: plan.templateFileCount - createdFiles,
    };
  }

  async readTemplateThumbnail() {
    return null;
  }

  async compileSvg(
    request: CompileRequest,
    onProgress: (progress: CompileProgress) => void,
  ): Promise<CompileSvgResult> {
    onProgress({ stage: "queued", value: 2, label: "Queued for compilation", detail: request.requestId });
    return new Promise((resolve, reject) => {
      if (request.intent === "preview") {
        for (let index = this.compileQueue.length - 1; index >= 0; index -= 1) {
          if (this.compileQueue[index].request.intent === "preview") {
            this.compileQueue.splice(index, 1)[0].reject(new Error("Preview request superseded"));
          }
        }
      }
      if (this.compileQueue.length >= 16) {
        reject(new Error("Compile queue is full"));
        return;
      }
      this.compileQueue.push({ request, onProgress, resolve, reject });
      this.runNextCompile();
    });
  }

  private runNextCompile() {
    if (this.compileActive || !this.compileQueue.length) return;
    const priority = { preview: 3, export: 2, validate: 1 } as const;
    let selected = 0;
    for (let index = 1; index < this.compileQueue.length; index += 1) {
      if (priority[this.compileQueue[index].request.intent] > priority[this.compileQueue[selected].request.intent]) {
        selected = index;
      }
    }
    const job = this.compileQueue.splice(selected, 1)[0];
    this.compileActive = true;
    void this.compileSvgNow(job.request, job.onProgress)
      .then(job.resolve, job.reject)
      .finally(() => {
        this.compileActive = false;
        this.runNextCompile();
      });
  }

  private async compileSvgNow(
    request: CompileRequest,
    onProgress: (progress: CompileProgress) => void,
  ): Promise<CompileSvgResult> {
    const startedAt = performance.now();
    const name = request.mainFile.split(/[\\/]/).pop() ?? request.mainFile;
    onProgress({ stage: "preparing", value: 10, label: "Preparing source", detail: name });
    await new Promise((resolve) => setTimeout(resolve, 70));
    onProgress({ stage: "compiling", value: 38, label: "Compiling document", detail: name });
    await new Promise((resolve) => setTimeout(resolve, 90));
    onProgress({ stage: "rendering", value: 78, label: "Laying out pages", detail: null });
    await new Promise((resolve) => setTimeout(resolve, 60));
    const files = new Map(this.files);
    for (const overlay of request.overlays) files.set(overlay.path, overlay.content);
    const mainOverlay = request.overlays.find(
      (overlay) => overlay.path.replaceAll("\\", "/") === request.mainFile.replaceAll("\\", "/"),
    );
    if (!mainOverlay) throw new Error("The main document is missing from compile overlays");
    const source = mainOverlay.content;
    const diagnostics = source.includes("#error")
      ? [
          {
            severity: "error",
            message: "Demo compiler found an explicit #error marker.",
            line: source.split("\n").findIndex((line) => line.includes("#error")) + 1,
            column: 1,
            path: request.mainFile.slice(ROOT.length + 1),
            hints: ["Remove the marker to resume preview rendering."],
          },
        ]
      : [];
    const prepared = request.mainFile.toLowerCase().endsWith(".md")
      ? expandDemoMarkdown(source, request.mainFile, files)
      : source;
    onProgress({ stage: "rendering", value: 94, label: "Rendering preview", detail: "Page 1 of 1" });
    const svg = renderDemoSvg(prepared, request.latinFont, request.cjkFont);
    let hash = 0x811c9dc5;
    for (let index = 0; index < svg.length; index += 1) {
      hash ^= svg.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    const id = `${(hash >>> 0).toString(16).padStart(8, "0")}`.repeat(4);
    const frontendHasPage = request.cachedPageIds.includes(id);
    const changedPages = diagnostics.length || request.intent === "validate" || frontendHasPage
      ? []
      : [{ id, svg }];
    const cached = frontendHasPage || this.svgPages.has(id);
    this.svgPages.set(id, svg);
    const totalMs = performance.now() - startedAt;
    return {
      requestId: request.requestId,
      diagnostics,
      pageOrder: diagnostics.length ? [] : [{ id, width: 794, height: 1123 }],
      changedPages,
      metrics: {
        timings: { queueMs: 0, prepareMs: 70, compileMs: 90, renderMs: 60, totalMs },
        fileCacheHits: request.overlays.length,
        fileCacheMisses: 0,
        renderedPages: cached ? 0 : 1,
        reusedPages: cached ? 1 : 0,
        svgBytes: changedPages.reduce((bytes, page) => bytes + page.svg.length, 0),
      },
    };
  }

  async exportPdf() {
    throw new Error("PDF export is available in the Tauri desktop runtime.");
  }

  async openExternalUrl(url: string) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  copyPreviewImage(source: string) {
    return copyImageDataUrl(source);
  }

  async downloadPreviewImage(source: string, defaultStem: string) {
    const image = decodeImageDataUrl(source);
    const anchor = document.createElement("a");
    anchor.href = source;
    anchor.download = `${defaultStem}.${image.extension}`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    return true;
  }

  async loadSession() {
    return structuredClone(this.session);
  }

  async saveSession(session: SavedSession) {
    this.session = structuredClone(session);
  }

  async loadAiTasks() {
    return structuredClone(this.aiTaskStore);
  }

  async saveAiTasks(store: AiTaskStore) {
    this.aiTaskStore = structuredClone(store);
  }

  private packageCatalog(directories: PackageDirectories): PackageCatalog {
    const cachePath = directories.cachePath ?? DEMO_CACHE_PATH;
    const dataPath = directories.dataPath ?? DEMO_DATA_PATH;
    const packages = structuredClone(this.packageEntries)
      .map((entry) => ({
        ...entry,
        path: `${entry.location === "cache" ? cachePath : dataPath}/${entry.namespace}/${entry.name}/${entry.version}`,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
    const cached = packages.filter((entry) => entry.location === "cache");
    const local = packages.filter((entry) => entry.location === "data");
    return {
      packages,
      cachePath,
      dataPath,
      cacheSizeBytes: cached.reduce((total, entry) => total + entry.sizeBytes, 0),
      dataSizeBytes: local.reduce((total, entry) => total + entry.sizeBytes, 0),
      cacheCount: cached.length,
      dataCount: local.length,
      templateCount: packages.filter((entry) => entry.template != null).length,
    };
  }
}

import type {
  CompileRequest,
  TemplateProjectRequest,
  WorkspaceGateway,
} from "@/application/ports/workspace-gateway";
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
};

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

export class DemoWorkspaceGateway implements WorkspaceGateway {
  readonly mode = "demo" as const;
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
  };

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
    const name = request.mainFile.split(/[\\/]/).pop() ?? request.mainFile;
    onProgress({ stage: "preparing", value: 10, label: "Preparing source", detail: name });
    await new Promise((resolve) => setTimeout(resolve, 70));
    onProgress({ stage: "compiling", value: 38, label: "Compiling document", detail: name });
    await new Promise((resolve) => setTimeout(resolve, 90));
    onProgress({ stage: "rendering", value: 78, label: "Laying out pages", detail: null });
    await new Promise((resolve) => setTimeout(resolve, 60));
    const diagnostics = request.source.includes("#error")
      ? [
          {
            severity: "error",
            message: "Demo compiler found an explicit #error marker.",
            line: request.source.split("\n").findIndex((line) => line.includes("#error")) + 1,
            column: 1,
            path: request.mainFile.slice(ROOT.length + 1),
            hints: ["Remove the marker to resume preview rendering."],
          },
        ]
      : [];
    const source = request.mainFile.toLowerCase().endsWith(".md")
      ? expandDemoMarkdown(request.source, request.mainFile, this.files)
      : request.source;
    onProgress({ stage: "rendering", value: 94, label: "Rendering preview", detail: "Page 1 of 1" });
    return {
      pages: diagnostics.length
        ? null
        : [renderDemoSvg(source, request.latinFont, request.cjkFont)],
      diagnostics,
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

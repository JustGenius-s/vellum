import type { CompileRequest, WorkspaceGateway } from "@/application/ports/workspace-gateway";
import type { CompileSvgResult, SavedSession, SearchMatch, TreeNode } from "@/domain/workspace";

const ROOT = "/Vellum Demo";

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
};

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
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

function renderDemoSvg(source: string) {
  const rows = source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#set"))
    .slice(0, 28);

  let y = 104;
  const content = rows
    .map((row) => {
      const isHeading = row.startsWith("=");
      const text = escapeXml(
        row
          .replace(/^=+\s*/, "")
          .replace(
            /\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g,
            (_match, target: string, label: string | undefined) => label ?? target,
          ),
      );
      const size = isHeading ? (row.startsWith("==") ? 23 : 34) : 15;
      const weight = isHeading ? 650 : 420;
      const fill = isHeading ? "#1f2822" : "#3f4942";
      const current = y;
      y += isHeading ? 48 : 28;
      return `<text x="88" y="${current}" font-family="Georgia, serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${text}</text>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 794 1123" role="img" aria-label="Compiled Typst preview"><rect width="794" height="1123" fill="#fbfaf5"/><text x="88" y="62" font-family="ui-monospace, monospace" font-size="10" letter-spacing="2" fill="#79827a">VELLUM / DEMO COMPILE</text>${content}<text x="397" y="1062" text-anchor="middle" font-family="ui-monospace, monospace" font-size="11" fill="#9aa199">1</text></svg>`;
}

export class DemoWorkspaceGateway implements WorkspaceGateway {
  readonly mode = "demo" as const;
  private readonly files = new Map(Object.entries(initialFiles));
  private session: SavedSession = {
    vaultPath: ROOT,
    openTabs: [`${ROOT}/atlas.typ`, `${ROOT}/method.typ`],
    activeTabPath: `${ROOT}/atlas.typ`,
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
    this.files.set(path, "= Untitled\n\nStart writing here.\n");
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
            ?.replace(/\.typ$/, "") ?? path;
        links[match[1]] = [...(links[match[1]] ?? []), source];
      }
    });
    return { links };
  }

  async compileSvg(request: CompileRequest): Promise<CompileSvgResult> {
    await new Promise((resolve) => setTimeout(resolve, 220));
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
    return { pages: diagnostics.length ? null : [renderDemoSvg(request.source)], diagnostics };
  }

  async exportPdf() {
    throw new Error("PDF export is available in the Tauri desktop runtime.");
  }

  async loadSession() {
    return structuredClone(this.session);
  }

  async saveSession(session: SavedSession) {
    this.session = structuredClone(session);
  }
}

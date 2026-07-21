import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

import type { CompileRequest, WorkspaceGateway } from "@/application/ports/workspace-gateway";
import type {
  BacklinkIndex,
  CompileSvgResult,
  FontCatalog,
  SavedSession,
  SearchMatch,
  TreeNode,
} from "@/domain/workspace";

interface TauriTreeNode {
  name: string;
  path: string;
  is_dir: boolean;
  children: TauriTreeNode[];
}

function normalizeTree(nodes: TauriTreeNode[]): TreeNode[] {
  return nodes.map((node) => ({
    name: node.name,
    path: node.path,
    isDir: node.is_dir,
    children: normalizeTree(node.children),
  }));
}

export class TauriWorkspaceGateway implements WorkspaceGateway {
  readonly mode = "desktop" as const;

  async chooseVault() {
    const selected = await open({ directory: true, multiple: false });
    return typeof selected === "string" ? selected : null;
  }

  async listTree(vaultPath: string) {
    const nodes = await invoke<TauriTreeNode[]>("list_vault_tree", { path: vaultPath });
    return normalizeTree(nodes);
  }

  readFile(path: string, vaultPath: string) {
    return invoke<string>("read_file", { path, vaultPath });
  }

  writeFile(path: string, content: string, vaultPath: string) {
    return invoke<void>("write_file", { path, content, vaultPath });
  }

  createEntry(path: string, vaultPath: string, isDir: boolean) {
    return invoke<void>("create_file", { path, vaultPath, isDir });
  }

  renameEntry(oldPath: string, newPath: string, vaultPath: string) {
    return invoke<void>("rename_path", { oldPath, newPath, vaultPath });
  }

  deleteEntry(path: string, vaultPath: string) {
    return invoke<void>("delete_path", { path, vaultPath });
  }

  search(vaultPath: string, query: string) {
    return invoke<SearchMatch[]>("search_vault", { vaultPath, query });
  }

  indexBacklinks(vaultPath: string) {
    return invoke<BacklinkIndex>("index_backlinks", { vaultPath });
  }

  listFontFamilies() {
    return invoke<FontCatalog>("list_font_families");
  }

  compileSvg(request: CompileRequest) {
    return invoke<CompileSvgResult>("compile_typst_svg", {
      source: request.source,
      vaultPath: request.vaultPath,
      mainFile: request.mainFile,
      latinFont: request.latinFont,
      cjkFont: request.cjkFont,
    });
  }

  async exportPdf(request: CompileRequest, defaultName: string) {
    const pdfBytes = await invoke<number[]>("compile_typst_pdf", {
      source: request.source,
      vaultPath: request.vaultPath,
      mainFile: request.mainFile,
      latinFont: request.latinFont,
      cjkFont: request.cjkFont,
    });
    const target = await save({
      defaultPath: defaultName,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (target) await writeFile(target, new Uint8Array(pdfBytes));
  }

  loadSession() {
    return invoke<SavedSession>("load_state");
  }

  saveSession(session: SavedSession) {
    return invoke<void>("save_state", { state: session });
  }
}

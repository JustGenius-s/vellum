import { Channel, invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { openUrl } from "@tauri-apps/plugin-opener";

import type {
  CompileRequest,
  DataFileRequest,
  DataPreviewRequest,
  GenerateDataChartRequest,
  TemplateProjectRequest,
  WorkspaceGateway,
} from "@/application/ports/workspace-gateway";
import type { DataCatalog, DataPreview, GeneratedDataChart } from "@/domain/data";
import type {
  BacklinkIndex,
  CompileProgress,
  CompileSvgResult,
  FontCatalog,
  PackageCatalog,
  PackageDirectories,
  PackageLocation,
  SavedSession,
  SearchMatch,
  TemplateProjectPlan,
  TemplateProjectResult,
  TemplateThumbnail,
  TreeNode,
} from "@/domain/workspace";
import { copyImageDataUrl, decodeImageDataUrl } from "@/infrastructure/image-data";

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

  inspectData(request: DataFileRequest) {
    return invoke<DataCatalog>("inspect_data_file", { request });
  }

  previewData(request: DataPreviewRequest) {
    return invoke<DataPreview>("preview_data_file", { request });
  }

  generateDataChart(request: GenerateDataChartRequest) {
    return invoke<GeneratedDataChart>("generate_data_chart", { request });
  }

  listFontFamilies() {
    return invoke<FontCatalog>("list_font_families");
  }

  async choosePackageDirectory(location: PackageLocation) {
    const selected = await open({
      directory: true,
      multiple: false,
      title:
        location === "cache"
          ? "Choose downloaded package folder"
          : "Choose local package folder",
    });
    return typeof selected === "string" ? selected : null;
  }

  listPackages(directories: PackageDirectories) {
    return invoke<PackageCatalog>("list_packages", { ...directories });
  }

  installPackage(spec: string, directories: PackageDirectories) {
    return invoke<PackageCatalog>("install_package", { spec, ...directories });
  }

  removePackage(
    spec: string,
    location: PackageLocation,
    directories: PackageDirectories,
  ) {
    return invoke<PackageCatalog>("remove_package", { spec, location, ...directories });
  }

  clearPackageCache(directories: PackageDirectories) {
    return invoke<PackageCatalog>("clear_package_cache", { ...directories });
  }

  async chooseTemplateParent() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Choose project location",
    });
    return typeof selected === "string" ? selected : null;
  }

  preflightTemplateProject(request: TemplateProjectRequest) {
    return invoke<TemplateProjectPlan>("preflight_template_project", { ...request });
  }

  createTemplateProject(request: TemplateProjectRequest, merge: boolean) {
    return invoke<TemplateProjectResult>("create_template_project", { ...request, merge });
  }

  readTemplateThumbnail(
    spec: string,
    location: PackageLocation,
    directories: PackageDirectories,
  ) {
    return invoke<TemplateThumbnail | null>("read_template_thumbnail", {
      spec,
      location,
      ...directories,
    });
  }

  compileSvg(request: CompileRequest, onProgress: (progress: CompileProgress) => void) {
    const progress = new Channel<CompileProgress>(onProgress);
    return invoke<CompileSvgResult>("compile_typst_svg", {
      source: request.source,
      vaultPath: request.vaultPath,
      mainFile: request.mainFile,
      latinFont: request.latinFont,
      cjkFont: request.cjkFont,
      packageCachePath: request.packageCachePath,
      packageDataPath: request.packageDataPath,
      progress,
    });
  }

  openExternalUrl(url: string) {
    return openUrl(url);
  }

  copyPreviewImage(source: string) {
    return copyImageDataUrl(source);
  }

  async downloadPreviewImage(source: string, defaultStem: string) {
    const image = decodeImageDataUrl(source);
    const target = await save({
      defaultPath: `${defaultStem}.${image.extension}`,
      filters: [{ name: "Image", extensions: [image.extension] }],
    });
    if (!target) return false;
    await writeFile(target, image.bytes);
    return true;
  }

  async exportPdf(request: CompileRequest, defaultName: string) {
    const pdfBytes = await invoke<number[]>("compile_typst_pdf", {
      source: request.source,
      vaultPath: request.vaultPath,
      mainFile: request.mainFile,
      latinFont: request.latinFont,
      cjkFont: request.cjkFont,
      packageCachePath: request.packageCachePath,
      packageDataPath: request.packageDataPath,
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

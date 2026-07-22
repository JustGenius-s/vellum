import type { WorkspaceGateway } from "@/application/ports/workspace-gateway";
import type { WorkspaceState } from "@/application/workspace-state";
import type {
  PackageDirectories,
  PackageLocation,
  TemplateProjectPlan,
  TemplateProjectResult,
  TemplateThumbnail,
} from "@/domain/workspace";

interface WorkspacePackageHost {
  gateway: WorkspaceGateway;
  getState(): WorkspaceState;
  update(patch: Partial<WorkspaceState>): void;
  loadVault(vaultPath: string, openTabs: string[], activeTabPath: string | null): Promise<void>;
  scheduleSessionSave(): void;
  compileActive(): Promise<void>;
  hasActiveTab(): boolean;
}

export class WorkspacePackageService {
  private readonly host: WorkspacePackageHost;

  constructor(host: WorkspacePackageHost) {
    this.host = host;
  }

  private get directories(): PackageDirectories {
    const state = this.host.getState();
    return {
      cachePath: state.packageCachePath,
      dataPath: state.packageDataPath,
    };
  }

  async refresh() {
    const state = this.host.getState();
    if (state.packagesPending) return;
    this.host.update({ packagesPending: true, packageError: "" });
    try {
      const packageCatalog = await this.host.gateway.listPackages(this.directories);
      this.host.update({
        packageCatalog,
        packagesLoaded: true,
        packagesPending: false,
        statusText: `${packageCatalog.packages.length} Typst packages available locally`,
      });
    } catch (error) {
      this.host.update({
        packagesPending: false,
        packageError: String(error),
        statusText: `Package refresh failed: ${String(error)}`,
      });
    }
  }

  async install(spec: string) {
    if (this.host.getState().packageMutationPending) return;
    this.host.update({ packageMutationPending: true, packageError: "" });
    try {
      const packageCatalog = await this.host.gateway.installPackage(spec, this.directories);
      this.host.update({
        packageCatalog,
        packagesLoaded: true,
        statusText: `Installed ${spec.trim()}`,
      });
    } catch (error) {
      this.host.update({
        packageError: String(error),
        statusText: `Package install failed: ${String(error)}`,
      });
      throw error;
    } finally {
      this.host.update({ packageMutationPending: false });
    }
  }

  async remove(spec: string, location: PackageLocation) {
    if (this.host.getState().packageMutationPending) return;
    this.host.update({ packageMutationPending: true, packageError: "" });
    try {
      const packageCatalog = await this.host.gateway.removePackage(
        spec,
        location,
        this.directories,
      );
      this.host.update({ packageCatalog, statusText: `Removed ${spec}` });
    } catch (error) {
      this.host.update({
        packageError: String(error),
        statusText: `Package removal failed: ${String(error)}`,
      });
      throw error;
    } finally {
      this.host.update({ packageMutationPending: false });
    }
  }

  async clearCache() {
    if (this.host.getState().packageMutationPending) return;
    this.host.update({ packageMutationPending: true, packageError: "" });
    try {
      const packageCatalog = await this.host.gateway.clearPackageCache(this.directories);
      this.host.update({ packageCatalog, statusText: "Downloaded packages cleared" });
    } catch (error) {
      this.host.update({
        packageError: String(error),
        statusText: `Downloaded package clear failed: ${String(error)}`,
      });
      throw error;
    } finally {
      this.host.update({ packageMutationPending: false });
    }
  }

  async chooseTemplateParent() {
    try {
      return await this.host.gateway.chooseTemplateParent();
    } catch (error) {
      this.host.update({
        packageError: String(error),
        statusText: `Could not choose project location: ${String(error)}`,
      });
      return null;
    }
  }

  async preflightTemplateProject(
    spec: string,
    location: PackageLocation,
    parentPath: string,
    projectName: string,
  ): Promise<TemplateProjectPlan> {
    if (this.host.getState().packageMutationPending) {
      throw new Error("Another package operation is running");
    }
    this.host.update({ packageMutationPending: true, packageError: "" });
    try {
      return await this.host.gateway.preflightTemplateProject({
        spec,
        location,
        parentPath,
        projectName,
        ...this.directories,
      });
    } catch (error) {
      this.host.update({
        packageError: String(error),
        statusText: `Template validation failed: ${String(error)}`,
      });
      throw error;
    } finally {
      this.host.update({ packageMutationPending: false });
    }
  }

  async createTemplateProject(
    spec: string,
    location: PackageLocation,
    parentPath: string,
    projectName: string,
    merge: boolean,
  ): Promise<TemplateProjectResult> {
    if (this.host.getState().packageMutationPending) {
      throw new Error("Another package operation is running");
    }
    this.host.update({ packageMutationPending: true, packageError: "" });
    try {
      const result = await this.host.gateway.createTemplateProject(
        {
          spec,
          location,
          parentPath,
          projectName,
          ...this.directories,
        },
        merge,
      );
      await this.host.loadVault(result.destination, [result.entrypoint], result.entrypoint);
      if (this.host.getState().phase !== "ready") {
        throw new Error("The project was created, but Vellum could not open it");
      }
      this.host.update({
        sidebarView: "files",
        statusText: `Created ${projectName} from ${spec}`,
      });
      return result;
    } catch (error) {
      this.host.update({
        packageError: String(error),
        statusText: `Template creation failed: ${String(error)}`,
      });
      throw error;
    } finally {
      this.host.update({ packageMutationPending: false });
    }
  }

  async loadTemplateThumbnail(
    spec: string,
    location: PackageLocation,
  ): Promise<TemplateThumbnail | null> {
    try {
      return await this.host.gateway.readTemplateThumbnail(spec, location, this.directories);
    } catch {
      return null;
    }
  }

  clearError() {
    if (this.host.getState().packageError) this.host.update({ packageError: "" });
  }

  async chooseDirectory(location: PackageLocation) {
    try {
      const path = await this.host.gateway.choosePackageDirectory(location);
      if (path) await this.applyDirectory(location, path);
    } catch (error) {
      this.host.update({
        packageError: String(error),
        statusText: `Could not choose package directory: ${String(error)}`,
      });
    }
  }

  resetDirectory(location: PackageLocation) {
    return this.applyDirectory(location, null);
  }

  private async applyDirectory(location: PackageLocation, path: string | null) {
    const state = this.host.getState();
    if (state.packageMutationPending) return;
    const directories: PackageDirectories = {
      cachePath: location === "cache" ? path : state.packageCachePath,
      dataPath: location === "data" ? path : state.packageDataPath,
    };
    this.host.update({ packageMutationPending: true, packageError: "" });
    try {
      const packageCatalog = await this.host.gateway.listPackages(directories);
      this.host.update({
        packageCatalog,
        packagesLoaded: true,
        packageCachePath: directories.cachePath,
        packageDataPath: directories.dataPath,
        statusText: `${location === "cache" ? "Downloaded" : "Local"} package directory updated`,
      });
      this.host.scheduleSessionSave();
      if (this.host.hasActiveTab()) await this.host.compileActive();
    } catch (error) {
      this.host.update({
        packageError: String(error),
        statusText: `Package directory update failed: ${String(error)}`,
      });
    } finally {
      this.host.update({ packageMutationPending: false });
    }
  }
}

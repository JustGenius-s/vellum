import { useMemo, useState } from "react";
import {
  ArticleIcon,
  ArrowCounterClockwiseIcon,
  ArrowClockwiseIcon,
  DownloadSimpleIcon,
  FilePlusIcon,
  FolderOpenIcon,
  HardDrivesIcon,
  MagnifyingGlassIcon,
  PackageIcon,
  TrashIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";

import { useWorkspace } from "@/app/workspace-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PackageEntry, PackageLocation } from "@/domain/workspace";

import { TemplateProjectDialog } from "./template-project-dialog";

function formatBytes(value: number) {
  if (value < 1_024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1_024;
  let unit = units[0];
  for (let index = 1; index < units.length && size >= 1_024; index += 1) {
    size /= 1_024;
    unit = units[index];
  }
  return `${size >= 10 ? size.toFixed(0) : size.toFixed(1)} ${unit}`;
}

function formatModified(value: number | null) {
  if (value == null) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(value);
}

function PackageListSkeleton() {
  return (
    <div className="border-t">
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="grid min-h-20 grid-cols-[minmax(0,1fr)_5rem] items-center gap-4 border-b py-4 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_2rem]"
        >
          <div className="flex items-center gap-3">
            <Skeleton className="size-9 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-48 max-w-full" />
            </div>
          </div>
          <Skeleton className="h-3 w-14 justify-self-end" />
          <Skeleton className="hidden h-3 w-16 justify-self-end sm:block" />
          <Skeleton className="hidden size-7 justify-self-end sm:block" />
        </div>
      ))}
    </div>
  );
}

function EmptyPackageList({
  filtered,
  kind,
}: {
  filtered: boolean;
  kind: "packages" | "templates";
}) {
  const templates = kind === "templates";
  return (
    <div className="flex min-h-64 flex-col items-start justify-center border-y px-5 py-10 sm:px-8">
      <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        {filtered ? (
          <MagnifyingGlassIcon className="size-5" />
        ) : templates ? (
          <ArticleIcon className="size-5" weight="duotone" />
        ) : (
          <PackageIcon className="size-5" weight="duotone" />
        )}
      </div>
      <h2 className="text-base font-semibold">
        {filtered
          ? `No ${templates ? "templates" : "packages"} match`
          : templates
            ? "No Typst templates are installed"
            : "No Typst packages are installed"}
      </h2>
      <p className="mt-1.5 max-w-md text-sm leading-6 text-muted-foreground">
        {filtered
          ? "Change the search phrase to include a name, namespace, version, description, or path."
          : templates
            ? "Install a template package by spec above. Templates are packages with a [template] section in typst.toml."
            : "Install a package above, or compile a document with an @preview import to populate the cache automatically."}
      </p>
    </div>
  );
}

function PackageRow({
  entry,
  disabled,
  onRemove,
  onUseTemplate,
}: {
  entry: PackageEntry;
  disabled: boolean;
  onRemove(entry: PackageEntry): void;
  onUseTemplate(entry: PackageEntry): void;
}) {
  return (
    <div className="grid min-h-20 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b py-3.5 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_auto]">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          {entry.template ? (
            <ArticleIcon className="size-4.5" weight="duotone" />
          ) : (
            <PackageIcon className="size-4.5" weight="duotone" />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">{entry.name}</span>
            <Badge variant="outline" className="font-mono font-normal">
              {entry.version}
            </Badge>
            {entry.template ? (
              <Badge variant="outline" className="font-normal">
                Template
              </Badge>
            ) : null}
            <Badge variant="secondary" className="font-normal sm:hidden">
              {entry.location === "cache" ? "Downloaded" : "Local"}
            </Badge>
          </div>
          <p className="mt-1 truncate font-mono text-xs text-muted-foreground" title={entry.path}>
            {entry.spec}
          </p>
          {entry.description ? (
            <p className="mt-1 truncate text-xs text-muted-foreground" title={entry.description}>
              {entry.description}
            </p>
          ) : null}
        </div>
      </div>

      <div className="text-right sm:text-left">
        <Badge variant="secondary" className="hidden font-normal sm:inline-flex">
          {entry.location === "cache" ? "Downloaded" : "Local"}
        </Badge>
        <p className="mt-1 text-xs text-muted-foreground sm:hidden">
          {formatBytes(entry.sizeBytes)}
        </p>
      </div>

      <div className="hidden text-right text-xs text-muted-foreground sm:block">
        <p className="font-mono text-foreground/75">{formatBytes(entry.sizeBytes)}</p>
        <p className="mt-1">{formatModified(entry.modifiedAtMs)}</p>
      </div>

      <div className="hidden items-center justify-self-end gap-1.5 sm:flex">
        {entry.template ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => onUseTemplate(entry)}
          >
            <FilePlusIcon data-icon="inline-start" /> Create project
          </Button>
        ) : null}
        {entry.removable ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={disabled}
                onClick={() => onRemove(entry)}
                aria-label={`Remove ${entry.spec}`}
              >
                <TrashIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remove package</TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      {entry.removable ? (
        <div className="col-span-2 flex flex-wrap gap-2 sm:hidden">
          {entry.template ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => onUseTemplate(entry)}
            >
              <FilePlusIcon data-icon="inline-start" /> Create project
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={disabled}
            onClick={() => onRemove(entry)}
          >
            <TrashIcon data-icon="inline-start" /> Remove package
          </Button>
        </div>
      ) : entry.template ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="col-span-2 justify-self-start sm:hidden"
          disabled={disabled}
          onClick={() => onUseTemplate(entry)}
        >
          <FilePlusIcon data-icon="inline-start" /> Create project
        </Button>
      ) : null}
    </div>
  );
}

function PackageSection({
  title,
  description,
  entries,
  disabled,
  onRemove,
  onUseTemplate,
}: {
  title: string;
  description: string;
  entries: PackageEntry[];
  disabled: boolean;
  onRemove(entry: PackageEntry): void;
  onUseTemplate(entry: PackageEntry): void;
}) {
  if (entries.length === 0) return null;

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">{entries.length}</span>
      </div>
      <div className="border-t">
        {entries.map((entry) => (
          <PackageRow
            key={`${entry.location}:${entry.spec}`}
            entry={entry}
            disabled={disabled}
            onRemove={onRemove}
            onUseTemplate={onUseTemplate}
          />
        ))}
      </div>
    </section>
  );
}

function PackageDirectoryRow({
  location,
  label,
  description,
  path,
  custom,
  disabled,
  onChoose,
  onReset,
}: {
  location: PackageLocation;
  label: string;
  description: string;
  path: string | null;
  custom: boolean;
  disabled: boolean;
  onChoose(location: PackageLocation): void;
  onReset(location: PackageLocation): void;
}) {
  return (
    <div className="grid gap-4 border-b py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <FolderOpenIcon className="size-4.5" weight="duotone" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium">{label}</h3>
            <Badge variant="outline" className="font-normal">
              {custom ? "Custom" : "System default"}
            </Badge>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
          <p className="mt-1.5 break-all font-mono text-xs leading-5 text-foreground/75">
            {path ?? "Directory unavailable"}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 md:justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChoose(location)}
          disabled={disabled}
        >
          <FolderOpenIcon data-icon="inline-start" /> Choose folder
        </Button>
        {custom ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onReset(location)}
            disabled={disabled}
          >
            <ArrowCounterClockwiseIcon data-icon="inline-start" /> Reset
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function PackageManagerPage() {
  const { controller, state } = useWorkspace();
  const [query, setQuery] = useState("");
  const [installSpec, setInstallSpec] = useState("@preview/tiaoma:0.3.0");
  const [installError, setInstallError] = useState("");
  const [removeTarget, setRemoveTarget] = useState<PackageEntry | null>(null);
  const [templateTarget, setTemplateTarget] = useState<PackageEntry | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [catalogView, setCatalogView] = useState("packages");
  const catalog = state.packageCatalog;
  const mutationPending = state.packageMutationPending;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredPackages = useMemo(
    () =>
      catalog.packages.filter((entry) => {
        if (!normalizedQuery) return true;
        return [
          entry.spec,
          entry.name,
          entry.namespace,
          entry.version,
          entry.path,
          entry.description ?? "",
          entry.template?.entrypoint ?? "",
        ].some((value) => value.toLowerCase().includes(normalizedQuery));
      }),
    [catalog.packages, normalizedQuery],
  );
  const cachedPackages = filteredPackages.filter((entry) => entry.location === "cache");
  const dataPackages = filteredPackages.filter((entry) => entry.location === "data");
  const filteredTemplates = filteredPackages.filter((entry) => entry.template != null);
  const cachedTemplates = filteredTemplates.filter((entry) => entry.location === "cache");
  const dataTemplates = filteredTemplates.filter((entry) => entry.location === "data");

  async function install(event: React.FormEvent) {
    event.preventDefault();
    const spec = installSpec.trim();
    if (!spec) return;
    setInstallError("");
    try {
      await controller.installPackage(spec);
    } catch (error) {
      setInstallError(String(error));
    }
  }

  async function removePackage() {
    if (!removeTarget) return;
    try {
      await controller.removePackage(removeTarget.spec, removeTarget.location);
      setRemoveTarget(null);
    } catch {
      // The controller exposes the backend error in the page state.
    }
  }

  async function clearCache() {
    try {
      await controller.clearPackageCache();
      setClearOpen(false);
    } catch {
      // The controller exposes the backend error in the page state.
    }
  }

  function openRemoval(entry: PackageEntry) {
    controller.clearPackageError();
    setRemoveTarget(entry);
  }

  function openClearCache() {
    controller.clearPackageError();
    setClearOpen(true);
  }

  function openTemplate(entry: PackageEntry) {
    controller.clearPackageError();
    setTemplateTarget(entry);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2 sm:px-3">
        <SidebarTrigger className="md:hidden" />
        <PackageIcon className="size-4 text-muted-foreground" weight="duotone" />
        <span className="text-sm font-medium">Package manager</span>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-10 lg:px-12">
          <div className="max-w-2xl">
            <p className="font-mono text-xs text-muted-foreground">TYPST / RESOURCES</p>
            <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">
              Typst packages and templates
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              Packages and templates share Typst's downloaded and local directories. Templates can
              create standalone projects from the files declared in their manifest.
            </p>
          </div>

          <section className="mt-8 border-y">
            <div className="grid grid-cols-2 sm:grid-cols-4">
              <div className="py-4 sm:px-5 sm:first:pl-0">
                <p className="text-xs text-muted-foreground">Downloaded</p>
                <p className="mt-1 font-mono text-xl font-medium">{catalog.cacheCount}</p>
              </div>
              <div className="border-l py-4 pl-4 sm:px-5">
                <p className="text-xs text-muted-foreground">Download size</p>
                <p className="mt-1 font-mono text-xl font-medium">
                  {formatBytes(catalog.cacheSizeBytes)}
                </p>
              </div>
              <div className="border-t py-4 sm:border-l sm:border-t-0 sm:px-5">
                <p className="text-xs text-muted-foreground">Local</p>
                <p className="mt-1 font-mono text-xl font-medium">{catalog.dataCount}</p>
              </div>
              <div className="border-l border-t py-4 pl-4 sm:border-t-0 sm:px-5 sm:pr-0">
                <p className="text-xs text-muted-foreground">Local size</p>
                <p className="mt-1 font-mono text-xl font-medium">
                  {formatBytes(catalog.dataSizeBytes)}
                </p>
              </div>
            </div>
          </section>

          <section className="mt-8">
            <div className="flex items-center gap-2 border-b pb-3">
              <HardDrivesIcon className="size-4 text-muted-foreground" />
              <div>
                <h2 className="text-sm font-semibold">Package directories</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Changing a directory does not move or delete packages from the previous location.
                </p>
              </div>
            </div>
            <PackageDirectoryRow
              location="cache"
              label="Downloaded packages"
              description="Automatic @preview downloads and packages installed from the form below."
              path={catalog.cachePath}
              custom={Boolean(state.packageCachePath)}
              disabled={mutationPending}
              onChoose={(location) => void controller.choosePackageDirectory(location)}
              onReset={(location) => void controller.resetPackageDirectory(location)}
            />
            <PackageDirectoryRow
              location="data"
              label="Local packages"
              description="User-maintained packages arranged as namespace/name/version."
              path={catalog.dataPath}
              custom={Boolean(state.packageDataPath)}
              disabled={mutationPending}
              onChoose={(location) => void controller.choosePackageDirectory(location)}
              onReset={(location) => void controller.resetPackageDirectory(location)}
            />
          </section>

          <section className="mt-8 max-w-2xl">
            <form onSubmit={install} className="grid gap-2">
              <label htmlFor="package-spec" className="text-sm font-medium">
                Install a package or template
              </label>
              <p id="package-spec-help" className="text-xs leading-5 text-muted-foreground">
                Use a full spec such as @preview/tiaoma:0.3.0, or omit the version to install the
                latest published package or template.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="package-spec"
                  value={installSpec}
                  onChange={(event) => {
                    setInstallSpec(event.target.value);
                    if (installError) setInstallError("");
                    controller.clearPackageError();
                  }}
                  className="h-9 font-mono"
                  aria-describedby="package-spec-help"
                  aria-invalid={Boolean(installError)}
                  spellCheck={false}
                  autoCapitalize="none"
                  disabled={mutationPending}
                />
                <Button
                  type="submit"
                  className="h-9 sm:shrink-0"
                  disabled={!installSpec.trim() || mutationPending}
                >
                  <DownloadSimpleIcon data-icon="inline-start" />
                  {mutationPending ? "Working" : "Install"}
                </Button>
              </div>
              {installError ? (
                <p className="text-xs leading-5 text-destructive" role="alert">
                  {installError}
                </p>
              ) : null}
            </form>
          </section>

          <section className="mt-10">
            <Tabs value={catalogView} onValueChange={setCatalogView}>
              <div className="flex flex-col gap-3 border-b pb-3 sm:flex-row sm:items-center sm:justify-between">
                <TabsList variant="line">
                  <TabsTrigger value="packages">
                    Packages <span className="font-mono text-xs">{catalog.packages.length}</span>
                  </TabsTrigger>
                  <TabsTrigger value="templates">
                    Templates <span className="font-mono text-xs">{catalog.templateCount}</span>
                  </TabsTrigger>
                </TabsList>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={() => void controller.refreshPackages()}
                    disabled={state.packagesPending || mutationPending}
                  >
                    <ArrowClockwiseIcon data-icon="inline-start" /> Refresh
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={openClearCache}
                    disabled={catalog.cacheCount === 0 || mutationPending}
                  >
                    <TrashIcon data-icon="inline-start" /> Clear downloads
                  </Button>
                </div>
              </div>

              <label className="mt-5 grid max-w-md gap-2 text-sm font-medium">
                Search {catalogView}
                <span className="relative">
                  <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Name, namespace, description, version, or path"
                    className="h-9 pl-8"
                  />
                </span>
              </label>

              {state.packageError && !installError ? (
                <div
                  className="mt-4 flex items-start gap-3 border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                  role="alert"
                >
                  <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
                  <p className="min-w-0 break-words leading-5">{state.packageError}</p>
                </div>
              ) : null}

              <TabsContent value="packages">
                {state.packagesPending && !state.packagesLoaded ? (
                  <div className="mt-6">
                    <PackageListSkeleton />
                  </div>
                ) : filteredPackages.length === 0 ? (
                  <div className="mt-6">
                    <EmptyPackageList
                      kind="packages"
                      filtered={Boolean(normalizedQuery && catalog.packages.length)}
                    />
                  </div>
                ) : (
                  <>
                    <PackageSection
                      title="Downloaded packages"
                      description="Removing a downloaded package is safe; Typst fetches it again when imported."
                      entries={cachedPackages}
                      disabled={mutationPending}
                      onRemove={openRemoval}
                      onUseTemplate={openTemplate}
                    />
                    <PackageSection
                      title="Local packages"
                      description="Packages in the configured local directory. Removing one permanently deletes that version."
                      entries={dataPackages}
                      disabled={mutationPending}
                      onRemove={openRemoval}
                      onUseTemplate={openTemplate}
                    />
                  </>
                )}
              </TabsContent>

              <TabsContent value="templates">
                {state.packagesPending && !state.packagesLoaded ? (
                  <div className="mt-6">
                    <PackageListSkeleton />
                  </div>
                ) : filteredTemplates.length === 0 ? (
                  <div className="mt-6">
                    <EmptyPackageList
                      kind="templates"
                      filtered={Boolean(normalizedQuery && catalog.templateCount)}
                    />
                  </div>
                ) : (
                  <>
                    <PackageSection
                      title="Downloaded templates"
                      description="Templates downloaded from Typst Universe and stored in the package cache."
                      entries={cachedTemplates}
                      disabled={mutationPending}
                      onRemove={openRemoval}
                      onUseTemplate={openTemplate}
                    />
                    <PackageSection
                      title="Local templates"
                      description="User-maintained templates from the configured local package directory."
                      entries={dataTemplates}
                      disabled={mutationPending}
                      onRemove={openRemoval}
                      onUseTemplate={openTemplate}
                    />
                  </>
                )}
              </TabsContent>
            </Tabs>
          </section>
        </main>
      </ScrollArea>

      {templateTarget ? (
        <TemplateProjectDialog
          key={`${templateTarget.location}:${templateTarget.spec}`}
          target={templateTarget}
          onClose={() => setTemplateTarget(null)}
        />
      ) : null}

      <Dialog open={Boolean(removeTarget)} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {removeTarget?.location === "data"
                ? "Remove local package?"
                : "Remove downloaded package?"}
            </DialogTitle>
            <DialogDescription>
              {removeTarget?.location === "data"
                ? `${removeTarget?.spec} will be permanently deleted from the local package directory.`
                : `${removeTarget?.spec} will be deleted from downloaded packages. A later import can download it again.`}
            </DialogDescription>
          </DialogHeader>
          {state.packageError ? (
            <p className="text-xs leading-5 text-destructive" role="alert">
              {state.packageError}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void removePackage()}
              disabled={mutationPending}
            >
              <TrashIcon data-icon="inline-start" />
              {mutationPending ? "Removing" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear downloaded packages?</DialogTitle>
            <DialogDescription>
              This removes {catalog.cacheCount} downloaded package
              {catalog.cacheCount === 1 ? "" : "s"} using {formatBytes(catalog.cacheSizeBytes)}.
              Local packages are not changed.
            </DialogDescription>
          </DialogHeader>
          {state.packageError ? (
            <p className="text-xs leading-5 text-destructive" role="alert">
              {state.packageError}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setClearOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void clearCache()}
              disabled={mutationPending}
            >
              <TrashIcon data-icon="inline-start" />
              {mutationPending ? "Clearing" : "Clear downloads"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

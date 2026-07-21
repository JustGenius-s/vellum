import { useMemo, useState } from "react";
import {
  ArrowClockwiseIcon,
  DownloadSimpleIcon,
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PackageEntry } from "@/domain/workspace";

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

function EmptyPackageList({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex min-h-64 flex-col items-start justify-center border-y px-5 py-10 sm:px-8">
      <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        {filtered ? (
          <MagnifyingGlassIcon className="size-5" />
        ) : (
          <PackageIcon className="size-5" weight="duotone" />
        )}
      </div>
      <h2 className="text-base font-semibold">
        {filtered ? "No packages match" : "No Typst packages are installed"}
      </h2>
      <p className="mt-1.5 max-w-md text-sm leading-6 text-muted-foreground">
        {filtered
          ? "Change the search phrase to include a package name, namespace, version, or path."
          : "Install a package above, or compile a document with an @preview import to populate the cache automatically."}
      </p>
    </div>
  );
}

function PackageRow({
  entry,
  disabled,
  onRemove,
}: {
  entry: PackageEntry;
  disabled: boolean;
  onRemove(entry: PackageEntry): void;
}) {
  return (
    <div className="grid min-h-20 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b py-3.5 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_2rem]">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <PackageIcon className="size-4.5" weight="duotone" />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">{entry.name}</span>
            <Badge variant="outline" className="font-mono font-normal">
              {entry.version}
            </Badge>
            <Badge variant="secondary" className="font-normal sm:hidden">
              {entry.location === "cache" ? "Cache" : "Local"}
            </Badge>
          </div>
          <p className="mt-1 truncate font-mono text-xs text-muted-foreground" title={entry.path}>
            {entry.spec}
          </p>
        </div>
      </div>

      <div className="text-right sm:text-left">
        <Badge variant="secondary" className="hidden font-normal sm:inline-flex">
          {entry.location === "cache" ? "Cache" : "Local data"}
        </Badge>
        <p className="mt-1 text-xs text-muted-foreground sm:hidden">
          {formatBytes(entry.sizeBytes)}
        </p>
      </div>

      <div className="hidden text-right text-xs text-muted-foreground sm:block">
        <p className="font-mono text-foreground/75">{formatBytes(entry.sizeBytes)}</p>
        <p className="mt-1">{formatModified(entry.modifiedAtMs)}</p>
      </div>

      <div className="hidden justify-self-end sm:block">
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
            <TooltipContent>Remove cached package</TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      {entry.removable ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="col-span-2 justify-self-start text-muted-foreground sm:hidden"
          disabled={disabled}
          onClick={() => onRemove(entry)}
        >
          <TrashIcon data-icon="inline-start" /> Remove from cache
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
}: {
  title: string;
  description: string;
  entries: PackageEntry[];
  disabled: boolean;
  onRemove(entry: PackageEntry): void;
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
          />
        ))}
      </div>
    </section>
  );
}

export function PackageManagerPage() {
  const { controller, state } = useWorkspace();
  const [query, setQuery] = useState("");
  const [installSpec, setInstallSpec] = useState("@preview/tiaoma:0.3.0");
  const [installError, setInstallError] = useState("");
  const [removeTarget, setRemoveTarget] = useState<PackageEntry | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const catalog = state.packageCatalog;
  const mutationPending = state.packageMutationPending;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredPackages = useMemo(
    () =>
      catalog.packages.filter((entry) => {
        if (!normalizedQuery) return true;
        return [entry.spec, entry.name, entry.namespace, entry.version, entry.path].some((value) =>
          value.toLowerCase().includes(normalizedQuery),
        );
      }),
    [catalog.packages, normalizedQuery],
  );
  const cachedPackages = filteredPackages.filter((entry) => entry.location === "cache");
  const dataPackages = filteredPackages.filter((entry) => entry.location === "data");

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
      await controller.removePackage(removeTarget.spec);
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
            <p className="font-mono text-xs text-muted-foreground">TYPST / PACKAGES</p>
            <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Typst packages</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              Imports resolve through Typst's standard data and cache directories. Preview packages
              are downloaded automatically and remain available to later compilations.
            </p>
          </div>

          <section className="mt-8 border-y">
            <div className="grid grid-cols-1 divide-y sm:grid-cols-[1fr_1fr_2fr] sm:divide-x sm:divide-y-0">
              <div className="py-4 sm:px-5 sm:first:pl-0">
                <p className="text-xs text-muted-foreground">Cached packages</p>
                <p className="mt-1 font-mono text-xl font-medium">{catalog.cacheCount}</p>
              </div>
              <div className="py-4 sm:px-5">
                <p className="text-xs text-muted-foreground">Cache size</p>
                <p className="mt-1 font-mono text-xl font-medium">
                  {formatBytes(catalog.cacheSizeBytes)}
                </p>
              </div>
              <div className="min-w-0 py-4 sm:px-5 sm:pr-0">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <HardDrivesIcon className="size-3.5" /> Cache location
                </p>
                <p
                  className="mt-1.5 break-all font-mono text-xs leading-5 text-foreground/75"
                  title={catalog.cachePath ?? undefined}
                >
                  {catalog.cachePath ?? "System cache unavailable"}
                </p>
              </div>
            </div>
          </section>

          <section className="mt-8 max-w-2xl">
            <form onSubmit={install} className="grid gap-2">
              <label htmlFor="package-spec" className="text-sm font-medium">
                Install a package
              </label>
              <p id="package-spec-help" className="text-xs leading-5 text-muted-foreground">
                Use a full spec such as @preview/tiaoma:0.3.0, or omit the version to install the
                latest published release.
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
                <Button type="submit" className="h-9 sm:shrink-0" disabled={!installSpec.trim() || mutationPending}>
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
            <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
              <label className="grid max-w-md flex-1 gap-2 text-sm font-medium">
                Installed packages
                <span className="relative">
                  <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search name, namespace, version, or path"
                    className="h-9 pl-8"
                  />
                </span>
              </label>
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
                  <TrashIcon data-icon="inline-start" /> Clear cache
                </Button>
              </div>
            </div>

            {state.packageError && !installError ? (
              <div
                className="mt-4 flex items-start gap-3 border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                role="alert"
              >
                <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
                <p className="min-w-0 break-words leading-5">{state.packageError}</p>
              </div>
            ) : null}

            {state.packagesPending && !state.packagesLoaded ? (
              <div className="mt-6">
                <PackageListSkeleton />
              </div>
            ) : filteredPackages.length === 0 ? (
              <div className="mt-6">
                <EmptyPackageList filtered={Boolean(normalizedQuery && catalog.packages.length)} />
              </div>
            ) : (
              <>
                <PackageSection
                  title="Package cache"
                  description="Downloaded packages. Removing one is safe; Typst downloads it again when imported."
                  entries={cachedPackages}
                  disabled={mutationPending}
                  onRemove={openRemoval}
                />
                <PackageSection
                  title="Local package data"
                  description="Packages managed outside Vellum in Typst's data directory. They are shown read-only."
                  entries={dataPackages}
                  disabled={mutationPending}
                  onRemove={openRemoval}
                />
              </>
            )}

            {catalog.dataPath ? (
              <div className="mt-8 flex items-start gap-2 border-t pt-4 text-xs leading-5 text-muted-foreground">
                <FolderOpenIcon className="mt-0.5 size-3.5 shrink-0" />
                <p className="min-w-0 break-all font-mono">{catalog.dataPath}</p>
              </div>
            ) : null}
          </section>
        </main>
      </ScrollArea>

      <Dialog open={Boolean(removeTarget)} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove cached package?</DialogTitle>
            <DialogDescription>
              {removeTarget?.spec} will be deleted from the package cache. A later import can
              download it again.
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
            <DialogTitle>Clear the Typst package cache?</DialogTitle>
            <DialogDescription>
              This removes {catalog.cacheCount} cached package
              {catalog.cacheCount === 1 ? "" : "s"} using {formatBytes(catalog.cacheSizeBytes)}.
              Local data packages are not changed.
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
              {mutationPending ? "Clearing" : "Clear cache"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

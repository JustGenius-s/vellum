import { useEffect, useState } from "react";
import {
  ArrowLeftIcon,
  FilePlusIcon,
  FolderOpenIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";

import { useWorkspace } from "@/app/workspace-context";
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
import type { PackageEntry, TemplateProjectPlan } from "@/domain/workspace";

function displayProjectPath(parentPath: string, projectName: string) {
  if (!parentPath || !projectName.trim()) return "";
  const separator = parentPath.includes("\\") ? "\\" : "/";
  return `${parentPath.replace(/[\\/]$/, "")}${separator}${projectName.trim()}`;
}

export function TemplateProjectDialog({
  target,
  onClose,
}: {
  target: PackageEntry;
  onClose(): void;
}) {
  const { controller, state } = useWorkspace();
  const [parentPath, setParentPath] = useState("");
  const [projectName, setProjectName] = useState(target.name);
  const [plan, setPlan] = useState<TemplateProjectPlan | null>(null);
  const [error, setError] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const pending = state.packageMutationPending;
  const validProjectName =
    Boolean(projectName.trim()) &&
    projectName.trim() !== "." &&
    projectName.trim() !== ".." &&
    !/[\\/]/.test(projectName);
  const destination = displayProjectPath(parentPath, projectName);

  useEffect(() => {
    if (!target.template?.thumbnail) return;
    let disposed = false;
    let objectUrl: string | null = null;
    void controller.loadTemplateThumbnail(target.spec, target.location).then((thumbnail) => {
      if (!thumbnail) return;
      objectUrl = URL.createObjectURL(
        new Blob([new Uint8Array(thumbnail.bytes)], { type: thumbnail.mediaType }),
      );
      if (disposed) URL.revokeObjectURL(objectUrl);
      else setThumbnailUrl(objectUrl);
    });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [controller, target.location, target.spec, target.template?.thumbnail]);

  function resetReview() {
    if (plan) setPlan(null);
    if (error) setError("");
    controller.clearPackageError();
  }

  async function chooseLocation() {
    const selected = await controller.chooseTemplateParent();
    if (!selected) return;
    setParentPath(selected);
    resetReview();
  }

  async function createProject(merge: boolean) {
    setError("");
    try {
      await controller.createTemplateProject(
        target.spec,
        target.location,
        parentPath,
        projectName.trim(),
        merge,
      );
    } catch (caught) {
      setError(String(caught));
    }
  }

  async function reviewDestination(event: React.FormEvent) {
    event.preventDefault();
    if (!parentPath || !validProjectName) return;
    setError("");
    try {
      const nextPlan = await controller.preflightTemplateProject(
        target.spec,
        target.location,
        parentPath,
        projectName.trim(),
      );
      if (nextPlan.requiresMerge) setPlan(nextPlan);
      else await createProject(false);
    } catch (caught) {
      setError(String(caught));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{plan ? "Merge template into project?" : "Create from template"}</DialogTitle>
          <DialogDescription>
            {plan
              ? `${plan.destination} already contains files.`
              : `${target.spec} uses ${target.template?.entrypoint ?? "its template entrypoint"}.`}
          </DialogDescription>
        </DialogHeader>

        {plan ? (
          <div className="grid gap-5">
            <div className="flex items-start gap-3 border-y py-4">
              <WarningCircleIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Existing files will be kept</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Vellum will copy missing template files and skip every conflicting path. Nothing
                  already in the destination will be overwritten.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 divide-x border-y">
              <div className="py-3 pr-3">
                <p className="text-xs text-muted-foreground">Existing</p>
                <p className="mt-1 font-mono text-lg font-medium">{plan.destinationFileCount}</p>
              </div>
              <div className="px-3 py-3">
                <p className="text-xs text-muted-foreground">To create</p>
                <p className="mt-1 font-mono text-lg font-medium">{plan.filesToCreate}</p>
              </div>
              <div className="py-3 pl-3">
                <p className="text-xs text-muted-foreground">Conflicts</p>
                <p className="mt-1 font-mono text-lg font-medium">{plan.conflicts.length}</p>
              </div>
            </div>

            {plan.conflicts.length ? (
              <div>
                <p className="text-sm font-medium">Files that will be skipped</p>
                <div className="mt-2 max-h-32 overflow-y-auto border-y py-2">
                  {plan.conflicts.slice(0, 20).map((path) => (
                    <p key={path} className="truncate py-1 font-mono text-xs text-muted-foreground">
                      {path}
                    </p>
                  ))}
                  {plan.conflicts.length > 20 ? (
                    <p className="py-1 text-xs text-muted-foreground">
                      {plan.conflicts.length - 20} more conflicts
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <form id="template-project-form" onSubmit={reviewDestination} className="grid gap-5">
            {thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt={`${target.name} template preview`}
                className="max-h-56 w-full border bg-muted/30 object-contain"
              />
            ) : null}

            <label className="grid gap-2 text-sm font-medium">
              Project name
              <Input
                value={projectName}
                onChange={(event) => {
                  setProjectName(event.target.value);
                  resetReview();
                }}
                aria-invalid={!validProjectName}
                autoComplete="off"
                disabled={pending}
              />
              <span className="text-xs font-normal leading-5 text-muted-foreground">
                A single folder name without path separators.
              </span>
            </label>

            <div className="grid gap-2">
              <label htmlFor="template-parent" className="text-sm font-medium">
                Location
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="template-parent"
                  value={parentPath}
                  placeholder="Choose a parent folder"
                  readOnly
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="sm:shrink-0"
                  onClick={() => void chooseLocation()}
                  disabled={pending}
                >
                  <FolderOpenIcon data-icon="inline-start" /> Choose folder
                </Button>
              </div>
              {destination ? (
                <p className="break-all font-mono text-xs leading-5 text-muted-foreground">
                  {destination}
                </p>
              ) : null}
            </div>
          </form>
        )}

        {error ? (
          <p className="text-xs leading-5 text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          {plan ? (
            <>
              <Button type="button" variant="outline" onClick={() => setPlan(null)} disabled={pending}>
                <ArrowLeftIcon data-icon="inline-start" /> Back
              </Button>
              <Button type="button" onClick={() => void createProject(true)} disabled={pending}>
                <FilePlusIcon data-icon="inline-start" />
                {pending ? "Creating" : "Merge and open"}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
                Cancel
              </Button>
              <Button
                type="submit"
                form="template-project-form"
                disabled={pending || !parentPath || !validProjectName}
              >
                <FilePlusIcon data-icon="inline-start" />
                {pending ? "Checking" : "Create and open"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
